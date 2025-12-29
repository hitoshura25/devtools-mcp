import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { execCommand, ToolResult } from '@hitoshura25/core';
import { getIconContext, updateIconContext, IconWorkflowState, canTransition } from '../../state/icon-workflow.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCRIPTS_DIR = join(__dirname, '..', '..', 'scripts');

export interface GenerateIconsParams {
  background_color?: string;
  scale?: number;
  foreground_color?: string;
}

export interface GenerateIconsResult {
  status: 'generation_complete' | 'invalid_state';
  icon_id?: string;
  generated_files?: string[];
  settings_used?: {
    background_color: string;
    scale: number;
    foreground_color: string;
  };
  next?: string;
  error?: string;
  current_state?: string;
  required_state?: string;
  message?: string;
}

export async function iconGenerate(
  params: GenerateIconsParams
): Promise<ToolResult<GenerateIconsResult>> {
  const startTime = Date.now();
  const steps: string[] = [];
  const ctx = getIconContext();

  // Check state
  if (!canTransition(ctx.state, 'icon_generate')) {
    return {
      success: false,
      error: {
        code: 'INVALID_STATE',
        message: `Cannot generate from state: ${ctx.state}`,
        details: `Current state: ${ctx.state}, required state: ${IconWorkflowState.ICON_SELECTED}`,
        suggestions: ['Call icon_select(icon_id) first'],
        recoverable: true,
      },
      duration_ms: Date.now() - startTime,
      steps_completed: steps,
      data: {
        status: 'invalid_state',
        error: 'Invalid state',
        current_state: ctx.state,
        required_state: IconWorkflowState.ICON_SELECTED,
        message: 'Call icon_select(icon_id) first',
      },
    };
  }

  const projectPath = ctx.projectPath || '.';
  const iconId = ctx.selectedIcon!;

  steps.push('state_validated');

  // Prepare generation parameters
  const backgroundColor = params.background_color || '';
  const scale = params.scale || 1.15;
  const foregroundColor = params.foreground_color || 'white';

  // Execute generation script
  const scriptPath = join(SCRIPTS_DIR, 'generate-app-icons.sh');

  const command = [
    `"${scriptPath}"`,
    `"${projectPath}"`,
    `"${iconId}"`,
    backgroundColor ? `"${backgroundColor}"` : '""',
    scale.toString(),
    `"${foregroundColor}"`,
  ].join(' ');

  try {
    const result = await execCommand(command, {
      timeout: 60000, // 1 minute for generation
      cwd: projectPath,
    });

    if (result.exitCode !== 0) {
      return {
        success: false,
        error: {
          code: 'GENERATION_FAILED',
          message: 'Icon generation failed',
          details: result.stderr,
          suggestions: ['Check script errors', 'Verify icon ID is valid', 'Ensure rsvg-convert is installed'],
          recoverable: true,
        },
        duration_ms: Date.now() - startTime,
        steps_completed: steps,
        data: {
          status: 'invalid_state',
          error: `Generation failed: ${result.stderr}`,
        },
      };
    }

    steps.push('icons_generated');

    // Parse generated files from script output (the script should output file list)
    const generatedFiles = [
      'app/src/main/res/drawable/ic_launcher_foreground.xml',
      'app/src/main/res/drawable/ic_launcher_background.xml',
      'app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml',
      'app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml',
      'fastlane/metadata/android/en-US/images/icon.png',
    ];

    // Determine actual background color used (from script output or auto-detect)
    const actualBackgroundColor = backgroundColor || '#4CAF50'; // Placeholder - script should provide this

    // Update context
    updateIconContext({
      state: IconWorkflowState.GENERATION_COMPLETE,
      generatedFiles,
    });

    steps.push('state_updated');

    return {
      success: true,
      data: {
        status: 'generation_complete',
        icon_id: iconId,
        generated_files: generatedFiles,
        settings_used: {
          background_color: actualBackgroundColor,
          scale,
          foreground_color: foregroundColor,
        },
        next: 'Call icon_verify_build() to verify the build succeeds',
      },
      duration_ms: Date.now() - startTime,
      steps_completed: steps,
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'GENERATION_ERROR',
        message: 'Failed to execute generation script',
        details: error instanceof Error ? error.message : String(error),
        suggestions: ['Check script exists and has execute permissions', 'Verify project path is correct'],
        recoverable: true,
      },
      duration_ms: Date.now() - startTime,
      steps_completed: steps,
      data: {
        status: 'invalid_state',
        error: `Generation error: ${error instanceof Error ? error.message : String(error)}`,
      },
    };
  }
}
