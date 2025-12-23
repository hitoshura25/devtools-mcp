import { ToolResult } from '@hitoshura25/core';
import { resetIconContext } from '../../state/icon-workflow.js';

export interface ResetWorkflowResult {
  status: 'reset';
  next: string;
}

export async function iconResetWorkflow(): Promise<ToolResult<ResetWorkflowResult>> {
  const startTime = Date.now();
  const steps: string[] = [];

  resetIconContext();
  steps.push('state_reset');

  return {
    success: true,
    data: {
      status: 'reset',
      next: 'Call icon_preflight_check(project_path) to start a new workflow',
    },
    duration_ms: Date.now() - startTime,
    steps_completed: steps,
  };
}
