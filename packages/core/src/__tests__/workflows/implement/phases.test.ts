import { describe, it, expect } from 'vitest';
import { ImplementPhase, canTransition } from '@hitoshura25/core';

describe('ImplementWorkflow Phases', () => {
  describe('canTransition', () => {
    it('allows INITIALIZED → SPEC_CREATED', () => {
      expect(canTransition(ImplementPhase.INITIALIZED, ImplementPhase.SPEC_CREATED)).toBe(true);
    });

    it('blocks INITIALIZED → GEMINI_REVIEW_PENDING', () => {
      expect(canTransition(ImplementPhase.INITIALIZED, ImplementPhase.GEMINI_REVIEW_PENDING)).toBe(
        false
      );
    });

    it('allows SPEC_CREATED → GEMINI_REVIEW_PENDING', () => {
      expect(canTransition(ImplementPhase.SPEC_CREATED, ImplementPhase.GEMINI_REVIEW_PENDING)).toBe(
        true
      );
    });

    it('allows GEMINI_REVIEW_PENDING → GEMINI_REVIEW_COMPLETE', () => {
      expect(
        canTransition(ImplementPhase.GEMINI_REVIEW_PENDING, ImplementPhase.GEMINI_REVIEW_COMPLETE)
      ).toBe(true);
    });

    it('allows GEMINI_REVIEW_COMPLETE → SPEC_REFINED', () => {
      expect(
        canTransition(ImplementPhase.GEMINI_REVIEW_COMPLETE, ImplementPhase.SPEC_REFINED)
      ).toBe(true);
    });

    it('allows GEMINI_REVIEW_COMPLETE → OLMO_REVIEW_PENDING', () => {
      expect(
        canTransition(ImplementPhase.GEMINI_REVIEW_COMPLETE, ImplementPhase.OLMO_REVIEW_PENDING)
      ).toBe(true);
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
