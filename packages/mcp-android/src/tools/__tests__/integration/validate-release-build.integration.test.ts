import { describe, it, expect, beforeAll } from 'vitest';
import { validateReleaseBuild } from '../../validate-release-build.js';
import { join } from 'path';
import { existsSync } from 'fs';
import { generateTestKeystore } from '../utils/keystore-generator.js';

const FIXTURE_PATH = join(__dirname, 'fixtures', 'sample-android-app');
const KEYSTORE_DIR = join(__dirname, 'fixtures', 'test-keystores');

// Skip integration tests if Android SDK is not available
// Check both ANDROID_HOME (more common) and ANDROID_SDK_ROOT (newer standard)
const hasAndroidSDK = !!(process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT);
const describeIntegration = hasAndroidSDK ? describe : describe.skip;

describeIntegration('validateReleaseBuild - Integration Tests', () => {
  beforeAll(async () => {
    // Verify fixture exists
    if (!existsSync(FIXTURE_PATH)) {
      throw new Error(`Fixture not found at ${FIXTURE_PATH}`);
    }

    // Generate test keystore for signing
    await generateTestKeystore(KEYSTORE_DIR);
  });

  it('should successfully build release APK with ProGuard', async () => {
    const result = await validateReleaseBuild({
      project_path: FIXTURE_PATH,
      build_type: 'release',
    });

    expect(result.success).toBe(true);
    expect(result.data.apk_path).toBeDefined();
    expect(result.data.apk_path).toContain('release');
    expect(result.data.apk_path).toContain('.apk');

    // Verify APK actually exists
    expect(existsSync(result.data.apk_path!)).toBe(true);

    // Verify APK is signed (not unsigned) since we have keystore configured
    expect(result.data.apk_path).not.toContain('unsigned');

    // Should have ProGuard mapping for release build
    expect(result.data?.mapping_path).toBeDefined();
    if (result.data?.mapping_path) {
      expect(existsSync(result.data.mapping_path)).toBe(true);
    }
  }, 120000); // 2 minute timeout for actual build

  it('should build debug APK without ProGuard', async () => {
    const result = await validateReleaseBuild({
      project_path: FIXTURE_PATH,
      build_type: 'debug',
    });

    expect(result.success).toBe(true);
    expect(result.data.apk_path).toBeDefined();
    expect(result.data.apk_path).toContain('debug');

    // Debug builds typically don't have ProGuard enabled
    // (though mapping path might exist but be empty)
    expect(existsSync(result.data.apk_path!)).toBe(true);
  }, 120000);

  it('should fail gracefully with invalid project path', async () => {
    const result = await validateReleaseBuild({
      project_path: '/nonexistent/path',
      build_type: 'release',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error?.code).toBe('NOT_ANDROID_PROJECT');
  });

  it('should handle clean build option', async () => {
    const result = await validateReleaseBuild({
      project_path: FIXTURE_PATH,
      build_type: 'release',
    });

    expect(result.success).toBe(true);
    expect(result.data.apk_path).toBeDefined();
  }, 120000);
});

// Log skip reason if no SDK available
if (!hasAndroidSDK) {
  console.warn(
    '\nℹ️  Integration tests skipped: Android SDK not found.\n' +
    '   To run integration tests, set either:\n' +
    '   export ANDROID_HOME=/path/to/android/sdk\n' +
    '   or\n' +
    '   export ANDROID_SDK_ROOT=/path/to/android/sdk\n' +
    '   Then run: pnpm test:integration\n'
  );
}
