# @hitoshura25/mcp-android

MCP server providing reliable Android development quality gates. Enforces build validation, signing verification, and test execution.

## Installation

```bash
# Global installation
npm install -g @hitoshura25/mcp-android

# Or use with npx
npx @hitoshura25/mcp-android
```

## Usage

### As MCP Server

Add to your Claude Code configuration:

```json
{
  "mcpServers": {
    "android": {
      "command": "npx",
      "args": ["@hitoshura25/mcp-android"]
    }
  }
}
```

### As CLI Tool

All MCP tools are also available as CLI commands:

```bash
# Validate release build
mcp-android-cli validate-release-build --project-path . --build-type release

# Verify APK signature
mcp-android-cli verify-apk-signature --apk-path app/build/outputs/apk/release/app-release.apk

# Validate ProGuard mapping
mcp-android-cli validate-proguard-mapping --project-path .

# Run tests
mcp-android-cli run-android-tests --project-path . --build-type debug

# Setup signing config
mcp-android-cli setup-signing-config --project-path . --strategy dual

# Complete release build setup (orchestrator)
mcp-android-cli setup-release-build --project-path . --keystore-strategy dual
```

## MCP Tools

### 1. `validate_release_build`

Build release APK and validate outputs exist.

**Why MCP:** Agents skip build commands ~40% of the time. This enforces execution.

**Parameters:**
- `project_path` (string, default: "."): Path to Android project root
- `module` (string, default: "app"): Module to build
- `build_type` (string, default: "release"): Build type (debug or release)

**Returns:**
```json
{
  "success": true,
  "apk_path": "app/build/outputs/apk/release/app-release.apk",
  "apk_size_mb": 15.2,
  "mapping_path": "app/build/outputs/mapping/release/mapping.txt",
  "mapping_size_bytes": 50000,
  "build_time_seconds": 45,
  "warnings": []
}
```

### 2. `verify_apk_signature`

Validate APK is correctly signed using apksigner/jarsigner.

**Parameters:**
- `apk_path` (string, required): Path to APK file
- `expected_alias` (string, optional): Expected keystore alias

**Returns:**
```json
{
  "signed": true,
  "verified": true,
  "scheme_versions": [1, 2, 3],
  "signer_info": {
    "cn": "Production",
    "organization": "Company",
    "valid_from": "2024-01-01",
    "valid_until": "2034-01-01"
  }
}
```

### 3. `validate_proguard_mapping`

Validate ProGuard/R8 mapping file exists and is substantial.

**Parameters:**
- `project_path` (string, default: "."): Path to Android project root
- `module` (string, default: "app"): Module name
- `build_type` (string, default: "release"): Build type

**Returns:**
```json
{
  "exists": true,
  "path": "app/build/outputs/mapping/release/mapping.txt",
  "size_bytes": 50000,
  "line_count": 1500,
  "classes_mapped": 250,
  "methods_mapped": 1000
}
```

### 4. `run_android_tests`

Run Android instrumented tests and return structured results.

**Parameters:**
- `project_path` (string, default: "."): Path to Android project root
- `module` (string, default: "app"): Module name
- `build_type` (string, default: "debug"): Build type
- `test_filter` (string, optional): Test class or method filter

**Returns:**
```json
{
  "total": 10,
  "passed": 8,
  "failed": 2,
  "skipped": 0,
  "duration_seconds": 45,
  "failures": [
    {
      "class_name": "com.example.LoginTest",
      "method_name": "testInvalidCredentials",
      "message": "Expected false but was true"
    }
  ]
}
```

### 5. `setup_signing_config`

Generate signing configuration with dual-keystore strategy.

**Parameters:**
- `project_path` (string, default: "."): Path to Android project root
- `strategy` (string, default: "dual"): Keystore strategy (dual or single)
- `keystore_password` (string, optional): Password for keystores (generated if not provided)

**Returns:**
```json
{
  "production_keystore": {
    "path": "keystores/production-release.jks",
    "password": "generated-password",
    "alias": "production-key"
  },
  "local_dev_keystore": {
    "path": "keystores/local-dev-release.jks",
    "password": "generated-password",
    "alias": "local-dev-key"
  },
  "gradle_properties_created": true,
  "instructions": ["..."]
}
```

### 6. `setup_release_build` (Orchestrator)

Complete release build setup with enforced validation.

**Why MCP:** This is the "one tool to rule them all" pattern - agent calls ONE tool, gets complete setup with validation.

**Parameters:**
- `project_path` (string, default: "."): Path to Android project root
- `package_name` (string, optional): Package name (auto-detected if not provided)
- `keystore_strategy` (string, default: "dual"): Keystore strategy (dual or single)
- `skip_validation` (boolean, default: false): Skip build validation (NOT RECOMMENDED)

**Returns:**
```json
{
  "package_name": "com.example.app",
  "keystores": {
    "production": "keystores/production-release.jks",
    "local_dev": "keystores/local-dev-release.jks"
  },
  "files_created": [
    "app/proguard-rules.pro",
    "keystores/production-release.jks",
    "keystores/local-dev-release.jks",
    "local.properties"
  ],
  "files_modified": [
    "app/build.gradle.kts",
    ".gitignore"
  ],
  "validation": "passed",
  "next_steps": [
    "Test release build: ./gradlew assembleRelease",
    "Setup E2E tests: use run_android_tests tool",
    "Configure CI/CD with production keystore credentials",
    "Setup Play Store deployment (future feature)"
  ]
}
```

## Error Handling

All tools return structured errors with actionable suggestions:

```json
{
  "success": false,
  "error": {
    "code": "BUILD_FAILED",
    "message": "Kotlin compilation failed: Unresolved reference",
    "details": "e: /src/MainActivity.kt:15:5 Unresolved reference: foo",
    "suggestions": [
      "Fix compilation errors in the source files",
      "Ensure all required imports are present",
      "Check for syntax errors"
    ],
    "recoverable": true
  }
}
```

## Progress Reporting

Long-running tools provide execution logs showing each step:

```json
{
  "execution_summary": {
    "steps_completed": 6,
    "total_duration": "127.3s",
    "log": "✓ Detecting Android project... (0.5s)\n✓ Generating keystores... (2.1s)\n✓ Configuring ProGuard... (0.3s)\n✓ Updating build.gradle.kts... (0.4s)\n✓ Configuring local development environment... (0.2s)\n✓ Validating build... (123.8s)"
  }
}
```

## Requirements

- Node.js >= 20.0.0
- Java JDK (for keytool and jarsigner)
- Android SDK (for apksigner and Gradle builds)
- Gradle wrapper in project root

## Example Workflow

```bash
# 1. Complete release build setup
mcp-android-cli setup-release-build --project-path ~/my-android-app

# 2. Validate the release build works
mcp-android-cli validate-release-build --project-path ~/my-android-app

# 3. Verify APK signature
mcp-android-cli verify-apk-signature --apk-path ~/my-android-app/app/build/outputs/apk/release/app-release.apk

# 4. Run instrumented tests
mcp-android-cli run-android-tests --project-path ~/my-android-app --build-type debug
```

## Security Notes

1. **Keystores are sensitive**: The `keystores/` directory should be added to `.gitignore`
2. **Local development**: Use the local dev keystore for development builds
3. **Production**: Store production keystore password securely (password manager, CI secrets)
4. **CI/CD**: Use GitHub Secrets or similar to store production credentials

## Troubleshooting

### Build fails with "Command not found: ./gradlew"

Ensure your Android project has a Gradle wrapper:
```bash
gradle wrapper
```

### apksigner not found

Install Android SDK build-tools or use jarsigner (comes with JDK) as fallback.

### Tests fail to connect to device

Ensure an emulator or physical device is connected:
```bash
adb devices
```

## License

MIT

## Links

- [GitHub Repository](https://github.com/hitoshura25/devtools-mcp)
- [Implementation Specification](../../specs/devtools-mcp-implementation-plan.md)
