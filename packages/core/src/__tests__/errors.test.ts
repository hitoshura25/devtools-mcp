import { describe, it, expect } from 'vitest';
import { parseGradleError, parseTestFailure } from '../errors.js';

describe('parseGradleError', () => {
  it('should parse compilation errors', () => {
    const stderr = `
      > Task :app:compileReleaseKotlin FAILED
      e: /src/MainActivity.kt:15:5 Unresolved reference: foo
      e: /src/MainActivity.kt:20:10 Type mismatch
    `;

    const parsed = parseGradleError(stderr);

    expect(parsed.type).toBe('compilation');
    expect(parsed.file).toBe('/src/MainActivity.kt');
    expect(parsed.line).toBe(15);
    expect(parsed.suggestions).toContain('Fix compilation errors in the source files');
  });

  it('should parse dependency resolution errors', () => {
    const stderr = `
      > Could not resolve com.example:library:1.0.0
      Required by: project :app
    `;

    const parsed = parseGradleError(stderr);

    expect(parsed.type).toBe('dependency');
    expect(parsed.suggestions).toContain('Check if dependency exists in configured repositories');
    expect(parsed.suggestions).toContain('Verify network connectivity');
  });

  it('should parse ProGuard errors', () => {
    const stderr = `
      Error: R8: can't find referenced class com.example.MyClass
      R8: Compilation failed
    `;

    const parsed = parseGradleError(stderr);

    expect(parsed.type).toBe('proguard');
    expect(parsed.message).toContain('MyClass');
    expect(parsed.suggestions.some(s => s.includes('keep rule'))).toBe(true);
  });

  it('should parse signing errors', () => {
    const stderr = `
      Execution failed for task ':app:signReleaseBundle'.
      > A failure occurred while executing com.android.build.gradle.internal.tasks
      > KeyStore not found at path: keystores/release.jks
    `;

    const parsed = parseGradleError(stderr);

    expect(parsed.type).toBe('signing');
    expect(parsed.suggestions).toContain('Verify keystore path in signing config');
    expect(parsed.suggestions).toContain('Check gradle.properties for signing credentials');
  });

  it('should handle unknown errors', () => {
    const stderr = 'Some unknown error message';

    const parsed = parseGradleError(stderr);

    expect(parsed.type).toBe('unknown');
    expect(parsed.suggestions).toContain('Check the full error output');
  });
});

describe('parseTestFailure', () => {
  it('should parse test failure output', () => {
    const output = 'com.example.LoginTest#testInvalidCredentials FAILED';

    const parsed = parseTestFailure(output);

    expect(parsed.type).toBe('test_failure');
    expect(parsed.file).toBe('com.example.LoginTest');
    expect(parsed.suggestions).toContain('Review test failure details');
  });

  it('should handle output without specific test info', () => {
    const output = 'Tests failed with unknown error';

    const parsed = parseTestFailure(output);

    expect(parsed.type).toBe('test_failure');
    expect(parsed.suggestions.length).toBeGreaterThan(0);
  });
});
