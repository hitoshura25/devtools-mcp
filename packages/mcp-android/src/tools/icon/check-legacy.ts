import { execCommand, ToolResult } from '@hitoshura25/core';
import { getIconContext, updateIconContext, IconWorkflowState, canTransition } from '../../state/icon-workflow.js';

export interface CheckLegacyResult {
  status: 'confirmation_required' | 'no_legacy_icons' | 'invalid_state';
  legacy_files?: string[];
  message?: string;
  next?: string;
  error?: string;
  current_state?: string;
  required_state?: string;
}

export async function iconCheckLegacy(): Promise<ToolResult<CheckLegacyResult>> {
  const startTime = Date.now();
  const steps: string[] = [];
  const ctx = getIconContext();

  // Check state
  if (!canTransition(ctx.state, 'icon_check_legacy')) {
    return {
      success: false,
      error: {
        code: 'INVALID_STATE',
        message: `Cannot check legacy from state: ${ctx.state}`,
        details: `Current state: ${ctx.state}, required state: ${IconWorkflowState.PREFLIGHT_PASSED}`,
        suggestions: ['Call icon_preflight_check() first'],
        recoverable: true,
      },
      duration_ms: Date.now() - startTime,
      steps_completed: steps,
      data: {
        status: 'invalid_state',
        error: 'Invalid state',
        current_state: ctx.state,
        required_state: IconWorkflowState.PREFLIGHT_PASSED,
        message: 'Call icon_preflight_check() first',
      },
    };
  }

  const projectPath = ctx.projectPath || '.';
  steps.push('state_validated');

  // Find legacy icons in mipmap-*dpi directories
  const searchPatterns = [
    'ic_launcher.webp',
    'ic_launcher.png',
    'ic_launcher_foreground.webp',
    'ic_launcher_foreground.png',
    'ic_launcher_round.webp',
    'ic_launcher_round.png',
  ];

  const legacyFiles: string[] = [];

  for (const pattern of searchPatterns) {
    try {
      const result = await execCommand(
        `find "${projectPath}/app/src/main/res" -type d -name "mipmap-*dpi" -exec find {} -name "${pattern}" \\; 2>/dev/null || true`,
        { timeout: 10000 }
      );

      if (result.exitCode === 0 && result.stdout.trim()) {
        const files = result.stdout.trim().split('\n').filter(Boolean);
        legacyFiles.push(...files);
      }
    } catch {
      // Ignore errors
    }
  }

  steps.push('legacy_files_scanned');

  // Remove duplicates and make paths relative
  const uniqueFiles = [...new Set(legacyFiles)].map((file) => {
    if (file.startsWith(projectPath)) {
      return file.slice(projectPath.length + 1);
    }
    return file;
  });

  if (uniqueFiles.length === 0) {
    // No legacy icons found
    updateIconContext({
      state: IconWorkflowState.LEGACY_RESOLVED,
      legacyFiles: [],
    });

    steps.push('state_updated');

    return {
      success: true,
      data: {
        status: 'no_legacy_icons',
        next: 'Call icon_search(term) to search for icons',
      },
      duration_ms: Date.now() - startTime,
      steps_completed: steps,
    };
  }

  // Legacy icons found
  updateIconContext({
    state: IconWorkflowState.AWAITING_LEGACY_CONFIRMATION,
    legacyFiles: uniqueFiles,
  });

  steps.push('state_updated');

  return {
    success: true,
    data: {
      status: 'confirmation_required',
      legacy_files: uniqueFiles,
      message: `Found ${uniqueFiles.length} legacy icon files. These are not needed for minSdk 26+ (VectorDrawables are used instead).`,
      next: 'Call icon_confirm_delete_legacy(true) to delete, or icon_confirm_delete_legacy(false) to keep them',
    },
    duration_ms: Date.now() - startTime,
    steps_completed: steps,
  };
}
