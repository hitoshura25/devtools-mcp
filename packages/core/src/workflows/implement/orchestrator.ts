/**
 * Implementation workflow orchestrator
 * Manages the state machine for feature implementation workflows
 */

import { nanoid } from 'nanoid';
import { readFile } from 'fs/promises';
import { FileWorkflowStorage } from '../persistence.js';
import { ImplementPhase } from './phases.js';
import { generateSpecTemplate, getSpecFileName } from './spec-template.js';
import type {
  ImplementWorkflowContext,
  LanguageConfig,
  ReviewerType,
  StepResult,
  WorkflowAction,
  CommandResult,
} from './types.js';

/**
 * Error thrown when a reviewer is unavailable
 */
export class ReviewerUnavailableError extends Error {
  constructor(
    public reviewer: string,
    public availability: { reason?: string; installInstructions?: string }
  ) {
    super(`Reviewer '${reviewer}' is not available: ${availability.reason}`);
    this.name = 'ReviewerUnavailableError';
  }
}

/**
 * Main orchestrator class for implementation workflows
 */
export class ImplementOrchestrator {
  private storage: FileWorkflowStorage<ImplementWorkflowContext>;
  private languageConfig: LanguageConfig;
  private reviewerRegistry: any; // Will be injected

  constructor(languageConfig: LanguageConfig, reviewerRegistry?: any) {
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
    reviewers?: ReviewerType[];
  }): Promise<{ workflowId: string; action: WorkflowAction }> {
    const reviewers = options.reviewers ?? ['gemini'];

    // Check reviewer availability (strict mode - fail if unavailable)
    if (this.reviewerRegistry) {
      for (const reviewer of reviewers) {
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
      reviewers,
      phase: ImplementPhase.INITIALIZED,
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
          action: this.getGeminiReviewAction(context),
        };

      case ImplementPhase.SPEC_CREATED:
        return {
          nextPhase: ImplementPhase.GEMINI_REVIEW_PENDING,
          action: this.getGeminiReviewAction(context),
        };

      case ImplementPhase.GEMINI_REVIEW_PENDING: {
        if (stepResult?.output && this.reviewerRegistry) {
          const adapter = this.reviewerRegistry.get('gemini');
          context.reviews.gemini = adapter.parseReviewOutput(stepResult.output);
        }

        const hasOlmo = context.reviewers.includes('olmo');
        return {
          nextPhase: hasOlmo
            ? ImplementPhase.OLMO_REVIEW_PENDING
            : ImplementPhase.SPEC_REFINED,
          action: hasOlmo ? this.getOlmoReviewAction(context) : this.getRefineSpecAction(context),
        };
      }

      case ImplementPhase.OLMO_REVIEW_PENDING:
        if (stepResult?.output && this.reviewerRegistry) {
          const adapter = this.reviewerRegistry.get('olmo');
          context.reviews.olmo = adapter.parseReviewOutput(stepResult.output);
        }
        return {
          nextPhase: ImplementPhase.SPEC_REFINED,
          action: this.getRefineSpecAction(context),
        };

      case ImplementPhase.GEMINI_REVIEW_COMPLETE:
        return {
          nextPhase: ImplementPhase.SPEC_REFINED,
          action: this.getRefineSpecAction(context),
        };

      case ImplementPhase.OLMO_REVIEW_COMPLETE:
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

  // Action generators using language-specific commands

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

  private getGeminiReviewAction(context: ImplementWorkflowContext): WorkflowAction {
    if (!this.reviewerRegistry) {
      return {
        type: 'shell',
        command: 'echo "Reviewer registry not configured"',
        instruction: 'Skip review - registry not configured',
      };
    }

    const adapter = this.reviewerRegistry.get('gemini');
    const command = adapter.getReviewCommand(context.specContent ?? '', {
      projectPath: context.projectPath,
    });

    return {
      type: 'shell',
      command,
      instruction: 'Run the Gemini review command and capture the output',
      captureOutput: true,
    };
  }

  private getOlmoReviewAction(context: ImplementWorkflowContext): WorkflowAction {
    if (!this.reviewerRegistry) {
      return {
        type: 'shell',
        command: 'echo "Reviewer registry not configured"',
        instruction: 'Skip review - registry not configured',
      };
    }

    const adapter = this.reviewerRegistry.get('olmo');
    const command = adapter.getReviewCommand(context.specContent ?? '', {
      projectPath: context.projectPath,
    });

    return {
      type: 'shell',
      command,
      instruction: 'Run the OLMo review command and capture the output',
      captureOutput: true,
    };
  }

  private getRefineSpecAction(context: ImplementWorkflowContext): WorkflowAction {
    const synthesis = this.synthesizeReviews(context);

    return {
      type: 'edit_file',
      path: context.specPath!,
      instruction: `Update the spec to address review feedback:\n\n${synthesis}`,
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

  private getFailureAction(context: ImplementWorkflowContext, step: string): WorkflowAction {
    return {
      type: 'failed',
      instruction: `${step} failed. Review the output and fix the issues, then call implement_step again.`,
      failedStep: step,
    };
  }

  private synthesizeReviews(context: ImplementWorkflowContext): string {
    const parts: string[] = [];

    if (context.reviews.gemini) {
      parts.push(`**Gemini Review:**`);
      parts.push(`- Feedback: ${context.reviews.gemini.feedback}`);
      if (context.reviews.gemini.suggestions.length > 0) {
        parts.push(`- Suggestions: ${context.reviews.gemini.suggestions.join(', ')}`);
      }
      if (context.reviews.gemini.concerns.length > 0) {
        parts.push(`- Concerns: ${context.reviews.gemini.concerns.join(', ')}`);
      }
    }

    if (context.reviews.olmo) {
      parts.push(`\n**OLMo Review:**`);
      parts.push(`- Feedback: ${context.reviews.olmo.feedback}`);
      if (context.reviews.olmo.suggestions.length > 0) {
        parts.push(`- Suggestions: ${context.reviews.olmo.suggestions.join(', ')}`);
      }
      if (context.reviews.olmo.concerns.length > 0) {
        parts.push(`- Concerns: ${context.reviews.olmo.concerns.join(', ')}`);
      }
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
