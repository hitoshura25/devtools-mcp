/**
 * Implementation workflow orchestrator
 * Manages the state machine for feature implementation workflows
 */

import { nanoid } from 'nanoid';
import { readFile } from 'fs/promises';
import { FileWorkflowStorage } from '../persistence.js';
import { ImplementPhase } from './phases.js';
import { generateSpecTemplate, getSpecFileName } from './spec-template.js';
import type { ReviewerRegistry } from '../../reviewers/registry.js';
import type { ReviewerName } from '../../reviewers/types.js';
import type {
  ImplementWorkflowContext,
  LanguageConfig,
  StepResult,
  WorkflowAction,
  CommandResult,
} from './types.js';

/**
 * Error thrown when a reviewer is unavailable
 * Note: Error messages are sanitized to avoid leaking sensitive system information
 */
export class ReviewerUnavailableError extends Error {
  /** Sanitized reason for unavailability (safe for end users) */
  public sanitizedReason: string;
  /** Installation instructions (if available) */
  public installInstructions?: string;

  constructor(
    public reviewer: string,
    availability: { reason?: string; installInstructions?: string }
  ) {
    // Sanitize the reason to avoid leaking sensitive paths or network details
    const sanitizedReason = ReviewerUnavailableError.sanitizeReason(availability.reason);
    super(`Reviewer '${reviewer}' is not available: ${sanitizedReason}`);
    this.name = 'ReviewerUnavailableError';
    this.sanitizedReason = sanitizedReason;
    this.installInstructions = availability.installInstructions;
  }

  /**
   * Sanitize error reason to remove potentially sensitive information
   * like file paths, network addresses, or internal details
   */
  private static sanitizeReason(reason?: string): string {
    if (!reason) return 'Service unavailable';

    // Truncate to prevent ReDoS on very long inputs
    const truncated = reason.length > 1000 ? reason.slice(0, 1000) : reason;

    // Remove file paths - use simpler patterns to avoid ReDoS from nested quantifiers
    // Unix paths: match /word sequences (bounded to avoid backtracking)
    let sanitized = truncated.replace(/\/[a-zA-Z0-9_.-]{1,100}(?:\/[a-zA-Z0-9_.-]{1,100})*/g, '[path]');
    // Windows paths: match drive:\path sequences (hyphen at end of char class doesn't need escaping)
    sanitized = sanitized.replace(/[A-Z]:\\[a-zA-Z0-9_.\\-]{1,200}/gi, '[path]');

    // Remove IP addresses and ports
    sanitized = sanitized.replace(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?/g, '[address]');

    // Keep URLs but remove query strings which may contain sensitive data
    sanitized = sanitized.replace(/(\bhttps?:\/\/[^\s?]+)\?[^\s]*/gi, '$1');

    return sanitized;
  }
}

/**
 * Main orchestrator class for implementation workflows
 */
export class ImplementOrchestrator {
  private storage: FileWorkflowStorage<ImplementWorkflowContext>;
  private languageConfig: LanguageConfig;
  private reviewerRegistry?: ReviewerRegistry;

  constructor(languageConfig: LanguageConfig, reviewerRegistry?: ReviewerRegistry) {
    this.languageConfig = languageConfig;
    this.storage = new FileWorkflowStorage('implement');
    this.reviewerRegistry = reviewerRegistry;
  }

  /**
   * Start a new implementation workflow
   */
  async start(options: {
    description: string;
    projectPath: string;
    reviewers?: ReviewerName[];
  }): Promise<{ workflowId: string; action: WorkflowAction }> {
    // Get active reviewers from options or registry
    const activeReviewers =
      options.reviewers ?? this.reviewerRegistry?.getActiveReviewers() ?? [];

    // Check reviewer availability (strict mode - fail if unavailable)
    if (this.reviewerRegistry) {
      for (const reviewer of activeReviewers) {
        const availability = await this.reviewerRegistry.checkAvailability(reviewer);
        if (!availability.available) {
          throw new ReviewerUnavailableError(reviewer, availability);
        }
      }
    }

    const workflowId = nanoid(10);
    const specFileName = getSpecFileName(options.description);
    const specsDir = this.languageConfig.specsDir ?? 'specs/';
    const specPath = `${specsDir}${specFileName}`;

    const context: ImplementWorkflowContext = {
      workflowId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      description: options.description,
      projectPath: options.projectPath,
      languageConfig: this.languageConfig,
      activeReviewers,
      phase: ImplementPhase.INITIALIZED,
      // Initialize review queue
      pendingReviewers: [...activeReviewers],
      completedReviewers: [],
      specPath,
      specContent: null,
      reviews: {},
      refinedSpec: null,
      testFiles: [],
      implementationFiles: [],
      lintResult: null,
      buildResult: null,
      testResult: null,
      lastError: null,
      failedPhase: null,
    };

    await this.storage.save(workflowId, context);

    const specTemplate = generateSpecTemplate(
      options.description,
      options.projectPath,
      this.languageConfig.name
    );

    return {
      workflowId,
      action: {
        type: 'create_file',
        path: specPath,
        content: specTemplate,
        instruction: `Create this spec file at ${specPath}, fill in the details, then call implement_step`,
      },
    };
  }

  /**
   * Execute the next step in the workflow
   */
  async step(
    workflowId: string,
    stepResult?: StepResult
  ): Promise<{ phase: ImplementPhase; action: WorkflowAction | null; complete: boolean }> {
    const context = await this.storage.load(workflowId);
    if (!context) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    // Process the step result and advance phase
    const { nextPhase, action } = await this.processStep(context, stepResult);

    // Update context
    context.phase = nextPhase;
    context.updatedAt = new Date().toISOString();
    await this.storage.save(workflowId, context);

    const complete = nextPhase === ImplementPhase.COMPLETE;
    if (complete) {
      await this.storage.archive(workflowId);
    }

    return { phase: nextPhase, action, complete };
  }

  /**
   * Process a step and determine the next phase and action
   */
  private async processStep(
    context: ImplementWorkflowContext,
    stepResult?: StepResult
  ): Promise<{ nextPhase: ImplementPhase; action: WorkflowAction | null }> {
    const { phase, languageConfig } = context;

    switch (phase) {
      case ImplementPhase.INITIALIZED:
        // Spec should have been created, read its content
        if (!context.specPath) {
          throw new Error('Spec path is not set');
        }

        try {
          const specContent = await readFile(context.specPath, 'utf-8');
          context.specContent = specContent;
        } catch (error) {
          throw new Error(`Failed to read spec file at ${context.specPath}: ${error}`);
        }

        return {
          nextPhase: ImplementPhase.SPEC_CREATED,
          action: null,
        };

      case ImplementPhase.SPEC_CREATED:
        // Start review queue if we have reviewers
        if (context.pendingReviewers.length === 0) {
          // No reviewers configured, skip directly to tests (no refine step needed)
          return {
            nextPhase: ImplementPhase.SPEC_REFINED,
            action: this.getNoReviewsAction(context),
          };
        }
        return {
          nextPhase: ImplementPhase.REVIEWS_PENDING,
          action: this.getNextReviewAction(context),
        };

      case ImplementPhase.REVIEWS_PENDING:
        // Process review result from the current reviewer
        if (stepResult?.output && this.reviewerRegistry && context.pendingReviewers.length > 0) {
          const currentReviewer = context.pendingReviewers[0];
          const adapter = this.reviewerRegistry.get(currentReviewer);
          context.reviews[currentReviewer] = adapter.parseReviewOutput(stepResult.output);

          // Move reviewer from pending to completed
          context.pendingReviewers.shift();
          context.completedReviewers.push(currentReviewer);
        }

        // Check if more reviewers pending
        if (context.pendingReviewers.length > 0) {
          return {
            nextPhase: ImplementPhase.REVIEWS_PENDING,
            action: this.getNextReviewAction(context),
          };
        }

        // All reviews complete
        return {
          nextPhase: ImplementPhase.REVIEWS_COMPLETE,
          action: this.getRefineSpecAction(context),
        };

      case ImplementPhase.REVIEWS_COMPLETE:
        return {
          nextPhase: ImplementPhase.SPEC_REFINED,
          action: this.getRefineSpecAction(context),
        };

      case ImplementPhase.SPEC_REFINED:
        return {
          nextPhase: ImplementPhase.TESTS_PENDING,
          action: this.getCreateTestsAction(context),
        };

      case ImplementPhase.TESTS_PENDING:
        if (stepResult?.files_created) {
          context.testFiles = stepResult.files_created;
        }
        return {
          nextPhase: ImplementPhase.TESTS_CREATED,
          action: this.getImplementAction(context),
        };

      case ImplementPhase.TESTS_CREATED:
        return {
          nextPhase: ImplementPhase.IMPLEMENTATION_PENDING,
          action: this.getImplementAction(context),
        };

      case ImplementPhase.IMPLEMENTATION_PENDING:
        if (stepResult?.files_created || stepResult?.files_modified) {
          context.implementationFiles = [
            ...(stepResult.files_created ?? []),
            ...(stepResult.files_modified ?? []),
          ];
        }
        return {
          nextPhase: ImplementPhase.IMPLEMENTATION_COMPLETE,
          action: this.getLintAction(context),
        };

      case ImplementPhase.IMPLEMENTATION_COMPLETE:
        return {
          nextPhase: ImplementPhase.LINT_PENDING,
          action: this.getLintAction(context),
        };

      case ImplementPhase.LINT_PENDING:
        context.lintResult = this.parseCommandResult(stepResult, languageConfig.commands.lint);
        if (!stepResult?.success) {
          return { nextPhase: ImplementPhase.FAILED, action: this.getFailureAction(context, 'lint') };
        }
        return {
          nextPhase: ImplementPhase.LINT_PASSED,
          action: this.getBuildAction(context),
        };

      case ImplementPhase.LINT_PASSED:
        return {
          nextPhase: ImplementPhase.BUILD_PENDING,
          action: this.getBuildAction(context),
        };

      case ImplementPhase.BUILD_PENDING:
        context.buildResult = this.parseCommandResult(stepResult, languageConfig.commands.build);
        if (!stepResult?.success) {
          return { nextPhase: ImplementPhase.FAILED, action: this.getFailureAction(context, 'build') };
        }
        return {
          nextPhase: ImplementPhase.BUILD_PASSED,
          action: this.getTestAction(context),
        };

      case ImplementPhase.BUILD_PASSED:
        return {
          nextPhase: ImplementPhase.TESTS_RUN_PENDING,
          action: this.getTestAction(context),
        };

      case ImplementPhase.TESTS_RUN_PENDING:
        context.testResult = this.parseCommandResult(stepResult, languageConfig.commands.test);
        if (!stepResult?.success) {
          return { nextPhase: ImplementPhase.FAILED, action: this.getFailureAction(context, 'test') };
        }
        return {
          nextPhase: ImplementPhase.TESTS_PASSED,
          action: this.getCompleteAction(context),
        };

      case ImplementPhase.TESTS_PASSED:
        return {
          nextPhase: ImplementPhase.COMPLETE,
          action: null,
        };

      default:
        throw new Error(`Unexpected phase: ${phase}`);
    }
  }

  // Action generators

  private getLintAction(context: ImplementWorkflowContext): WorkflowAction {
    return {
      type: 'shell',
      command: context.languageConfig.commands.lint,
      instruction: `Run the lint command and report the result`,
      captureOutput: true,
      expectSuccess: true,
    };
  }

  private getBuildAction(context: ImplementWorkflowContext): WorkflowAction {
    return {
      type: 'shell',
      command: context.languageConfig.commands.build,
      instruction: `Run the build command and report the result`,
      captureOutput: true,
      expectSuccess: true,
    };
  }

  private getTestAction(context: ImplementWorkflowContext): WorkflowAction {
    return {
      type: 'shell',
      command: context.languageConfig.commands.test,
      instruction: `Run the test command and report the result`,
      captureOutput: true,
      expectSuccess: true,
    };
  }

  /**
   * Get review action for the next pending reviewer
   */
  private getNextReviewAction(context: ImplementWorkflowContext): WorkflowAction {
    if (!this.reviewerRegistry || context.pendingReviewers.length === 0) {
      return {
        type: 'shell',
        command: 'echo "No reviewers configured"',
        instruction: 'Skip review - no reviewers configured',
      };
    }

    const reviewerName = context.pendingReviewers[0];
    const adapter = this.reviewerRegistry.get(reviewerName);
    const command = adapter.getReviewCommand(context.specContent ?? '', {
      projectPath: context.projectPath,
    });

    return {
      type: 'shell',
      command,
      instruction: `Run the ${reviewerName} review command and capture the output`,
      captureOutput: true,
    };
  }

  private getRefineSpecAction(context: ImplementWorkflowContext): WorkflowAction {
    const synthesis = this.synthesizeReviews(context);

    return {
      type: 'edit_file',
      path: context.specPath!,
      instruction: synthesis
        ? `Update the spec to address review feedback:\n\n${synthesis}`
        : 'Review and finalize the spec (no AI reviews were performed)',
    };
  }

  /**
   * Action when no reviewers are configured - skip refinement entirely
   */
  private getNoReviewsAction(context: ImplementWorkflowContext): WorkflowAction {
    return {
      type: 'info',
      instruction: `No AI reviewers configured. Proceeding directly to test creation. ` +
        `Spec file: ${context.specPath}`,
    };
  }

  private getCreateTestsAction(context: ImplementWorkflowContext): WorkflowAction {
    return {
      type: 'create_files',
      instruction: `Create test files based on the spec. Use patterns: ${context.languageConfig.testFilePatterns.join(', ')}`,
      suggestedFiles: context.languageConfig.testFilePatterns,
    };
  }

  private getImplementAction(context: ImplementWorkflowContext): WorkflowAction {
    return {
      type: 'create_files',
      instruction: `Implement the feature according to the spec. Tests are already created - make them pass.`,
      suggestedFiles: context.languageConfig.sourceFilePatterns,
    };
  }

  private getCompleteAction(context: ImplementWorkflowContext): WorkflowAction {
    return {
      type: 'complete',
      instruction: 'Implementation complete!',
      summary: {
        description: context.description,
        specPath: context.specPath,
        testFiles: context.testFiles,
        implementationFiles: context.implementationFiles,
      },
    };
  }

  private getFailureAction(_context: ImplementWorkflowContext, step: string): WorkflowAction {
    return {
      type: 'failed',
      instruction: `${step} failed. Review the output and fix the issues, then call implement_step again.`,
      failedStep: step,
    };
  }

  /**
   * Synthesize reviews from all completed reviewers
   */
  private synthesizeReviews(context: ImplementWorkflowContext): string {
    const parts: string[] = [];

    for (const reviewerName of context.completedReviewers) {
      const review = context.reviews[reviewerName];
      if (!review) continue;

      // Add fallback handling for older stored workflows that may not have these fields
      const backendInfo = review.backendType && review.model
        ? ` (${review.backendType}/${review.model})`
        : '';
      parts.push(`**${reviewerName} Review**${backendInfo}:`);
      parts.push(`- Feedback: ${review.feedback}`);
      if (review.suggestions && review.suggestions.length > 0) {
        parts.push(`- Suggestions: ${review.suggestions.join(', ')}`);
      }
      if (review.concerns && review.concerns.length > 0) {
        parts.push(`- Concerns: ${review.concerns.join(', ')}`);
      }
      parts.push('');
    }

    return parts.join('\n');
  }

  private parseCommandResult(
    stepResult: StepResult | undefined,
    command: string
  ): CommandResult | null {
    if (!stepResult) return null;

    return {
      command,
      exitCode: stepResult.success ? 0 : 1,
      stdout: stepResult.output ?? '',
      stderr: '',
      durationMs: 0,
    };
  }

  // Status and control methods

  async getStatus(workflowId: string): Promise<ImplementWorkflowContext | null> {
    return this.storage.load(workflowId);
  }

  async listActive(): Promise<string[]> {
    return this.storage.list();
  }

  async abort(workflowId: string, reason?: string): Promise<void> {
    const context = await this.storage.load(workflowId);
    if (!context) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    context.phase = ImplementPhase.ABORTED;
    context.lastError = reason ?? 'User aborted';
    context.updatedAt = new Date().toISOString();

    await this.storage.save(workflowId, context);
    await this.storage.archive(workflowId);
  }
}
