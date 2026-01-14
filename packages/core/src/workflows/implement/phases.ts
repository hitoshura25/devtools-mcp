/**
 * Implementation workflow phases and state transitions
 *
 * The workflow uses a generic review queue that can process
 * any number of configured reviewers dynamically.
 */

/**
 * Phases in the implementation workflow
 */
export enum ImplementPhase {
  // Initial phases
  INITIALIZED = 'initialized',
  SPEC_CREATED = 'spec_created',

  // Generic review phases (supports any number of reviewers)
  REVIEWS_PENDING = 'reviews_pending',
  REVIEWS_COMPLETE = 'reviews_complete',

  // Spec refinement
  SPEC_REFINED = 'spec_refined',

  // Test creation
  TESTS_PENDING = 'tests_pending',
  TESTS_CREATED = 'tests_created',

  // Implementation
  IMPLEMENTATION_PENDING = 'implementation_pending',
  IMPLEMENTATION_COMPLETE = 'implementation_complete',

  // Verification phases
  LINT_PENDING = 'lint_pending',
  LINT_PASSED = 'lint_passed',
  BUILD_PENDING = 'build_pending',
  BUILD_PASSED = 'build_passed',
  TESTS_RUN_PENDING = 'tests_run_pending',
  TESTS_PASSED = 'tests_passed',

  // Terminal phases
  COMPLETE = 'complete',
  FAILED = 'failed',
  ABORTED = 'aborted',
}

/**
 * Valid phase transitions
 */
export const validTransitions: Record<ImplementPhase, ImplementPhase[]> = {
  [ImplementPhase.INITIALIZED]: [ImplementPhase.SPEC_CREATED],
  [ImplementPhase.SPEC_CREATED]: [
    ImplementPhase.REVIEWS_PENDING,
    ImplementPhase.SPEC_REFINED, // Skip reviews if none configured
  ],
  [ImplementPhase.REVIEWS_PENDING]: [
    ImplementPhase.REVIEWS_PENDING, // Stay in pending while processing queue
    ImplementPhase.REVIEWS_COMPLETE,
  ],
  [ImplementPhase.REVIEWS_COMPLETE]: [ImplementPhase.SPEC_REFINED],
  [ImplementPhase.SPEC_REFINED]: [ImplementPhase.TESTS_PENDING],
  [ImplementPhase.TESTS_PENDING]: [ImplementPhase.TESTS_CREATED],
  [ImplementPhase.TESTS_CREATED]: [ImplementPhase.IMPLEMENTATION_PENDING],
  [ImplementPhase.IMPLEMENTATION_PENDING]: [ImplementPhase.IMPLEMENTATION_COMPLETE],
  [ImplementPhase.IMPLEMENTATION_COMPLETE]: [ImplementPhase.LINT_PENDING],
  [ImplementPhase.LINT_PENDING]: [ImplementPhase.LINT_PASSED, ImplementPhase.FAILED],
  [ImplementPhase.LINT_PASSED]: [ImplementPhase.BUILD_PENDING],
  [ImplementPhase.BUILD_PENDING]: [ImplementPhase.BUILD_PASSED, ImplementPhase.FAILED],
  [ImplementPhase.BUILD_PASSED]: [ImplementPhase.TESTS_RUN_PENDING],
  [ImplementPhase.TESTS_RUN_PENDING]: [ImplementPhase.TESTS_PASSED, ImplementPhase.FAILED],
  [ImplementPhase.TESTS_PASSED]: [ImplementPhase.COMPLETE],
  [ImplementPhase.COMPLETE]: [],
  [ImplementPhase.FAILED]: [],
  [ImplementPhase.ABORTED]: [],
};

/**
 * Check if transition from current phase to next phase is valid
 */
export function canTransition(
  currentPhase: ImplementPhase,
  nextPhase: ImplementPhase
): boolean {
  return validTransitions[currentPhase]?.includes(nextPhase) ?? false;
}
