import { execCommand, ToolResult } from '@hitoshura25/core';
import { getIconContext, updateIconContext, IconWorkflowState, canTransition } from '../../state/icon-workflow.js';

export interface ConfirmDeleteLegacyParams {
  confirm: boolean;
}

export interface ConfirmDeleteLegacyResult {
  status: 'legacy_resolved' | 'invalid_state';
  action_taken?: 'deleted' | 'kept';
  files_affected?: number;
  next?: string;
  error?: string;
  current_state?: string;
  required_state?: string;
  message?: string;
}

export async function iconConfirmDeleteLegacy(
  params: ConfirmDeleteLegacyParams
): Promise<ToolResult<ConfirmDeleteLegacyResult>> {
  const startTime = Date.now();
  const steps: string[] = [];
  const ctx = getIconContext();

  // Check state
  if (!canTransition(ctx.state, 'icon_confirm_delete_legacy')) {
    return {
      success: false,
      error: {
        code: 'INVALID_STATE',
        message: `Cannot confirm delete from state: ${ctx.state}`,
        details: `Current state: ${ctx.state}, required state: ${IconWorkflowState.AWAITING_LEGACY_CONFIRMATION}`,
        suggestions: ['Call icon_check_legacy() first'],
        recoverable: true,
      },
      duration_ms: Date.now() - startTime,
      steps_completed: steps,
      data: {
        status: 'invalid_state',
        error: 'Invalid state',
        current_state: ctx.state,
        required_state: IconWorkflowState.AWAITING_LEGACY_CONFIRMATION,
        message: 'Call icon_check_legacy() first',
      },
    };
  }

  const projectPath = ctx.projectPath || '.';
  const legacyFiles = ctx.legacyFiles;

  steps.push('state_validated');

  if (params.confirm) {
    // Delete legacy files
    let deletedCount = 0;

    for (const file of legacyFiles) {
      try {
        const fullPath = file.startsWith('/') ? file : `${projectPath}/${file}`;
        const result = await execCommand(`rm -f "${fullPath}"`, { timeout: 5000 });

        if (result.exitCode === 0) {
          deletedCount++;
        }
      } catch {
        // Ignore errors, continue deleting others
      }
    }

    steps.push('legacy_files_deleted');

    updateIconContext({
      state: IconWorkflowState.LEGACY_RESOLVED,
    });

    steps.push('state_updated');

    return {
      success: true,
      data: {
        status: 'legacy_resolved',
        action_taken: 'deleted',
        files_affected: deletedCount,
        next: 'Call icon_search(term) to search for icons',
      },
      duration_ms: Date.now() - startTime,
      steps_completed: steps,
    };
  } else {
    // Keep legacy files
    updateIconContext({
      state: IconWorkflowState.LEGACY_RESOLVED,
    });

    steps.push('state_updated');

    return {
      success: true,
      data: {
        status: 'legacy_resolved',
        action_taken: 'kept',
        files_affected: 0,
        next: 'Call icon_search(term) to search for icons',
      },
      duration_ms: Date.now() - startTime,
      steps_completed: steps,
    };
  }
}
