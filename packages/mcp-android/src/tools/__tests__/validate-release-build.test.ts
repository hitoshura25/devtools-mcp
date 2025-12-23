import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateReleaseBuild } from '../validate-release-build.js';
import * as core from '@hitoshura25/core';
import * as fs from 'fs';

// Mock dependencies
vi.mock('@hitoshura25/core', async () => {
  const actual = await vi.importActual('@hitoshura25/core');
  return {
    ...actual,
    execCommand: vi.fn(),
    detectAndroidProject: vi.fn(),
  };
});

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  statSync: vi.fn(),
}));

describe('validateReleaseBuild', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should succeed when build passes and APK exists', async () => {
    // Mock Android project detection
    vi.mocked(core.detectAndroidProject).mockResolvedValue({
      packageName: 'com.example.app',
      minSdk: 21,
      targetSdk: 34,
      modules: ['app'],
      hasKotlin: true,
      buildSystem: 'gradle-kotlin',
    });

    // Mock successful gradle execution
    vi.mocked(core.execCommand).mockResolvedValue({
      exitCode: 0,
      stdout: 'BUILD SUCCESSFUL in 45s',
      stderr: '',
      durationMs: 45000,
      timedOut: false,
    });

    // Mock file existence checks
    vi.mocked(fs.existsSync).mockImplementation((path) => {
      const pathStr = path.toString();
      if (pathStr.includes('app-release.apk')) return true;
      if (pathStr.includes('mapping.txt')) return true;
      return false;
    });

    vi.mocked(fs.statSync).mockImplementation((path) => {
      const pathStr = path.toString();
      return {
        size: pathStr.includes('apk') ? 15_000_000 : 50_000,
      } as fs.Stats;
    });

    const result = await validateReleaseBuild({
      project_path: '/fake/project',
      build_type: 'release',
    });

    expect(result.success).toBe(true);
    expect(result.data?.apk_size_mb).toBeCloseTo(14.3, 1);
    expect(result.steps_completed).toContain('build_succeeded');
    expect(result.steps_completed).toContain('apk_verified');
  });

  it('should fail when not an Android project', async () => {
    vi.mocked(core.detectAndroidProject).mockResolvedValue(null);

    const result = await validateReleaseBuild({
      project_path: '/not-android',
      build_type: 'release',
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('NOT_ANDROID_PROJECT');
    expect(result.error?.suggestions).toContain('Ensure build.gradle.kts or build.gradle exists');
  });

  it('should fail with parsed error when build fails', async () => {
    vi.mocked(core.detectAndroidProject).mockResolvedValue({
      packageName: 'com.example.app',
      minSdk: 21,
      targetSdk: 34,
      modules: ['app'],
      hasKotlin: true,
      buildSystem: 'gradle-kotlin',
    });

    // Mock failed gradle execution
    vi.mocked(core.execCommand).mockResolvedValue({
      exitCode: 1,
      stdout: '',
      stderr: `
        > Task :app:compileReleaseKotlin FAILED
        e: /src/MainActivity.kt:15:5 Unresolved reference: foo
      `,
      durationMs: 5000,
      timedOut: false,
    });

    const result = await validateReleaseBuild({
      project_path: '/fake/project',
      build_type: 'release',
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('BUILD_FAILED');
    expect(result.error?.message).toContain('compilation');
  });

  it('should fail when APK not generated', async () => {
    vi.mocked(core.detectAndroidProject).mockResolvedValue({
      packageName: 'com.example.app',
      minSdk: 21,
      targetSdk: 34,
      modules: ['app'],
      hasKotlin: true,
      buildSystem: 'gradle-kotlin',
    });

    vi.mocked(core.execCommand).mockResolvedValue({
      exitCode: 0,
      stdout: 'BUILD SUCCESSFUL',
      stderr: '',
      durationMs: 45000,
      timedOut: false,
    });

    // APK doesn't exist
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const result = await validateReleaseBuild({
      project_path: '/fake/project',
      build_type: 'release',
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('APK_NOT_FOUND');
  });

  it('should warn when ProGuard mapping is too small', async () => {
    vi.mocked(core.detectAndroidProject).mockResolvedValue({
      packageName: 'com.example.app',
      minSdk: 21,
      targetSdk: 34,
      modules: ['app'],
      hasKotlin: true,
      buildSystem: 'gradle-kotlin',
    });

    vi.mocked(core.execCommand).mockResolvedValue({
      exitCode: 0,
      stdout: 'BUILD SUCCESSFUL',
      stderr: '',
      durationMs: 45000,
      timedOut: false,
    });

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockImplementation((path) => {
      const pathStr = path.toString();
      return {
        size: pathStr.includes('mapping.txt') ? 500 : 15_000_000, // Too small!
      } as fs.Stats;
    });

    const result = await validateReleaseBuild({
      project_path: '/fake/project',
      build_type: 'release',
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('PROGUARD_INEFFECTIVE');
  });

  it('should handle debug builds without ProGuard check', async () => {
    vi.mocked(core.detectAndroidProject).mockResolvedValue({
      packageName: 'com.example.app',
      minSdk: 21,
      targetSdk: 34,
      modules: ['app'],
      hasKotlin: true,
      buildSystem: 'gradle-kotlin',
    });

    vi.mocked(core.execCommand).mockResolvedValue({
      exitCode: 0,
      stdout: 'BUILD SUCCESSFUL',
      stderr: '',
      durationMs: 30000,
      timedOut: false,
    });

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockReturnValue({ size: 10_000_000 } as fs.Stats);

    const result = await validateReleaseBuild({
      project_path: '/fake/project',
      build_type: 'debug',
    });

    expect(result.success).toBe(true);
    expect(result.data?.mapping_path).toBeUndefined();
  });
});
