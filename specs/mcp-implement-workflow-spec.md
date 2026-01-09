# MCP Implementation Workflow Orchestrator Specification

## Overview

Add an **implementation workflow orchestrator** to the devtools-mcp monorepo that enables reliable, multi-step feature implementation through explicit state machine enforcement and AI reviewer integration.

**Problem Statement:** Claude Skills achieve only 40-60% reliability for multi-step processes because agents can skip steps, misinterpret instructions, or lose context across session limits. The `/devtools:implement` command needs deterministic execution with validation at each step.

**Solution:** A shared workflow engine in `@hitoshura25/core` that:
1. Creates implementation specs in a documented format
2. Integrates with external AI reviewers (Gemini CLI, OLMo via Ollama)
3. Enforces step-by-step execution via state machine
4. Persists workflow state to disk for session recovery
5. Returns explicit, copy-paste-able commands for Claude Code to execute

Each language-specific MCP server (mcp-android, future mcp-typescript) imports the workflow engine and provides language-specific commands (lint, build, test).

**Key Design Decisions:**
- **Fail on reviewer unavailability** (strict mode, configurable later)
- **File-based state persistence** for session recovery
- **Markdown spec format** (existing convention)
- **Docker-first** for external dependencies (Gemini CLI, OLMo)
- **Language-specific commands** defined by each MCP server, not core

---

## Architecture

### High-Level Flow

```
┌──────────────────────────────────────────────────────────────────┐
│ Claude Code                                                      │
│                                                                  │
│  User: "implement Add OAuth2 login support"                      │
│                                                                  │
│  1. Claude calls implement_start(description)                    │
│     ← MCP returns: "Create spec at specs/oauth2-login.md"        │
│                                                                  │
│  2. Claude creates the spec file                                 │
│     Claude calls implement_step(workflowId, {success: true})     │
│     ← MCP returns: "Run Gemini review: docker run ..."           │
│                                                                  │
│  3. Claude runs the Docker command, captures output              │
│     Claude calls implement_step(workflowId, {output: "..."})     │
│     ← MCP returns: "Run OLMo review: curl localhost:11434..."    │
│                                                                  │
│  4. ... continues through all phases ...                         │
│                                                                  │
│  N. Claude calls implement_step(workflowId, {success: true})     │
│     ← MCP returns: "Implementation complete!"                    │
└──────────────────────────────────────────────────────────────────┘
```

### Package Structure

```
packages/
├── core/
│   └── src/
│       ├── index.ts                    # Existing exports + new
│       ├── executor.ts                 # Existing
│       ├── discovery.ts                # Existing
│       ├── results.ts                  # Existing
│       ├── errors.ts                   # Existing
│       ├── progress.ts                 # Existing
│       │
│       ├── workflows/                  # NEW - Shared workflow engine
│       │   ├── types.ts                # Workflow interfaces
│       │   ├── state-machine.ts        # Generic state machine
│       │   ├── persistence.ts          # File-based state storage
│       │   ├── implement/              # Implementation workflow
│       │   │   ├── types.ts            # LanguageCommands, context types
│       │   │   ├── workflow.ts         # State machine definition
│       │   │   ├── phases.ts           # Phase definitions
│       │   │   ├── spec-template.ts    # Markdown template
│       │   │   ├── orchestrator.ts     # Main orchestrator class
│       │   │   └── index.ts
│       │   └── index.ts
│       │
│       └── reviewers/                  # NEW - Language-agnostic reviewers
│           ├── types.ts                # ReviewerAdapter interface
│           ├── gemini.ts               # Gemini CLI adapter
│           ├── ollama.ts               # Ollama adapter (OLMo)
│           ├── registry.ts             # Available reviewers
│           └── index.ts
│
├── mcp-android/                        # EXISTING - Add implement tools
│   └── src/
│       ├── server.ts                   # Add implement tools
│       ├── tools/
│       │   ├── quality/                # Existing
│       │   ├── icon/                   # Existing  
│       │   └── implement/              # NEW - Android-specific
│       │       ├── commands.ts         # Android commands (gradlew)
│       │       ├── tools.ts            # MCP tool handlers
│       │       └── index.ts
│       └── ...
│
└── mcp-typescript/                     # FUTURE
    └── src/
        └── tools/
            └── implement/
                ├── commands.ts         # TypeScript commands (pnpm)
                ├── tools.ts
                └── index.ts
```

### Separation of Concerns

| Component | Location | Responsibility |
|-----------|----------|----------------|
| State machine | `core/workflows/` | Phase transitions, validation |
| Persistence | `core/workflows/persistence.ts` | Save/load workflow state |
| Reviewers | `core/reviewers/` | Gemini CLI, OLMo adapters |
| Spec template | `core/workflows/implement/` | Markdown generation |
| Orchestrator | `core/workflows/implement/orchestrator.ts` | Coordinates workflow execution |
| Android commands | `mcp-android/tools/implement/` | `./gradlew lint`, `./gradlew test` |
| TypeScript commands | `mcp-typescript/tools/implement/` | `pnpm lint`, `pnpm test` |
| MCP tools | Each MCP server | Tool registration, I/O handling |

---

## Language Commands Interface

Each MCP server must provide language-specific commands:

```typescript
// packages/core/src/workflows/implement/types.ts

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

export interface LanguageConfig {
  /** Display name (e.g., "Android", "TypeScript") */
  name: string;
  
  /** Commands for verification phases */
  commands: LanguageCommands;
  
  /** File patterns for test files (e.g., ["**/*.test.ts", "**/*Test.kt"]) */
  testFilePatterns: string[];
  
  /** File patterns for source files */
  sourceFilePatterns: string[];
  
  /** Directory for specs (default: "specs/") */
  specsDir?: string;
}
```

### Android Implementation

```typescript
// packages/mcp-android/src/tools/implement/commands.ts

import type { LanguageConfig } from '@hitoshura25/core';

export const androidConfig: LanguageConfig = {
  name: 'Android',
  commands: {
    lint: './gradlew lint',
    build: './gradlew assembleDebug',
    test: './gradlew testDebugUnitTest',
  },
  testFilePatterns: [
    '**/src/test/**/*Test.kt',
    '**/src/androidTest/**/*Test.kt',
  ],
  sourceFilePatterns: [
    '**/src/main/**/*.kt',
    '**/src/main/**/*.java',
  ],
  specsDir: 'specs/',
};
```

### TypeScript Implementation (Future)

```typescript
// packages/mcp-typescript/src/tools/implement/commands.ts

import type { LanguageConfig } from '@hitoshura25/core';

export const typescriptConfig: LanguageConfig = {
  name: 'TypeScript',
  commands: {
    lint: 'pnpm lint',
    build: 'pnpm build',
    test: 'pnpm test',
    typeCheck: 'pnpm tsc --noEmit',
    formatCheck: 'pnpm prettier --check .',
  },
  testFilePatterns: [
    '**/*.test.ts',
    '**/*.spec.ts',
    '**/__tests__/**/*.ts',
  ],
  sourceFilePatterns: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
  ],
  specsDir: 'specs/',
};
```

---

## Workflow State Machine

### Implementation Phases

```typescript
// packages/core/src/workflows/implement/phases.ts

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
```

### State Transitions Diagram

```
INITIALIZED
  └─→ create_spec → SPEC_CREATED

SPEC_CREATED
  └─→ start_gemini_review → GEMINI_REVIEW_PENDING

GEMINI_REVIEW_PENDING
  └─→ submit_review_result → GEMINI_REVIEW_COMPLETE

GEMINI_REVIEW_COMPLETE
  ├─→ start_olmo_review → OLMO_REVIEW_PENDING (if olmo enabled)
  └─→ refine_spec → SPEC_REFINED (if olmo disabled)

OLMO_REVIEW_PENDING
  └─→ submit_review_result → OLMO_REVIEW_COMPLETE

OLMO_REVIEW_COMPLETE
  └─→ refine_spec → SPEC_REFINED

SPEC_REFINED
  └─→ start_tests → TESTS_PENDING

TESTS_PENDING
  └─→ submit_tests_created → TESTS_CREATED

TESTS_CREATED
  └─→ start_implementation → IMPLEMENTATION_PENDING

IMPLEMENTATION_PENDING
  └─→ submit_implementation → IMPLEMENTATION_COMPLETE

IMPLEMENTATION_COMPLETE
  └─→ start_lint → LINT_PENDING

LINT_PENDING
  └─→ submit_lint_result → LINT_PASSED | FAILED

LINT_PASSED
  └─→ start_build → BUILD_PENDING

BUILD_PENDING
  └─→ submit_build_result → BUILD_PASSED | FAILED

BUILD_PASSED
  └─→ start_tests_run → TESTS_RUN_PENDING

TESTS_RUN_PENDING
  └─→ submit_tests_result → TESTS_PASSED | FAILED

TESTS_PASSED
  └─→ finalize → COMPLETE

Any state can transition to:
  └─→ abort → ABORTED
```

### Workflow Context

```typescript
// packages/core/src/workflows/implement/types.ts

export interface ImplementWorkflowContext {
  // Identity
  workflowId: string;
  createdAt: string;           // ISO timestamp
  updatedAt: string;           // ISO timestamp
  
  // Configuration
  description: string;
  projectPath: string;
  languageConfig: LanguageConfig;
  reviewers: ReviewerType[];   // ['gemini', 'olmo']
  
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

export interface ReviewResult {
  reviewer: string;
  timestamp: string;
  feedback: string;
  suggestions: string[];
  concerns: string[];
  approved: boolean;
}

export interface CommandResult {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}
```

---

## Orchestrator Class

The orchestrator lives in core and is used by each MCP server:

```typescript
// packages/core/src/workflows/implement/orchestrator.ts

import { nanoid } from 'nanoid';
import { FileWorkflowStorage } from '../persistence.js';
import { reviewerRegistry } from '../../reviewers/registry.js';
import { generateSpecTemplate, getSpecFileName } from './spec-template.js';
import { ImplementPhase, canTransition, getNextPhase } from './phases.js';
import type {
  ImplementWorkflowContext,
  LanguageConfig,
  ReviewerType,
  StepResult,
  WorkflowAction,
} from './types.js';

export class ImplementOrchestrator {
  private storage: FileWorkflowStorage<ImplementWorkflowContext>;
  private languageConfig: LanguageConfig;

  constructor(languageConfig: LanguageConfig) {
    this.languageConfig = languageConfig;
    this.storage = new FileWorkflowStorage('implement');
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
    for (const reviewer of reviewers) {
      const availability = await reviewerRegistry.checkAvailability(reviewer);
      if (!availability.available) {
        throw new ReviewerUnavailableError(reviewer, availability);
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

  private async processStep(
    context: ImplementWorkflowContext,
    stepResult?: StepResult
  ): Promise<{ nextPhase: ImplementPhase; action: WorkflowAction | null }> {
    const { phase, languageConfig } = context;

    switch (phase) {
      case ImplementPhase.INITIALIZED:
        // Spec should have been created
        return {
          nextPhase: ImplementPhase.SPEC_CREATED,
          action: this.getGeminiReviewAction(context),
        };

      case ImplementPhase.SPEC_CREATED:
        return {
          nextPhase: ImplementPhase.GEMINI_REVIEW_PENDING,
          action: this.getGeminiReviewAction(context),
        };

      case ImplementPhase.GEMINI_REVIEW_PENDING:
        if (stepResult?.output) {
          const adapter = reviewerRegistry.get('gemini');
          context.reviews.gemini = adapter.parseReviewOutput(stepResult.output);
        }
        
        const hasOlmo = context.reviewers.includes('olmo');
        return {
          nextPhase: hasOlmo 
            ? ImplementPhase.OLMO_REVIEW_PENDING 
            : ImplementPhase.SPEC_REFINED,
          action: hasOlmo 
            ? this.getOlmoReviewAction(context)
            : this.getRefineSpecAction(context),
        };

      case ImplementPhase.OLMO_REVIEW_PENDING:
        if (stepResult?.output) {
          const adapter = reviewerRegistry.get('olmo');
          context.reviews.olmo = adapter.parseReviewOutput(stepResult.output);
        }
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
    const adapter = reviewerRegistry.get('gemini');
    const command = adapter.getReviewCommand(
      context.specContent ?? '',
      { projectPath: context.projectPath }
    );
    
    return {
      type: 'shell',
      command,
      instruction: 'Run the Gemini review command and capture the output',
      captureOutput: true,
    };
  }

  private getOlmoReviewAction(context: ImplementWorkflowContext): WorkflowAction {
    const adapter = reviewerRegistry.get('olmo');
    const command = adapter.getReviewCommand(
      context.specContent ?? '',
      { projectPath: context.projectPath }
    );
    
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

  private parseCommandResult(stepResult: StepResult | undefined, command: string): CommandResult | null {
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

export class ReviewerUnavailableError extends Error {
  constructor(
    public reviewer: string,
    public availability: { reason?: string; installInstructions?: string }
  ) {
    super(`Reviewer '${reviewer}' is not available: ${availability.reason}`);
    this.name = 'ReviewerUnavailableError';
  }
}
```

---

## State Persistence

### Storage Location

```
~/.devtools/
└── workflows/
    └── implement/
        ├── active/                    # Currently running workflows
        │   ├── abc123.json
        │   └── def456.json
        └── completed/                 # Finished workflows (success/fail/abort)
            ├── 2024-01-15_abc123.json
            └── 2024-01-14_def456.json
```

### Persistence Implementation

```typescript
// packages/core/src/workflows/persistence.ts

import { mkdir, readFile, writeFile, rename, readdir, unlink } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

export interface WorkflowStorage<T> {
  save(workflowId: string, context: T): Promise<void>;
  load(workflowId: string): Promise<T | null>;
  list(): Promise<string[]>;
  archive(workflowId: string): Promise<void>;
  delete(workflowId: string): Promise<void>;
}

export class FileWorkflowStorage<T> implements WorkflowStorage<T> {
  private baseDir: string;
  private activeDir: string;
  private completedDir: string;

  constructor(workflowType: string) {
    this.baseDir = join(homedir(), '.devtools', 'workflows', workflowType);
    this.activeDir = join(this.baseDir, 'active');
    this.completedDir = join(this.baseDir, 'completed');
  }

  async initialize(): Promise<void> {
    await mkdir(this.activeDir, { recursive: true });
    await mkdir(this.completedDir, { recursive: true });
  }

  async save(workflowId: string, context: T): Promise<void> {
    await this.initialize();
    const filePath = join(this.activeDir, `${workflowId}.json`);
    await writeFile(filePath, JSON.stringify(context, null, 2), 'utf-8');
  }

  async load(workflowId: string): Promise<T | null> {
    try {
      const filePath = join(this.activeDir, `${workflowId}.json`);
      const content = await readFile(filePath, 'utf-8');
      return JSON.parse(content) as T;
    } catch {
      return null;
    }
  }

  async list(): Promise<string[]> {
    try {
      await this.initialize();
      const files = await readdir(this.activeDir);
      return files
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.replace('.json', ''));
    } catch {
      return [];
    }
  }

  async archive(workflowId: string): Promise<void> {
    const sourcePath = join(this.activeDir, `${workflowId}.json`);
    const date = new Date().toISOString().split('T')[0];
    const destPath = join(this.completedDir, `${date}_${workflowId}.json`);
    await rename(sourcePath, destPath);
  }

  async delete(workflowId: string): Promise<void> {
    const filePath = join(this.activeDir, `${workflowId}.json`);
    await unlink(filePath);
  }
}
```

---

## Reviewer Adapters

### Adapter Interface

```typescript
// packages/core/src/reviewers/types.ts

export type ReviewerType = 'gemini' | 'olmo';

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

export interface ReviewerAvailability {
  available: boolean;
  reason?: string;
  installInstructions?: string;
}

export interface ReviewContext {
  projectPath: string;
  projectType?: string;
  additionalContext?: string;
}

export interface ReviewResult {
  reviewer: string;
  timestamp: string;
  feedback: string;
  suggestions: string[];
  concerns: string[];
  approved: boolean;
}
```

### Gemini CLI Adapter (Docker)

```typescript
// packages/core/src/reviewers/gemini.ts

import { execCommand } from '../executor.js';
import type { ReviewerAdapter, ReviewerAvailability, ReviewContext, ReviewResult } from './types.js';

const GEMINI_DOCKER_IMAGE = 'us-docker.pkg.dev/gemini-code-dev/gemini-cli/sandbox:0.1.1';

export class GeminiReviewer implements ReviewerAdapter {
  name = 'gemini' as const;

  async checkAvailability(): Promise<ReviewerAvailability> {
    // Check Docker is running
    const dockerCheck = await execCommand('docker info', { timeout: 10000 });
    if (dockerCheck.exitCode !== 0) {
      return {
        available: false,
        reason: 'Docker is not running',
        installInstructions: 'Start Docker Desktop or run: sudo systemctl start docker',
      };
    }

    // Check image exists or can be pulled
    const imageCheck = await execCommand(
      `docker image inspect ${GEMINI_DOCKER_IMAGE}`,
      { timeout: 10000 }
    );
    
    if (imageCheck.exitCode !== 0) {
      // Try to pull
      const pullResult = await execCommand(
        `docker pull ${GEMINI_DOCKER_IMAGE}`,
        { timeout: 120000 }
      );
      
      if (pullResult.exitCode !== 0) {
        return {
          available: false,
          reason: 'Cannot pull Gemini CLI Docker image',
          installInstructions: `Run: docker pull ${GEMINI_DOCKER_IMAGE}`,
        };
      }
    }

    // Check GOOGLE_API_KEY is set
    if (!process.env.GOOGLE_API_KEY) {
      return {
        available: false,
        reason: 'GOOGLE_API_KEY environment variable not set',
        installInstructions: 
          'Set GOOGLE_API_KEY: export GOOGLE_API_KEY="your-key"\n' +
          'Get a key at: https://aistudio.google.com/app/apikey',
      };
    }

    return { available: true };
  }

  getReviewCommand(spec: string, context: ReviewContext): string {
    // Escape the spec content for shell
    const escapedSpec = spec
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\$/g, '\\$')
      .replace(/`/g, '\\`');

    const prompt = `You are reviewing an implementation specification. Analyze it for:
1. Completeness - Are all requirements clearly defined?
2. Feasibility - Is this technically achievable?
3. Edge cases - What scenarios might be missed?
4. Security - Any security concerns?
5. Testing - What tests should be written?

Respond in JSON format:
{
  "approved": boolean,
  "feedback": "overall assessment",
  "suggestions": ["suggestion 1", "suggestion 2"],
  "concerns": ["concern 1", "concern 2"],
  "recommended_tests": ["test case 1", "test case 2"]
}

SPECIFICATION:
${escapedSpec}`;

    return `docker run --rm \\
  -e GOOGLE_API_KEY="$GOOGLE_API_KEY" \\
  ${GEMINI_DOCKER_IMAGE} \\
  -p "${prompt}" \\
  --output-format json`;
  }

  parseReviewOutput(output: string): ReviewResult {
    try {
      const jsonMatch = output.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return {
          reviewer: 'gemini',
          timestamp: new Date().toISOString(),
          feedback: output,
          suggestions: [],
          concerns: [],
          approved: false,
        };
      }

      const parsed = JSON.parse(jsonMatch[0]);
      return {
        reviewer: 'gemini',
        timestamp: new Date().toISOString(),
        feedback: parsed.feedback || output,
        suggestions: parsed.suggestions || [],
        concerns: parsed.concerns || [],
        approved: parsed.approved ?? false,
      };
    } catch {
      return {
        reviewer: 'gemini',
        timestamp: new Date().toISOString(),
        feedback: output,
        suggestions: [],
        concerns: [],
        approved: false,
      };
    }
  }
}
```

### Ollama Adapter (OLMo)

```typescript
// packages/core/src/reviewers/ollama.ts

import { execCommand } from '../executor.js';
import type { ReviewerAdapter, ReviewerAvailability, ReviewContext, ReviewResult } from './types.js';

const OLLAMA_BASE_URL = 'http://localhost:11434';
const OLMO_MODEL = 'olmo-3';

export class OllamaReviewer implements ReviewerAdapter {
  name = 'olmo' as const;
  
  private baseUrl: string;
  private model: string;

  constructor(options?: { baseUrl?: string; model?: string }) {
    this.baseUrl = options?.baseUrl ?? OLLAMA_BASE_URL;
    this.model = options?.model ?? OLMO_MODEL;
  }

  async checkAvailability(): Promise<ReviewerAvailability> {
    // Check if Ollama is running
    const healthCheck = await execCommand(
      `curl -s -o /dev/null -w "%{http_code}" ${this.baseUrl}/api/tags`,
      { timeout: 5000 }
    );
    
    if (healthCheck.exitCode !== 0 || healthCheck.stdout.trim() !== '200') {
      return {
        available: false,
        reason: 'Ollama is not running',
        installInstructions: 
          'Install Ollama: https://ollama.ai/download\n' +
          'Then run: ollama serve',
      };
    }

    // Check if OLMo model is available
    const modelCheck = await execCommand(
      `curl -s ${this.baseUrl}/api/tags`,
      { timeout: 5000 }
    );
    
    if (modelCheck.exitCode === 0) {
      try {
        const tags = JSON.parse(modelCheck.stdout);
        const hasOlmo = tags.models?.some((m: { name: string }) => 
          m.name.includes('olmo')
        );
        
        if (!hasOlmo) {
          return {
            available: false,
            reason: `OLMo model not found`,
            installInstructions: `Run: ollama pull ${this.model}`,
          };
        }
      } catch {
        // Couldn't parse, but service is up - try anyway
      }
    }

    return { available: true };
  }

  getReviewCommand(spec: string, context: ReviewContext): string {
    // Escape for JSON
    const escapedSpec = spec
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n');

    const prompt = `You are reviewing an implementation specification. Analyze it for:
1. Completeness - Are all requirements clearly defined?
2. Feasibility - Is this technically achievable?
3. Edge cases - What scenarios might be missed?
4. Security - Any security concerns?
5. Testing - What tests should be written?

Respond in JSON format:
{
  "approved": boolean,
  "feedback": "overall assessment",
  "suggestions": ["suggestion 1", "suggestion 2"],
  "concerns": ["concern 1", "concern 2"],
  "recommended_tests": ["test case 1", "test case 2"]
}

SPECIFICATION:
${escapedSpec}`;

    // Use OpenAI-compatible API
    return `curl -s ${this.baseUrl}/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${this.model}",
    "messages": [{"role": "user", "content": "${prompt}"}],
    "temperature": 0.3
  }'`;
  }

  parseReviewOutput(output: string): ReviewResult {
    try {
      const response = JSON.parse(output);
      const content = response.choices?.[0]?.message?.content || output;
      
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          reviewer: 'olmo',
          timestamp: new Date().toISOString(),
          feedback: parsed.feedback || content,
          suggestions: parsed.suggestions || [],
          concerns: parsed.concerns || [],
          approved: parsed.approved ?? false,
        };
      }
      
      return {
        reviewer: 'olmo',
        timestamp: new Date().toISOString(),
        feedback: content,
        suggestions: [],
        concerns: [],
        approved: false,
      };
    } catch {
      return {
        reviewer: 'olmo',
        timestamp: new Date().toISOString(),
        feedback: output,
        suggestions: [],
        concerns: [],
        approved: false,
      };
    }
  }
}
```

### Reviewer Registry

```typescript
// packages/core/src/reviewers/registry.ts

import { GeminiReviewer } from './gemini.js';
import { OllamaReviewer } from './ollama.js';
import type { ReviewerAdapter, ReviewerType, ReviewerAvailability } from './types.js';

export class ReviewerRegistry {
  private adapters: Map<ReviewerType, ReviewerAdapter> = new Map();

  constructor() {
    this.adapters.set('gemini', new GeminiReviewer());
    this.adapters.set('olmo', new OllamaReviewer());
  }

  get(type: ReviewerType): ReviewerAdapter {
    const adapter = this.adapters.get(type);
    if (!adapter) {
      throw new Error(`Unknown reviewer type: ${type}`);
    }
    return adapter;
  }

  async checkAvailability(type: ReviewerType): Promise<ReviewerAvailability> {
    const adapter = this.get(type);
    return adapter.checkAvailability();
  }
}

export const reviewerRegistry = new ReviewerRegistry();
```

---

## MCP Tool Integration (Android Example)

### Adding Implement Tools to mcp-android

```typescript
// packages/mcp-android/src/tools/implement/commands.ts

import type { LanguageConfig } from '@hitoshura25/core';

export const androidConfig: LanguageConfig = {
  name: 'Android',
  commands: {
    lint: './gradlew lint',
    build: './gradlew assembleDebug',
    test: './gradlew testDebugUnitTest',
  },
  testFilePatterns: [
    '**/src/test/**/*Test.kt',
    '**/src/androidTest/**/*Test.kt',
  ],
  sourceFilePatterns: [
    '**/src/main/**/*.kt',
    '**/src/main/**/*.java',
  ],
  specsDir: 'specs/',
};
```

```typescript
// packages/mcp-android/src/tools/implement/tools.ts

import { ImplementOrchestrator, ReviewerUnavailableError } from '@hitoshura25/core';
import { androidConfig } from './commands.js';

// Singleton orchestrator for this MCP server
const orchestrator = new ImplementOrchestrator(androidConfig);

export interface ImplementStartInput {
  description: string;
  project_path?: string;
  reviewers?: ('gemini' | 'olmo')[];
}

export async function implementStart(input: ImplementStartInput) {
  try {
    const result = await orchestrator.start({
      description: input.description,
      projectPath: input.project_path ?? '.',
      reviewers: input.reviewers,
    });

    return {
      status: 'initialized',
      workflowId: result.workflowId,
      phase: 'initialized',
      action: result.action,
      nextTool: 'implement_step',
    };
  } catch (error) {
    if (error instanceof ReviewerUnavailableError) {
      return {
        status: 'error',
        error: `Reviewer '${error.reviewer}' is not available`,
        reason: error.availability.reason,
        installInstructions: error.availability.installInstructions,
      };
    }
    throw error;
  }
}

export interface ImplementStepInput {
  workflow_id: string;
  step_result?: {
    success: boolean;
    output?: string;
    files_created?: string[];
    files_modified?: string[];
  };
}

export async function implementStep(input: ImplementStepInput) {
  const result = await orchestrator.step(input.workflow_id, input.step_result);

  if (result.complete) {
    return {
      status: 'workflow_complete',
      phase: result.phase,
      action: result.action,
      nextTool: null,
    };
  }

  return {
    status: 'step_complete',
    phase: result.phase,
    action: result.action,
    nextTool: 'implement_step',
  };
}

export interface ImplementStatusInput {
  workflow_id?: string;
}

export async function implementStatus(input: ImplementStatusInput) {
  if (input.workflow_id) {
    const context = await orchestrator.getStatus(input.workflow_id);
    if (!context) {
      return { status: 'error', error: 'Workflow not found' };
    }
    return {
      status: 'active',
      workflowId: context.workflowId,
      phase: context.phase,
      description: context.description,
      startedAt: context.createdAt,
      lastUpdated: context.updatedAt,
    };
  }

  const activeIds = await orchestrator.listActive();
  return {
    activeWorkflows: activeIds,
    instruction: 'Call implement_status with a workflow_id to get details',
  };
}

export interface ImplementAbortInput {
  workflow_id: string;
  reason?: string;
}

export async function implementAbort(input: ImplementAbortInput) {
  await orchestrator.abort(input.workflow_id, input.reason);
  return {
    status: 'aborted',
    workflowId: input.workflow_id,
  };
}
```

```typescript
// packages/mcp-android/src/tools/implement/index.ts

export * from './commands.js';
export * from './tools.js';
```

### Registering Tools in server.ts

```typescript
// packages/mcp-android/src/server.ts (additions)

import {
  implementStart,
  implementStep,
  implementStatus,
  implementAbort,
} from './tools/implement/index.js';

// Add to tools array
const tools: Tool[] = [
  // ... existing quality tools ...
  // ... existing icon tools ...
  
  // Implement tools
  {
    name: 'implement_start',
    description: 'Start a new feature implementation workflow with AI review',
    inputSchema: {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          description: 'Description of the feature to implement',
        },
        project_path: {
          type: 'string',
          description: 'Path to Android project root (default: ".")',
          default: '.',
        },
        reviewers: {
          type: 'array',
          items: { enum: ['gemini', 'olmo'] },
          description: 'AI reviewers to use (default: ["gemini"])',
          default: ['gemini'],
        },
      },
      required: ['description'],
    },
  },
  {
    name: 'implement_step',
    description: 'Execute the next step in an implementation workflow',
    inputSchema: {
      type: 'object',
      properties: {
        workflow_id: {
          type: 'string',
          description: 'The workflow ID from implement_start',
        },
        step_result: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            output: { type: 'string' },
            files_created: { type: 'array', items: { type: 'string' } },
            files_modified: { type: 'array', items: { type: 'string' } },
          },
        },
      },
      required: ['workflow_id'],
    },
  },
  {
    name: 'implement_status',
    description: 'Get status of implementation workflows',
    inputSchema: {
      type: 'object',
      properties: {
        workflow_id: {
          type: 'string',
          description: 'Specific workflow ID (omit to list all active)',
        },
      },
    },
  },
  {
    name: 'implement_abort',
    description: 'Abort an implementation workflow',
    inputSchema: {
      type: 'object',
      properties: {
        workflow_id: { type: 'string' },
        reason: { type: 'string' },
      },
      required: ['workflow_id'],
    },
  },
];

// Add to CallToolRequestSchema handler
case 'implement_start':
  return formatMcpResponse(await implementStart(args as ImplementStartInput));
case 'implement_step':
  return formatMcpResponse(await implementStep(args as ImplementStepInput));
case 'implement_status':
  return formatMcpResponse(await implementStatus(args as ImplementStatusInput));
case 'implement_abort':
  return formatMcpResponse(await implementAbort(args as ImplementAbortInput));
```

---

## Spec Template

```typescript
// packages/core/src/workflows/implement/spec-template.ts

export function generateSpecTemplate(
  description: string,
  projectPath: string,
  languageName: string
): string {
  const timestamp = new Date().toISOString();

  return `# Implementation Spec: ${description}

> Generated: ${timestamp}
> Project: ${projectPath}
> Environment: ${languageName}

## Overview

**Objective:** ${description}

**Scope:** [Define what is in scope and out of scope]

## Requirements

### Functional Requirements

1. [Requirement 1]
2. [Requirement 2]
3. [Requirement 3]

### Non-Functional Requirements

- [ ] Performance: [Specify any performance requirements]
- [ ] Security: [Specify any security requirements]
- [ ] Compatibility: [Specify any compatibility requirements]

## Technical Design

### Architecture

[Describe the high-level architecture]

### Components

1. **[Component 1]**
   - Purpose: 
   - Interface:
   
2. **[Component 2]**
   - Purpose:
   - Interface:

### Data Flow

[Describe how data flows through the system]

## Implementation Plan

### Phase 1: [Phase Name]
- [ ] Task 1
- [ ] Task 2

### Phase 2: [Phase Name]
- [ ] Task 1
- [ ] Task 2

## Testing Strategy

### Unit Tests
- [ ] [Test case 1]
- [ ] [Test case 2]

### Integration Tests
- [ ] [Test case 1]
- [ ] [Test case 2]

### Edge Cases
- [ ] [Edge case 1]
- [ ] [Edge case 2]

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| [Risk 1] | [Impact] | [Mitigation] |

## Open Questions

- [ ] [Question 1]
- [ ] [Question 2]

---

## Review Feedback

### Gemini Review
> [Will be populated after review]

### OLMo Review  
> [Will be populated after review]

### Synthesis
> [Will be populated after reviews complete]
`;
}

export function getSpecFileName(description: string): string {
  const slug = description
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
  
  return `${slug}.md`;
}
```

---

## Testing Requirements

### Unit Tests for Core

**`packages/core/src/__tests__/workflows/implement/workflow.test.ts`:**
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import {
  ImplementPhase,
  canTransition,
} from '../../../workflows/implement/phases.js';

describe('ImplementWorkflow Phases', () => {
  describe('canTransition', () => {
    it('allows INITIALIZED → SPEC_CREATED', () => {
      expect(canTransition(ImplementPhase.INITIALIZED, 'create_spec')).toBe(true);
    });

    it('blocks INITIALIZED → GEMINI_REVIEW_PENDING', () => {
      expect(canTransition(ImplementPhase.INITIALIZED, 'start_gemini_review')).toBe(false);
    });

    it('allows SPEC_CREATED → GEMINI_REVIEW_PENDING', () => {
      expect(canTransition(ImplementPhase.SPEC_CREATED, 'start_gemini_review')).toBe(true);
    });
  });
});
```

**`packages/core/src/__tests__/workflows/persistence.test.ts`:**
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FileWorkflowStorage } from '../../../workflows/persistence.js';
import { rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('FileWorkflowStorage', () => {
  let storage: FileWorkflowStorage<{ test: string }>;
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `workflow-test-${Date.now()}`);
    storage = new FileWorkflowStorage('test');
    // Override paths for testing
    // @ts-expect-error - accessing private for test
    storage.baseDir = testDir;
    // @ts-expect-error
    storage.activeDir = join(testDir, 'active');
    // @ts-expect-error
    storage.completedDir = join(testDir, 'completed');
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('saves and loads workflow', async () => {
    await storage.save('test-123', { test: 'value' });
    const loaded = await storage.load('test-123');
    expect(loaded).toEqual({ test: 'value' });
  });

  it('returns null for non-existent workflow', async () => {
    const loaded = await storage.load('non-existent');
    expect(loaded).toBeNull();
  });

  it('lists active workflows', async () => {
    await storage.save('wf-1', { test: '1' });
    await storage.save('wf-2', { test: '2' });
    
    const list = await storage.list();
    expect(list).toContain('wf-1');
    expect(list).toContain('wf-2');
  });
});
```

**`packages/core/src/__tests__/reviewers/gemini.test.ts`:**
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiReviewer } from '../../../reviewers/gemini.js';
import * as executor from '../../../executor.js';

vi.mock('../../../executor.js');

describe('GeminiReviewer', () => {
  let reviewer: GeminiReviewer;

  beforeEach(() => {
    vi.resetAllMocks();
    reviewer = new GeminiReviewer();
  });

  describe('checkAvailability', () => {
    it('returns unavailable when Docker not running', async () => {
      vi.mocked(executor.execCommand).mockResolvedValueOnce({
        exitCode: 1,
        stdout: '',
        stderr: 'Cannot connect to Docker daemon',
        durationMs: 100,
        timedOut: false,
      });

      const result = await reviewer.checkAvailability();
      expect(result.available).toBe(false);
      expect(result.reason).toContain('Docker');
    });
  });

  describe('parseReviewOutput', () => {
    it('parses valid JSON response', () => {
      const output = JSON.stringify({
        approved: true,
        feedback: 'Looks good',
        suggestions: ['Add tests'],
        concerns: [],
      });

      const result = reviewer.parseReviewOutput(output);
      expect(result.approved).toBe(true);
      expect(result.feedback).toBe('Looks good');
    });

    it('handles malformed output gracefully', () => {
      const result = reviewer.parseReviewOutput('Not JSON');
      expect(result.approved).toBe(false);
      expect(result.feedback).toBe('Not JSON');
    });
  });
});
```

### Unit Tests for mcp-android

**`packages/mcp-android/src/__tests__/tools/implement/tools.test.ts`:**
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { implementStart } from '../../../tools/implement/tools.js';
import * as core from '@hitoshura25/core';

vi.mock('@hitoshura25/core', async () => {
  const actual = await vi.importActual('@hitoshura25/core');
  return {
    ...actual,
    reviewerRegistry: {
      checkAvailability: vi.fn(),
    },
  };
});

describe('implement_start', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns error when reviewer unavailable', async () => {
    vi.mocked(core.reviewerRegistry.checkAvailability).mockResolvedValue({
      available: false,
      reason: 'Docker not running',
      installInstructions: 'Start Docker',
    });

    const result = await implementStart({
      description: 'Test feature',
      reviewers: ['gemini'],
    });

    expect(result.status).toBe('error');
    expect(result.reason).toContain('Docker');
  });
});
```

---

## Build Verification

### Verification Checklist

```bash
# From monorepo root
cd ~/devtools-mcp

# 1. Install dependencies
pnpm install

# 2. Build all packages (must succeed)
pnpm build
# Expected: No errors

# 3. Lint (must pass)
pnpm lint
# Expected: No errors

# 4. Run unit tests (must pass)
pnpm test
# Expected: All tests pass

# 5. Verify core exports workflows and reviewers
node -e "import('@hitoshura25/core').then(m => console.log(Object.keys(m).filter(k => k.includes('workflow') || k.includes('reviewer') || k.includes('Implement'))))"
# Expected: Lists workflow and reviewer exports

# 6. Verify mcp-android has implement tools
node -e "import('@hitoshura25/mcp-android').then(m => console.log(Object.keys(m).filter(k => k.includes('implement'))))"
# Expected: Lists implement tool exports
```

---

## External Dependency Verification

**CRITICAL:** Before implementation, Claude Code must verify these dependencies exist and work.

### Docker Images

```bash
# Verify Gemini CLI Docker image is pullable
docker pull us-docker.pkg.dev/gemini-code-dev/gemini-cli/sandbox:0.1.1

# If this fails, check:
# 1. Docker is running
# 2. Network connectivity
# 3. Image tag may have changed - search for current tag
```

### Ollama and OLMo

```bash
# Verify Ollama is installed and running
ollama --version
curl http://localhost:11434/api/tags

# Pull OLMo model
ollama pull olmo-3

# Verify model works
ollama run olmo-3 "Hello, respond with just 'OK'"
```

### Environment Variables

```bash
# For Gemini CLI
export GOOGLE_API_KEY="your-key-here"

# Verify it works
docker run --rm \
  -e GOOGLE_API_KEY="$GOOGLE_API_KEY" \
  us-docker.pkg.dev/gemini-code-dev/gemini-cli/sandbox:0.1.1 \
  -p "Say hello" \
  --output-format json
```

---

## Deliverables Checklist

### packages/core additions

- [ ] `src/workflows/types.ts` - Generic workflow interfaces
- [ ] `src/workflows/state-machine.ts` - Generic state machine utilities
- [ ] `src/workflows/persistence.ts` - File-based storage
- [ ] `src/workflows/implement/types.ts` - LanguageCommands, context types
- [ ] `src/workflows/implement/phases.ts` - Phase definitions
- [ ] `src/workflows/implement/workflow.ts` - State transitions
- [ ] `src/workflows/implement/orchestrator.ts` - Main orchestrator class
- [ ] `src/workflows/implement/spec-template.ts` - Markdown template
- [ ] `src/workflows/implement/index.ts` - Re-exports
- [ ] `src/workflows/index.ts` - Re-exports
- [ ] `src/reviewers/types.ts` - Reviewer interfaces
- [ ] `src/reviewers/gemini.ts` - Gemini CLI adapter
- [ ] `src/reviewers/ollama.ts` - Ollama/OLMo adapter
- [ ] `src/reviewers/registry.ts` - Reviewer registry
- [ ] `src/reviewers/index.ts` - Re-exports
- [ ] `src/index.ts` - Update with new exports
- [ ] `src/__tests__/workflows/implement/workflow.test.ts`
- [ ] `src/__tests__/workflows/persistence.test.ts`
- [ ] `src/__tests__/reviewers/gemini.test.ts`
- [ ] `src/__tests__/reviewers/ollama.test.ts`

### packages/mcp-android additions

- [ ] `src/tools/implement/commands.ts` - Android-specific commands
- [ ] `src/tools/implement/tools.ts` - MCP tool handlers
- [ ] `src/tools/implement/index.ts` - Re-exports
- [ ] `src/server.ts` - Register implement tools
- [ ] `src/__tests__/tools/implement/tools.test.ts`
- [ ] `README.md` - Document implement tools

### Verification

- [ ] `pnpm build` succeeds
- [ ] `pnpm lint` passes  
- [ ] `pnpm test` passes
- [ ] Docker Gemini image is pullable
- [ ] Ollama OLMo model works

---

## Usage Example (Android)

```bash
# In Claude Code session with mcp-android connected

User: implement Add Health Connect sync feature

Claude: [calls implement_start with description]
       Checking reviewer availability...
       ✓ Gemini CLI available
       
       Creating implementation spec...
       
       [creates specs/add-health-connect-sync-feature.md]
       [calls implement_step]

Claude: Running Gemini review...
       [executes docker command]
       [calls implement_step with output]

Claude: Reviews complete. Feedback:
       - Suggestions: Add retry logic for sync failures
       - Concerns: Consider battery optimization
       
       [updates spec with feedback]
       [calls implement_step]

Claude: Creating tests...
       [creates src/test/kotlin/HealthConnectSyncTest.kt]
       [calls implement_step]

Claude: Implementing feature...
       [creates implementation files]
       [calls implement_step]

Claude: Running ./gradlew lint...
       [executes lint]
       [calls implement_step]

Claude: Running ./gradlew assembleDebug...
       [executes build]
       [calls implement_step]

Claude: Running ./gradlew testDebugUnitTest...
       [executes tests]
       [calls implement_step]

Claude: ✅ Implementation complete!
       Files created:
       - src/main/kotlin/com/example/sync/HealthConnectSync.kt
       - src/test/kotlin/com/example/sync/HealthConnectSyncTest.kt
       
       All checks passed.
```

---

## Future: Adding TypeScript Support

To add TypeScript/Node.js support, create a new `packages/mcp-typescript` with:

```typescript
// packages/mcp-typescript/src/tools/implement/commands.ts

import type { LanguageConfig } from '@hitoshura25/core';

export const typescriptConfig: LanguageConfig = {
  name: 'TypeScript',
  commands: {
    lint: 'pnpm lint',
    build: 'pnpm build',
    test: 'pnpm test',
    typeCheck: 'pnpm tsc --noEmit',
  },
  testFilePatterns: ['**/*.test.ts', '**/__tests__/**/*.ts'],
  sourceFilePatterns: ['src/**/*.ts'],
  specsDir: 'specs/',
};
```

Then follow the same pattern as mcp-android for registering the tools.

---

## Future Enhancements

1. **Configurable strictness** - Allow continuing with warnings if reviewers unavailable
2. **Custom reviewers** - Plugin system for additional AI reviewers  
3. **Project type auto-detection** - Detect language from project files
4. **Parallel reviews** - Run Gemini and OLMo reviews concurrently
5. **Review caching** - Cache reviews for similar specs
6. **mcpd integration** - Use Mozilla mcpd for centralized orchestration
