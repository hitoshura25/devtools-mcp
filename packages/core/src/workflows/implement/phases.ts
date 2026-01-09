/**
 * Implementation workflow phases and state transitions
 */

/**
 * Phases in the implementation workflow
 */
export enum ImplementPhase {
  INITIALIZED = 'initialized',
  SPEC_CREATED = 'spec_created',
  GEMINI_REVIEW_PENDING = 'gemini_review_pending',
  GEMINI_REVIEW_COMPLETE = 'gemini_review_complete',
  OLMO_REVIEW_PENDING = 'olmo_review_pending',
  OLMO_REVIEW_COMPLETE = 'olmo_review_complete',
  SPEC_REFINED = 'spec_refined',
  TESTS_PENDING = 'tests_pending',
  TESTS_CREATED = 'tests_created',
  IMPLEMENTATION_PENDING = 'implementation_pending',
  IMPLEMENTATION_COMPLETE = 'implementation_complete',
  LINT_PENDING = 'lint_pending',
  LINT_PASSED = 'lint_passed',
  BUILD_PENDING = 'build_pending',
  BUILD_PASSED = 'build_passed',
  TESTS_RUN_PENDING = 'tests_run_pending',
  TESTS_PASSED = 'tests_passed',
  COMPLETE = 'complete',
  FAILED = 'failed',
  ABORTED = 'aborted',
}

/**
 * Valid phase transitions
 */
export const validTransitions: Record<ImplementPhase, ImplementPhase[]> = {
  [ImplementPhase.INITIALIZED]: [ImplementPhase.SPEC_CREATED],
  [ImplementPhase.SPEC_CREATED]: [ImplementPhase.GEMINI_REVIEW_PENDING],
  [ImplementPhase.GEMINI_REVIEW_PENDING]: [ImplementPhase.GEMINI_REVIEW_COMPLETE],
  [ImplementPhase.GEMINI_REVIEW_COMPLETE]: [
    ImplementPhase.OLMO_REVIEW_PENDING,
    ImplementPhase.SPEC_REFINED,
  ],
  [ImplementPhase.OLMO_REVIEW_PENDING]: [ImplementPhase.OLMO_REVIEW_COMPLETE],
  [ImplementPhase.OLMO_REVIEW_COMPLETE]: [ImplementPhase.SPEC_REFINED],
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
