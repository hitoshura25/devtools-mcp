/**
 * Types for implementation workflow orchestrator
 */

import type { BaseWorkflowContext } from '../types.js';
import type { ImplementPhase } from './phases.js';

/**
 * Language-specific commands for build verification
 */
export interface LanguageCommands {
  /** Command to run linting (e.g., "./gradlew lint", "pnpm lint") */
  lint: string;

  /** Command to build the project (e.g., "./gradlew assembleDebug", "pnpm build") */
  build: string;

  /** Command to run tests (e.g., "./gradlew testDebugUnitTest", "pnpm test") */
  test: string;

  /** Optional: Type checking separate from build (e.g., "pnpm tsc --noEmit") */
  typeCheck?: string;

  /** Optional: Format checking (e.g., "pnpm prettier --check .") */
  formatCheck?: string;
}

/**
 * Language configuration for implement workflow
 */
export interface LanguageConfig {
  /** Display name (e.g., "Android", "TypeScript") */
  name: string;

  /** Commands for verification phases */
  commands: LanguageCommands;

  /** File patterns for test files */
  testFilePatterns: string[];

  /** File patterns for source files */
  sourceFilePatterns: string[];

  /** Directory for specs (default: "specs/") */
  specsDir?: string;
}

/**
 * Reviewer types
 */
export type ReviewerType = 'gemini' | 'olmo';

/**
 * Review result from AI reviewer
 */
export interface ReviewResult {
  reviewer: string;
  timestamp: string;
  feedback: string;
  suggestions: string[];
  concerns: string[];
  approved: boolean;
}

/**
 * Command execution result
 */
export interface CommandResult {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

/**
 * Step result passed from agent to orchestrator
 */
export interface StepResult {
  success?: boolean;
  output?: string;
  files_created?: string[];
  files_modified?: string[];
}

/**
 * Action types the orchestrator can return
 */
export type WorkflowActionType =
  | 'create_file'
  | 'edit_file'
  | 'create_files'
  | 'shell'
  | 'complete'
  | 'failed';

/**
 * Action for the agent to take
 */
export interface WorkflowAction {
  type: WorkflowActionType;
  instruction: string;
  path?: string;
  content?: string;
  command?: string;
  captureOutput?: boolean;
  expectSuccess?: boolean;
  suggestedFiles?: string[];
  summary?: {
    description: string;
    specPath: string | null;
    testFiles: string[];
    implementationFiles: string[];
  };
  failedStep?: string;
}

/**
 * Complete workflow context for implementation workflow
 */
export interface ImplementWorkflowContext extends BaseWorkflowContext {
  // Configuration
  description: string;
  projectPath: string;
  languageConfig: LanguageConfig;
  reviewers: ReviewerType[];

  // State
  phase: ImplementPhase;

  // Spec
  specPath: string | null;
  specContent: string | null;

  // Reviews
  reviews: {
    gemini?: ReviewResult;
    olmo?: ReviewResult;
  };
  refinedSpec: string | null;

  // Implementation artifacts
  testFiles: string[];
  implementationFiles: string[];

  // Verification results
  lintResult: CommandResult | null;
  buildResult: CommandResult | null;
  testResult: CommandResult | null;

  // Error tracking
  lastError: string | null;
  failedPhase: ImplementPhase | null;
}
