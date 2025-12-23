import { ExecutionStep } from './results.js';

export interface ProgressReporter {
  report(progress: number, message: string): Promise<void>;
  stepCompleted(step: string, details?: Record<string, unknown>): void;
  getExecutionLog(): ExecutionStep[];
}

export interface ProgressContext {
  progressToken?: string;
  server?: unknown; // MCP Server instance (optional)
}

export function createProgressReporter(
  context: ProgressContext,
  totalSteps: number
): ProgressReporter {
  const executionLog: ExecutionStep[] = [];
  let currentStepIndex = 0;
  let currentStepStart: Date | null = null;
  let currentStepName: string | null = null;

  return {
    async report(progress: number, message: string): Promise<void> {
      // Try to send MCP notification (future-proof)
      if (context.progressToken && context.server) {
        try {
          // Type assertion for MCP Server's notification method
          const server = context.server as {
            notification: (params: { method: string; params: unknown }) => Promise<void>;
          };
          await server.notification({
            method: 'notifications/progress',
            params: {
              progressToken: context.progressToken,
              progress: Math.round(progress * 100),
              total: 100,
              message,
            },
          });
        } catch (error) {
          // Client may not support notifications - that's OK
          // Log to stderr as fallback (some clients show this)
          console.error(`[progress] ${Math.round(progress * 100)}% - ${message}`);
        }
      }
    },

    stepCompleted(step: string, details?: Record<string, unknown>): void {
      const now = new Date();

      // Complete previous step if exists
      if (currentStepName && currentStepStart) {
        executionLog.push({
          step: currentStepName,
          started_at: currentStepStart.toISOString(),
          completed_at: now.toISOString(),
          duration_ms: now.getTime() - currentStepStart.getTime(),
          status: 'completed',
          details: details,
        });
      }

      // Start new step
      currentStepIndex++;
      currentStepName = step;
      currentStepStart = now;

      // Send progress notification
      const progress = currentStepIndex / totalSteps;
      this.report(progress, step);
    },

    getExecutionLog(): ExecutionStep[] {
      // Complete final step if still running
      if (currentStepName && currentStepStart) {
        const now = new Date();
        executionLog.push({
          step: currentStepName,
          started_at: currentStepStart.toISOString(),
          completed_at: now.toISOString(),
          duration_ms: now.getTime() - currentStepStart.getTime(),
          status: 'completed',
        });
        currentStepName = null;
        currentStepStart = null;
      }
      return executionLog;
    },
  };
}
