import { execCommand, parseGradleError, ToolResult, detectAndroidProject, isValidPath, isValidModuleName, isValidBuildType } from '@hitoshura25/core';
import { existsSync, statSync } from 'fs';
import { join } from 'path';

export interface ValidateBuildParams {
  project_path: string;
  module?: string;
  build_type?: 'debug' | 'release';
}

export interface ValidateBuildResult {
  success: boolean;
  apk_path: string;
  apk_size_mb: number;
  mapping_path?: string;
  mapping_size_bytes?: number;
  build_time_seconds: number;
  warnings: string[];
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function extractWarnings(stdout: string): string[] {
  const warnings: string[] = [];
  const lines = stdout.split('\n');

  for (const line of lines) {
    if (line.toLowerCase().includes('warning')) {
      warnings.push(line.trim());
    }
  }

  return warnings;
}

export async function validateReleaseBuild(
  params: ValidateBuildParams
): Promise<ToolResult<ValidateBuildResult>> {
  const startTime = Date.now();
  const steps: string[] = [];
  const projectPath = params.project_path || '.';
  const module = params.module || 'app';
  const buildType = params.build_type || 'release';

  // Validate inputs to prevent command injection
  if (!isValidPath(projectPath)) {
    return {
      success: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'Invalid project path: contains unsafe characters',
        details: 'Project path must only contain alphanumeric characters, dots, dashes, underscores, and forward slashes',
        suggestions: ['Use a path without special characters'],
        recoverable: false,
      },
      duration_ms: Date.now() - startTime,
      steps_completed: steps,
    };
  }

  if (!isValidModuleName(module)) {
    return {
      success: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'Invalid module name: contains unsafe characters',
        details: 'Module name must only contain alphanumeric characters, dashes, and underscores',
        suggestions: ['Use a module name like "app" or "core-library"'],
        recoverable: false,
      },
      duration_ms: Date.now() - startTime,
      steps_completed: steps,
    };
  }

  if (!isValidBuildType(buildType)) {
    return {
      success: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'Invalid build type: must be "debug" or "release"',
        details: `Received: ${buildType}`,
        suggestions: ['Use build_type: "debug" or build_type: "release"'],
        recoverable: false,
      },
      duration_ms: Date.now() - startTime,
      steps_completed: steps,
    };
  }

  // 1. Verify project structure
  console.log(`[validateReleaseBuild] Detecting Android project at ${projectPath}...`);
  const projectInfo = await detectAndroidProject(projectPath);
  if (!projectInfo) {
    return {
      success: false,
      error: {
        code: 'NOT_ANDROID_PROJECT',
        message: 'No Android project found at path',
        details: `Path: ${projectPath}`,
        suggestions: ['Ensure build.gradle.kts or build.gradle exists', 'Check AndroidManifest.xml is present'],
        recoverable: false,
      },
      duration_ms: Date.now() - startTime,
      steps_completed: steps,
    };
  }
  steps.push('project_detected');
  console.log(`[validateReleaseBuild] Project detected, starting ${buildType} build...`);

  // 2. Run gradle build (CANNOT BE SKIPPED)
  const buildCmd = `./gradlew assemble${capitalize(buildType)} --console=plain --no-daemon`;
  console.log(`[validateReleaseBuild] Running: ${buildCmd}`);
  const gradleStart = Date.now();
  const buildResult = await execCommand(buildCmd, {
    cwd: projectPath,
    timeout: 300000, // 5 minutes
  });
  console.log(`[validateReleaseBuild] Gradle build completed in ${Date.now() - gradleStart}ms`);

  // Log Gradle output for debugging (especially useful on CI)
  if (buildResult.stdout) {
    console.log('[validateReleaseBuild] Gradle stdout:');
    console.log(buildResult.stdout);
  }
  if (buildResult.stderr) {
    console.log('[validateReleaseBuild] Gradle stderr:');
    console.log(buildResult.stderr);
  }

  if (buildResult.exitCode !== 0) {
    const parsed = parseGradleError(buildResult.stderr);

    // Log timeout info if build timed out
    if (buildResult.timedOut) {
      console.error('[validateReleaseBuild] ⚠️  Gradle build TIMED OUT after 5 minutes');
      console.error('[validateReleaseBuild] Last stdout:', buildResult.stdout.slice(-1000));
      console.error('[validateReleaseBuild] Last stderr:', buildResult.stderr.slice(-1000));
    }

    return {
      success: false,
      error: {
        code: buildResult.timedOut ? 'BUILD_TIMEOUT' : 'BUILD_FAILED',
        message: buildResult.timedOut ? 'Gradle build timed out after 5 minutes' : parsed.message,
        details: buildResult.stderr.slice(-2000),
        suggestions: buildResult.timedOut
          ? ['Check Gradle daemon logs', 'Verify Android SDK is properly installed', 'Check network connectivity for dependency downloads']
          : parsed.suggestions,
        recoverable: true,
      },
      duration_ms: Date.now() - startTime,
      steps_completed: steps,
    };
  }
  steps.push('build_succeeded');

  // 3. Verify APK exists (CANNOT BE SKIPPED)
  // Try signed APK first, then unsigned
  let apkPath = join(
    projectPath,
    module,
    'build',
    'outputs',
    'apk',
    buildType,
    `${module}-${buildType}.apk`
  );

  if (!existsSync(apkPath)) {
    // Try unsigned APK
    const unsignedApkPath = join(
      projectPath,
      module,
      'build',
      'outputs',
      'apk',
      buildType,
      `${module}-${buildType}-unsigned.apk`
    );

    if (existsSync(unsignedApkPath)) {
      apkPath = unsignedApkPath;
    } else {
      return {
        success: false,
        error: {
          code: 'APK_NOT_FOUND',
          message: `APK not generated at expected paths: ${apkPath} or ${unsignedApkPath}`,
          details: 'Build succeeded but output APK was not found',
          suggestions: [
            'Check build output for warnings',
            'Verify module name is correct',
            'Check if APK is in a different location',
          ],
          recoverable: true,
        },
        duration_ms: Date.now() - startTime,
        steps_completed: steps,
      };
    }
  }
  steps.push('apk_verified');

  // 4. Check ProGuard mapping for release builds
  let mappingPath: string | undefined;
  let mappingSize: number | undefined;

  if (buildType === 'release') {
    mappingPath = join(projectPath, module, 'build', 'outputs', 'mapping', 'release', 'mapping.txt');
    if (existsSync(mappingPath)) {
      mappingSize = statSync(mappingPath).size;
      if (mappingSize < 1000) {
        return {
          success: false,
          error: {
            code: 'PROGUARD_INEFFECTIVE',
            message: `ProGuard mapping file is suspiciously small (${mappingSize} bytes)`,
            details: 'This suggests ProGuard/R8 is not properly minifying the code',
            suggestions: [
              'Verify isMinifyEnabled = true in build.gradle.kts',
              'Check ProGuard rules are not keeping everything',
              'Review minification settings',
            ],
            recoverable: true,
          },
          duration_ms: Date.now() - startTime,
          steps_completed: steps,
        };
      }
      steps.push('proguard_verified');
    }
  }

  // 5. Return success with details
  const apkSize = statSync(apkPath).size / (1024 * 1024);

  return {
    success: true,
    data: {
      success: true,
      apk_path: apkPath,
      apk_size_mb: Math.round(apkSize * 100) / 100,
      mapping_path: mappingPath,
      mapping_size_bytes: mappingSize,
      build_time_seconds: Math.round((Date.now() - startTime) / 1000),
      warnings: extractWarnings(buildResult.stdout),
    },
    duration_ms: Date.now() - startTime,
    steps_completed: steps,
  };
}
