/**
 * Reviewer adapter interfaces
 */

import type { ReviewResult, ReviewerType } from '../workflows/implement/types.js';

/**
 * Reviewer availability status
 */
export interface ReviewerAvailability {
  available: boolean;
  reason?: string;
  installInstructions?: string;
}

/**
 * Context for review requests
 */
export interface ReviewContext {
  projectPath: string;
  projectType?: string;
  additionalContext?: string;
}

/**
 * Reviewer adapter interface
 */
export interface ReviewerAdapter {
  name: ReviewerType;

  /**
   * Check if the reviewer is available (Docker running, service accessible, etc.)
   */
  checkAvailability(): Promise<ReviewerAvailability>;

  /**
   * Generate the shell command for the agent to execute.
   * The MCP tool returns this command; Claude Code runs it.
   */
  getReviewCommand(spec: string, context: ReviewContext): string;

  /**
   * Parse the output from the review command into structured feedback.
   */
  parseReviewOutput(output: string): ReviewResult;
}

export type { ReviewResult, ReviewerType };
