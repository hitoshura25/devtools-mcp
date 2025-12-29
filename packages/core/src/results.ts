export interface ToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: ToolError;
  duration_ms: number;
  steps_completed: string[];
  execution_log?: ExecutionStep[];
}

export interface ToolError {
  code: string;
  message: string;
  details?: string;
  suggestions: string[];
  recoverable: boolean;
}

export interface ExecutionStep {
  step: string;
  started_at: string; // ISO timestamp
  completed_at: string; // ISO timestamp
  duration_ms: number;
  status: 'completed' | 'skipped' | 'failed';
  details?: Record<string, unknown>;
  message?: string;
}

export interface McpToolResponse {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  isError?: boolean;
}

export function formatMcpResponse(result: ToolResult): McpToolResponse {
  // Format execution log as human-readable summary
  const logSummary = result.execution_log
    ? result.execution_log
        .map((step) => {
          const status =
            step.status === 'completed' ? '✓' : step.status === 'skipped' ? '○' : '✗';
          const duration =
            step.duration_ms < 1000
              ? `${step.duration_ms}ms`
              : `${(step.duration_ms / 1000).toFixed(1)}s`;
          return `${status} ${step.step} (${duration})`;
        })
        .join('\n')
    : '';

  const totalDuration =
    result.duration_ms < 1000
      ? `${result.duration_ms}ms`
      : `${(result.duration_ms / 1000).toFixed(1)}s`;

  if (result.success) {
    const response: Record<string, unknown> = {
      success: true,
      ...(result.data as Record<string, unknown> | undefined || {}),
    };

    if (result.execution_log && result.execution_log.length > 0) {
      response.execution_summary = {
        steps_completed: result.execution_log.length,
        total_duration: totalDuration,
        log: logSummary,
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(response, null, 2),
        },
      ],
    };
  } else {
    const errorResponse: Record<string, unknown> = {
      success: false,
      error: result.error,
    };

    if (result.execution_log && result.execution_log.length > 0) {
      errorResponse.execution_summary = {
        steps_completed: result.execution_log.filter((s) => s.status === 'completed')
          .length,
        total_duration: totalDuration,
        log: logSummary,
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(errorResponse, null, 2),
        },
      ],
      isError: true,
    };
  }
}
