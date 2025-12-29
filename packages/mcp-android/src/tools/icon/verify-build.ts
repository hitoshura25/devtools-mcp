import { execCommand, ToolResult } from '@hitoshura25/core';
import { existsSync } from 'fs';
import { join } from 'path';
import { getIconContext, updateIconContext, IconWorkflowState, canTransition } from '../../state/icon-workflow.js';

export interface VerifyBuildResult {
  status: 'verified' | 'verification_failed' | 'invalid_state';
  build_result?: 'success' | 'failed';
  verification?: Record<string, boolean>;
  next?: string;
  error?: string;
  current_state?: string;
  required_state?: string;
  message?: string;
}

export async function iconVerifyBuild(): Promise<ToolResult<VerifyBuildResult>> {
  const startTime = Date.now();
  const steps: string[] = [];
  const ctx = getIconContext();

  // Check state
  if (!canTransition(ctx.state, 'icon_verify_build')) {
    return {
      success: false,
      error: {
        code: 'INVALID_STATE',
        message: `Cannot verify from state: ${ctx.state}`,
        details: `Current state: ${ctx.state}, required state: ${IconWorkflowState.GENERATION_COMPLETE}`,
        suggestions: ['Call icon_generate() first'],
        recoverable: true,
      },
      duration_ms: Date.now() - startTime,
      steps_completed: steps,
      data: {
        status: 'invalid_state',
        error: 'Invalid state',
        current_state: ctx.state,
        required_state: IconWorkflowState.GENERATION_COMPLETE,
        message: 'Call icon_generate() first',
      },
    };
  }

  const projectPath = ctx.projectPath || '.';

  steps.push('state_validated');

  // Verify generated files exist
  const verification: Record<string, boolean> = {};
  const expectedFiles = [
    'app/src/main/res/drawable/ic_launcher_foreground.xml',
    'app/src/main/res/drawable/ic_launcher_background.xml',
    'app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml',
    'app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml',
    'fastlane/metadata/android/en-US/images/icon.png',
  ];

  for (const file of expectedFiles) {
    const fullPath = join(projectPath, file);
    verification[file] = existsSync(fullPath);
  }

  steps.push('files_verified');

  const missingFiles = Object.entries(verification)
    .filter(([_, exists]) => !exists)
    .map(([file]) => file);

  if (missingFiles.length > 0) {
    return {
      success: false,
      error: {
        code: 'FILES_MISSING',
        message: `Generated files not found: ${missingFiles.join(', ')}`,
        details: 'Some icon files were not generated successfully',
        suggestions: ['Re-run icon_generate()', 'Check generation script output for errors'],
        recoverable: true,
      },
      duration_ms: Date.now() - startTime,
      steps_completed: steps,
      data: {
        status: 'verification_failed',
        verification,
        error: `Missing files: ${missingFiles.join(', ')}`,
      },
    };
  }

  // Run debug build to verify icons work
  try {
    const result = await execCommand('./gradlew assembleDebug', {
      cwd: projectPath,
      timeout: 300000, // 5 minutes
    });

    if (result.exitCode !== 0) {
      verification['gradle_build'] = false;

      return {
        success: false,
        error: {
          code: 'BUILD_FAILED',
          message: 'Debug build failed',
          details: result.stderr.slice(-2000),
          recoverable: true,
          suggestions: [
            'Check Gradle errors in the output',
            'Verify XML syntax in generated icon files',
            'Try running ./gradlew clean assembleDebug',
          ],
        },
        duration_ms: Date.now() - startTime,
        steps_completed: steps,
        data: {
          status: 'verification_failed',
          build_result: 'failed',
          verification: { ...verification, gradle_build: false },
          error: 'Build failed',
        },
      };
    }

    verification['gradle_build'] = true;
    steps.push('build_verified');

    // Update state
    updateIconContext({
      state: IconWorkflowState.VERIFIED,
    });

    steps.push('state_updated');

    return {
      success: true,
      data: {
        status: 'verified',
        build_result: 'success',
        verification,
        next: 'Icon generation complete! Call icon_reset_workflow() to start over if needed.',
      },
      duration_ms: Date.now() - startTime,
      steps_completed: steps,
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'BUILD_ERROR',
        message: 'Failed to run build',
        details: error instanceof Error ? error.message : String(error),
        suggestions: ['Check Gradle is installed', 'Verify project path is correct', 'Try running ./gradlew clean'],
        recoverable: true,
      },
      duration_ms: Date.now() - startTime,
      steps_completed: steps,
      data: {
        status: 'verification_failed',
        error: `Build error: ${error instanceof Error ? error.message : String(error)}`,
      },
    };
  }
}
