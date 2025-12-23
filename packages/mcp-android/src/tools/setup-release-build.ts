import { detectAndroidProject, ToolResult, createProgressReporter, ProgressContext } from '@hitoshura25/core';
import { setupSigningConfig, SetupSigningParams } from './setup-signing-config.js';
import { validateReleaseBuild } from './validate-release-build.js';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

export interface SetupReleaseBuildParams {
  project_path?: string;
  package_name?: string;
  keystore_strategy?: 'dual' | 'single';
  skip_validation?: boolean;
}

export interface SetupReleaseBuildResult {
  package_name: string;
  keystores: {
    production: string;
    local_dev?: string;
  };
  files_created: string[];
  files_modified: string[];
  validation: 'passed' | 'failed' | 'skipped';
  next_steps: string[];
}

function createProguardRules(projectPath: string, moduleName: string = 'app'): void {
  const proguardRulesPath = join(projectPath, moduleName, 'proguard-rules.pro');

  const defaultRules = `# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in the Android SDK.

# Uncomment this to preserve the line number information for
# debugging stack traces.
-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# Keep common Android classes
-keep public class * extends android.app.Activity
-keep public class * extends android.app.Application
-keep public class * extends android.app.Service
-keep public class * extends android.content.BroadcastReceiver
-keep public class * extends android.content.ContentProvider

# Keep native methods
-keepclasseswithmembernames class * {
    native <methods>;
}

# Keep custom views
-keepclasseswithmembers class * {
    public <init>(android.content.Context, android.util.AttributeSet);
}

# Keep enums
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}

# Keep Parcelable implementations
-keepclassmembers class * implements android.os.Parcelable {
    public static final ** CREATOR;
}
`;

  if (!existsSync(proguardRulesPath)) {
    writeFileSync(proguardRulesPath, defaultRules);
  }
}

function updateBuildGradle(projectPath: string, moduleName: string = 'app'): boolean {
  const buildGradleKts = join(projectPath, moduleName, 'build.gradle.kts');
  const buildGradle = join(projectPath, moduleName, 'build.gradle');

  const isKotlin = existsSync(buildGradleKts);
  const buildFilePath = isKotlin ? buildGradleKts : buildGradle;

  if (!existsSync(buildFilePath)) {
    return false;
  }

  let content = readFileSync(buildFilePath, 'utf-8');

  // Check if signing config already exists
  if (content.includes('signingConfigs')) {
    return false; // Already configured
  }

  // Add signing configuration
  const signingConfig = isKotlin
    ? `
    signingConfigs {
        create("release") {
            storeFile = file(project.findProperty("KEYSTORE_PATH") as String? ?: "../keystores/local-dev-release.jks")
            storePassword = project.findProperty("KEYSTORE_PASSWORD") as String? ?: ""
            keyAlias = project.findProperty("KEY_ALIAS") as String? ?: "local-dev-key"
            keyPassword = project.findProperty("KEYSTORE_PASSWORD") as String? ?: ""
        }
    }
`
    : `
    signingConfigs {
        release {
            storeFile file(project.findProperty("KEYSTORE_PATH") ?: "../keystores/local-dev-release.jks")
            storePassword project.findProperty("KEYSTORE_PASSWORD") ?: ""
            keyAlias project.findProperty("KEY_ALIAS") ?: "local-dev-key"
            keyPassword project.findProperty("KEYSTORE_PASSWORD") ?: ""
        }
    }
`;

  // Insert signing config before buildTypes
  const buildTypesIndex = content.indexOf('buildTypes');
  if (buildTypesIndex !== -1) {
    content = content.slice(0, buildTypesIndex) + signingConfig + '\n    ' + content.slice(buildTypesIndex);
  }

  // Update release build type to use signing config and enable minification
  if (isKotlin) {
    content = content.replace(
      /release\s*{([^}]*)}/,
      `release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.getByName("release")
        }`
    );
  } else {
    content = content.replace(
      /release\s*{([^}]*)}/,
      `release {
            minifyEnabled true
            shrinkResources true
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
            signingConfig signingConfigs.release
        }`
    );
  }

  writeFileSync(buildFilePath, content);
  return true;
}

export async function setupReleaseBuild(
  params: SetupReleaseBuildParams,
  context?: ProgressContext
): Promise<ToolResult<SetupReleaseBuildResult>> {
  const startTime = Date.now();
  const projectPath = params.project_path || '.';

  // Create progress reporter
  const progress = context ? createProgressReporter(context, 6) : null;

  try {
    // Step 1: Detect project
    progress?.stepCompleted('Detecting Android project');
    const projectInfo = await detectAndroidProject(projectPath);

    if (!projectInfo) {
      return {
        success: false,
        error: {
          code: 'NOT_ANDROID_PROJECT',
          message: 'No Android project found at path',
          details: `Path: ${projectPath}`,
          suggestions: [
            'Ensure this is an Android project directory',
            'Check that AndroidManifest.xml exists',
            'Verify build.gradle.kts or build.gradle exists',
          ],
          recoverable: false,
        },
        duration_ms: Date.now() - startTime,
        steps_completed: ['detect_project_failed'],
        execution_log: progress?.getExecutionLog(),
      };
    }

    const packageName = params.package_name || projectInfo.packageName;
    const filesCreated: string[] = [];
    const filesModified: string[] = [];

    // Step 2: Generate keystores
    progress?.stepCompleted('Generating keystores', { strategy: params.keystore_strategy });
    const signingParams: SetupSigningParams = {
      project_path: projectPath,
      strategy: params.keystore_strategy || 'dual',
    };

    const signingResult = await setupSigningConfig(signingParams);

    if (!signingResult.success) {
      return {
        success: false,
        error: signingResult.error,
        duration_ms: Date.now() - startTime,
        steps_completed: ['detect_project', 'setup_signing_failed'],
        execution_log: progress?.getExecutionLog(),
      };
    }

    filesCreated.push(signingResult.data!.production_keystore.path);
    if (signingResult.data!.local_dev_keystore) {
      filesCreated.push(signingResult.data!.local_dev_keystore.path);
    }
    if (signingResult.data!.gradle_properties_created) {
      filesCreated.push(join(projectPath, 'local.properties'));
    }

    // Step 3: Configure ProGuard
    progress?.stepCompleted('Configuring ProGuard');
    createProguardRules(projectPath, 'app');
    const proguardPath = join(projectPath, 'app', 'proguard-rules.pro');
    if (existsSync(proguardPath)) {
      filesCreated.push(proguardPath);
    }

    // Step 4: Update build.gradle.kts
    progress?.stepCompleted('Updating build.gradle.kts');
    const buildUpdated = updateBuildGradle(projectPath, 'app');
    if (buildUpdated) {
      const buildGradlePath = existsSync(join(projectPath, 'app', 'build.gradle.kts'))
        ? join(projectPath, 'app', 'build.gradle.kts')
        : join(projectPath, 'app', 'build.gradle');
      filesModified.push(buildGradlePath);
    }

    // Step 5: Ensure .gitignore includes sensitive files
    progress?.stepCompleted('Configuring .gitignore');
    const gitignorePath = join(projectPath, '.gitignore');
    if (existsSync(gitignorePath)) {
      let gitignoreContent = readFileSync(gitignorePath, 'utf-8');
      let modified = false;

      if (!gitignoreContent.includes('keystores/')) {
        gitignoreContent += '\n# Keystores\nkeystores/\n';
        modified = true;
      }

      if (!gitignoreContent.includes('local.properties')) {
        gitignoreContent += '\nlocal.properties\n';
        modified = true;
      }

      if (modified) {
        writeFileSync(gitignorePath, gitignoreContent);
        filesModified.push(gitignorePath);
      }
    }

    // Step 6: Validate build (unless explicitly skipped)
    let validationStatus: 'passed' | 'failed' | 'skipped' = 'skipped';

    if (!params.skip_validation) {
      progress?.stepCompleted('Validating build (this may take 1-2 minutes)');
      const validation = await validateReleaseBuild({
        project_path: projectPath,
        build_type: 'release',
      });

      if (!validation.success) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_FAILED',
            message: 'Release build setup completed but validation failed',
            details: validation.error?.message,
            suggestions: [
              'Check ProGuard rules for missing keep directives',
              'Verify signing configuration in local.properties',
              ...(validation.error?.suggestions ?? []),
            ],
            recoverable: true,
          },
          duration_ms: Date.now() - startTime,
          steps_completed: ['detect_project', 'setup_signing', 'configure_proguard', 'update_build', 'validation_failed'],
          execution_log: progress?.getExecutionLog(),
        };
      }

      validationStatus = 'passed';
    }

    // Success!
    return {
      success: true,
      data: {
        package_name: packageName,
        keystores: {
          production: signingResult.data!.production_keystore.path,
          local_dev: signingResult.data!.local_dev_keystore?.path,
        },
        files_created: filesCreated,
        files_modified: filesModified,
        validation: validationStatus,
        next_steps: [
          'Test release build: ./gradlew assembleRelease',
          'Setup E2E tests: use run_android_tests tool',
          'Configure CI/CD with production keystore credentials',
          'Setup Play Store deployment (future feature)',
        ],
      },
      duration_ms: Date.now() - startTime,
      steps_completed: ['complete'],
      execution_log: progress?.getExecutionLog(),
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'UNEXPECTED_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        suggestions: ['Check error details', 'Verify project structure', 'Try again'],
        recoverable: false,
      },
      duration_ms: Date.now() - startTime,
      steps_completed: ['error'],
      execution_log: progress?.getExecutionLog(),
    };
  }
}
