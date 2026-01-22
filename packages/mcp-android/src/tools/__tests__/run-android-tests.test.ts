import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runAndroidTests } from '../run-android-tests.js';
import * as core from '@hitoshura25/core';

vi.mock('@hitoshura25/core', async () => {
  const actual = await vi.importActual('@hitoshura25/core');
  return {
    ...actual,
    execCommandSafe: vi.fn(),
  };
});

describe('runAndroidTests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should run tests successfully', async () => {
    vi.mocked(core.execCommandSafe).mockResolvedValue({
      exitCode: 0,
      stdout: `
        10 tests completed
        10 tests passed
        0 tests failed
        0 tests skipped
      `,
      stderr: '',
      durationMs: 30000,
      timedOut: false,
    });

    const result = await runAndroidTests({
      project_path: '/fake/project',
      module: 'app',
      build_type: 'debug',
    });

    expect(result.success).toBe(true);
    expect(result.data?.total).toBeGreaterThanOrEqual(0);
    expect(result.data?.duration_seconds).toBeGreaterThanOrEqual(0);
  });

  it('should handle test failures', async () => {
    vi.mocked(core.execCommandSafe).mockResolvedValue({
      exitCode: 1,
      stdout: `
        com.example.LoginTest#testInvalidCredentials FAILED
        com.example.ProfileTest#testUpdateProfile FAILED
        2 tests completed
        0 passed
        2 failed
      `,
      stderr: 'Test execution failed',
      durationMs: 20000,
      timedOut: false,
    });

    const result = await runAndroidTests({
      project_path: '/fake/project',
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('TESTS_FAILED');
    expect(result.data?.failures).toBeDefined();
    expect(result.data?.failures?.length).toBeGreaterThan(0);
  });

  it('should support test filtering', async () => {
    vi.mocked(core.execCommandSafe).mockResolvedValue({
      exitCode: 0,
      stdout: '1 tests completed',
      stderr: '',
      durationMs: 5000,
      timedOut: false,
    });

    await runAndroidTests({
      project_path: '/fake/project',
      test_filter: 'com.example.LoginTest',
    });

    // execCommandSafe takes (command, args[], options)
    expect(core.execCommandSafe).toHaveBeenCalledWith(
      './gradlew',
      expect.arrayContaining(['--tests', 'com.example.LoginTest']),
      expect.any(Object)
    );
  });

  it('should parse test results from output', async () => {
    vi.mocked(core.execCommandSafe).mockResolvedValue({
      exitCode: 0,
      stdout: `
        Starting tests
        com.example.Test1#method1 PASSED
        com.example.Test1#method2 PASSED
        5 tests
        5 passed
        0 failed
        0 skipped
      `,
      stderr: '',
      durationMs: 15000,
      timedOut: false,
    });

    const result = await runAndroidTests({
      project_path: '/fake/project',
    });

    expect(result.success).toBe(true);
    expect(result.data?.passed).toBeGreaterThanOrEqual(0);
    expect(result.data?.failed).toBe(0);
  });
});
