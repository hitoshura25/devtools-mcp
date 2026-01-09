/**
 * Generic workflow interfaces for state machine workflows
 */

/**
 * Generic workflow storage interface
 */
export interface WorkflowStorage<T> {
  save(workflowId: string, context: T): Promise<void>;
  load(workflowId: string): Promise<T | null>;
  list(): Promise<string[]>;
  archive(workflowId: string): Promise<void>;
  delete(workflowId: string): Promise<void>;
}

/**
 * Base workflow context that all workflows should extend
 */
export interface BaseWorkflowContext {
  workflowId: string;
  createdAt: string;
  updatedAt: string;
}
