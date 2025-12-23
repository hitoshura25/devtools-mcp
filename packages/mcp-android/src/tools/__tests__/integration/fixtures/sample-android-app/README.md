# Sample Android App - Integration Test Fixture

This is a minimal Android application used for integration testing of the MCP Android tools.

## Structure

- **MainActivity.kt**: Simple activity with no functionality
- **build.gradle.kts**: Configured with ProGuard for release builds
- **AndroidManifest.xml**: Minimal manifest

## Purpose

This fixture is used to test:
- `validate_release_build` - Actual Gradle builds
- `verify_apk_signature` - APK signing verification
- `validate_proguard_mapping` - ProGuard output validation

## Requirements

To run integration tests with this fixture:
- Android SDK installed
- `ANDROID_HOME` or `ANDROID_SDK_ROOT` environment variable set
- Java JDK 17+
- Gradle wrapper (will be downloaded automatically)

## Usage

Integration tests are skipped by default in CI. To run them:

```bash
export ANDROID_HOME=/path/to/android/sdk
# or
export ANDROID_SDK_ROOT=/path/to/android/sdk

pnpm test:integration
```
