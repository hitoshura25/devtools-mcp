import { describe, it, expect } from 'vitest';
import { ImplementPhase, canTransition } from '@hitoshura25/core';

describe('ImplementWorkflow Phases', () => {
  describe('canTransition', () => {
    it('allows INITIALIZED → SPEC_CREATED', () => {
      expect(canTransition(ImplementPhase.INITIALIZED, ImplementPhase.SPEC_CREATED)).toBe(true);
    });

    it('blocks INITIALIZED → REVIEWS_PENDING', () => {
      expect(canTransition(ImplementPhase.INITIALIZED, ImplementPhase.REVIEWS_PENDING)).toBe(false);
    });

    it('allows SPEC_CREATED → REVIEWS_PENDING', () => {
      expect(canTransition(ImplementPhase.SPEC_CREATED, ImplementPhase.REVIEWS_PENDING)).toBe(true);
    });

    it('allows SPEC_CREATED → SPEC_REFINED (skip reviews)', () => {
      expect(canTransition(ImplementPhase.SPEC_CREATED, ImplementPhase.SPEC_REFINED)).toBe(true);
    });

    it('allows REVIEWS_PENDING → REVIEWS_PENDING (queue processing)', () => {
      expect(canTransition(ImplementPhase.REVIEWS_PENDING, ImplementPhase.REVIEWS_PENDING)).toBe(
        true
      );
    });

    it('allows REVIEWS_PENDING → REVIEWS_COMPLETE', () => {
      expect(canTransition(ImplementPhase.REVIEWS_PENDING, ImplementPhase.REVIEWS_COMPLETE)).toBe(
        true
      );
    });

    it('allows REVIEWS_COMPLETE → SPEC_REFINED', () => {
      expect(canTransition(ImplementPhase.REVIEWS_COMPLETE, ImplementPhase.SPEC_REFINED)).toBe(
        true
      );
    });

    it('allows LINT_PENDING → LINT_PASSED', () => {
      expect(canTransition(ImplementPhase.LINT_PENDING, ImplementPhase.LINT_PASSED)).toBe(true);
    });

    it('allows LINT_PENDING → FAILED', () => {
      expect(canTransition(ImplementPhase.LINT_PENDING, ImplementPhase.FAILED)).toBe(true);
    });

    it('blocks COMPLETE → any transition', () => {
      expect(canTransition(ImplementPhase.COMPLETE, ImplementPhase.SPEC_CREATED)).toBe(false);
    });

    it('blocks FAILED → any transition', () => {
      expect(canTransition(ImplementPhase.FAILED, ImplementPhase.SPEC_CREATED)).toBe(false);
    });

    it('blocks ABORTED → any transition', () => {
      expect(canTransition(ImplementPhase.ABORTED, ImplementPhase.SPEC_CREATED)).toBe(false);
    });
  });
});
