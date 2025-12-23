import { execCommand, parseGradleError, ToolResult, detectAndroidProject } from '@hitoshura25/core';
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

  // 1. Verify project structure
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

  // 2. Run gradle build (CANNOT BE SKIPPED)
  const buildCmd = `./gradlew assemble${capitalize(buildType)}`;
  const buildResult = await execCommand(buildCmd, {
    cwd: projectPath,
    timeout: 300000, // 5 minutes
  });

  if (buildResult.exitCode !== 0) {
    const parsed = parseGradleError(buildResult.stderr);
    return {
      success: false,
      error: {
        code: 'BUILD_FAILED',
        message: parsed.message,
        details: buildResult.stderr.slice(-2000),
        suggestions: parsed.suggestions,
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
