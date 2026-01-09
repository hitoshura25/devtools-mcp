/**
 * Generic state machine utilities for workflows
 */

/**
 * State transition map - defines valid transitions from each state
 */
export type StateTransitionMap<TState extends string, TAction extends string> = Record<
  TState,
  TAction[]
>;

/**
 * Validate if a transition is allowed
 */
export function validateTransition<TState extends string, TAction extends string>(
  currentState: TState,
  action: TAction,
  transitionMap: StateTransitionMap<TState, TAction>
): boolean {
  const allowedActions = transitionMap[currentState];
  return allowedActions?.includes(action) ?? false;
}

/**
 * Log state transition
 */
export function logTransition(
  from: string,
  to: string,
  action: string,
  workflowId: string
): void {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] Workflow ${workflowId}: ${from} --[${action}]--> ${to}`);
}
