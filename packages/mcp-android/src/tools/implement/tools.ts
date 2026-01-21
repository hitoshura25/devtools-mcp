/**
 * MCP tool handlers for implementation workflow
 */

import {
  ImplementOrchestrator,
  ReviewerUnavailableError,
  getReviewerRegistry,
  type ToolResult,
  type ReviewerName,
} from '@hitoshura25/core';
import { androidConfig } from './commands.js';

// Lazy-loaded singleton orchestrator for this MCP server
let _orchestrator: ImplementOrchestrator | null = null;

function getOrchestrator(): ImplementOrchestrator {
  if (!_orchestrator) {
    _orchestrator = new ImplementOrchestrator(androidConfig, getReviewerRegistry());
  }
  return _orchestrator;
}

/**
 * Input parameters for implement_start tool
 */
export interface ImplementStartInput {
  description: string;
  project_path?: string;
  reviewers?: ReviewerName[];
}

/**
 * Result for implement_start tool
 */
export interface ImplementStartResult {
  status: 'initialized' | 'error';
  workflowId?: string;
  phase?: string;
  action?: any;
  nextTool?: string;
  error?: string;
  reason?: string;
  installInstructions?: string;
}

/**
 * Start a new implementation workflow
 */
export async function implementStart(
  input: ImplementStartInput
): Promise<ToolResult<ImplementStartResult>> {
  const startTime = Date.now();
  const steps: string[] = [];

  try {
    steps.push('checking_reviewers');
    const result = await getOrchestrator().start({
      description: input.description,
      projectPath: input.project_path ?? '.',
      reviewers: input.reviewers,
    });

    steps.push('workflow_initialized');

    return {
      success: true,
      data: {
        status: 'initialized',
        workflowId: result.workflowId,
        phase: 'initialized',
        action: result.action,
        nextTool: 'implement_step',
      },
      duration_ms: Date.now() - startTime,
      steps_completed: steps,
    };
  } catch (error) {
    if (error instanceof ReviewerUnavailableError) {
      return {
        success: false,
        error: {
          code: 'REVIEWER_UNAVAILABLE',
          message: `Reviewer '${error.reviewer}' is not available`,
          details: error.availability.reason,
          suggestions: [
            error.availability.installInstructions || 'Install the required reviewer',
          ],
          recoverable: true,
        },
        duration_ms: Date.now() - startTime,
        steps_completed: steps,
      };
    }

    return {
      success: false,
      error: {
        code: 'START_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
        suggestions: ['Check the parameters', 'Review error details'],
        recoverable: true,
      },
      duration_ms: Date.now() - startTime,
      steps_completed: steps,
    };
  }
}

/**
 * Input parameters for implement_step tool
 */
export interface ImplementStepInput {
  workflow_id: string;
  step_result?: {
    success?: boolean;
    output?: string;
    files_created?: string[];
    files_modified?: string[];
  };
}

/**
 * Result for implement_step tool
 */
export interface ImplementStepResult {
  status: 'step_complete' | 'workflow_complete' | 'error';
  phase?: string;
  action?: any;
  nextTool?: string | null;
  error?: string;
}

/**
 * Execute the next step in an implementation workflow
 */
export async function implementStep(
  input: ImplementStepInput
): Promise<ToolResult<ImplementStepResult>> {
  const startTime = Date.now();
  const steps: string[] = [];

  try {
    steps.push('processing_step');
    const result = await getOrchestrator().step(input.workflow_id, input.step_result);

    if (result.complete) {
      steps.push('workflow_completed');
      return {
        success: true,
        data: {
          status: 'workflow_complete',
          phase: result.phase,
          action: result.action,
          nextTool: null,
        },
        duration_ms: Date.now() - startTime,
        steps_completed: steps,
      };
    }

    steps.push('step_completed');
    return {
      success: true,
      data: {
        status: 'step_complete',
        phase: result.phase,
        action: result.action,
        nextTool: 'implement_step',
      },
      duration_ms: Date.now() - startTime,
      steps_completed: steps,
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'STEP_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
        suggestions: ['Check workflow ID', 'Review error details'],
        recoverable: true,
      },
      duration_ms: Date.now() - startTime,
      steps_completed: steps,
    };
  }
}

/**
 * Input parameters for implement_status tool
 */
export interface ImplementStatusInput {
  workflow_id?: string;
}

/**
 * Result for implement_status tool
 */
export interface ImplementStatusResult {
  status?: string;
  workflowId?: string;
  phase?: string;
  description?: string;
  startedAt?: string;
  lastUpdated?: string;
  activeWorkflows?: string[];
  instruction?: string;
  error?: string;
}

/**
 * Get status of implementation workflows
 */
export async function implementStatus(
  input: ImplementStatusInput
): Promise<ToolResult<ImplementStatusResult>> {
  const startTime = Date.now();
  const steps: string[] = [];

  try {
    if (input.workflow_id) {
      steps.push('fetching_workflow_status');
      const context = await getOrchestrator().getStatus(input.workflow_id);

      if (!context) {
        return {
          success: false,
          error: {
            code: 'WORKFLOW_NOT_FOUND',
            message: `Workflow not found: ${input.workflow_id}`,
            suggestions: ['Check the workflow ID', 'List active workflows'],
            recoverable: false,
          },
          duration_ms: Date.now() - startTime,
          steps_completed: steps,
        };
      }

      return {
        success: true,
        data: {
          status: 'active',
          workflowId: context.workflowId,
          phase: context.phase,
          description: context.description,
          startedAt: context.createdAt,
          lastUpdated: context.updatedAt,
        },
        duration_ms: Date.now() - startTime,
        steps_completed: steps,
      };
    }

    steps.push('listing_active_workflows');
    const activeIds = await getOrchestrator().listActive();

    return {
      success: true,
      data: {
        activeWorkflows: activeIds,
        instruction: 'Call implement_status with a workflow_id to get details',
      },
      duration_ms: Date.now() - startTime,
      steps_completed: steps,
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'STATUS_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
        suggestions: ['Review error details'],
        recoverable: true,
      },
      duration_ms: Date.now() - startTime,
      steps_completed: steps,
    };
  }
}

/**
 * Input parameters for implement_abort tool
 */
export interface ImplementAbortInput {
  workflow_id: string;
  reason?: string;
}

/**
 * Result for implement_abort tool
 */
export interface ImplementAbortResult {
  status: 'aborted';
  workflowId: string;
}

/**
 * Abort an implementation workflow
 */
export async function implementAbort(
  input: ImplementAbortInput
): Promise<ToolResult<ImplementAbortResult>> {
  const startTime = Date.now();
  const steps: string[] = [];

  try {
    steps.push('aborting_workflow');
    await getOrchestrator().abort(input.workflow_id, input.reason);

    steps.push('workflow_aborted');
    return {
      success: true,
      data: {
        status: 'aborted',
        workflowId: input.workflow_id,
      },
      duration_ms: Date.now() - startTime,
      steps_completed: steps,
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'ABORT_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
        suggestions: ['Check workflow ID', 'Review error details'],
        recoverable: true,
      },
      duration_ms: Date.now() - startTime,
      steps_completed: steps,
    };
  }
}
