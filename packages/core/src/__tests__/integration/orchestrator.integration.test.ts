/**
 * Real integration test for the implementation workflow orchestrator
 * This actually calls Ollama and OpenRouter (no mocks)
 *
 * Reviewer Architecture:
 * - ReviewerName: User-defined string (e.g., "olmo-local", "olmo-cloud")
 * - BackendType: Infrastructure provider ("ollama", "openrouter", "github-models")
 * - Config maps reviewer names to their backend configurations
 *
 * Verbose Mode:
 * - Set TEST_VERBOSE=true or DEBUG=true for detailed output
 * - Shows commands, responses, phase transitions, and timing
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ImplementOrchestrator, reviewerRegistry } from '@hitoshura25/core';
import type { LanguageConfig } from '@hitoshura25/core';
import { writeFile, unlink, mkdir } from 'fs/promises';
import { exec, execSync } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';

const execAsync = promisify(exec);

// =============================================================================
// Verbose Logging Helpers
// =============================================================================

const VERBOSE = process.env.TEST_VERBOSE === 'true' || process.env.DEBUG === 'true';

function log(message: string, data?: unknown) {
  if (VERBOSE) {
    console.log(`[TEST] ${message}`);
    if (data !== undefined) {
      console.log(JSON.stringify(data, null, 2));
    }
  }
}

function logPhase(from: string, to: string) {
  if (VERBOSE) {
    console.log(`\n[PHASE] ${from} -> ${to}`);
  }
}

function logCommand(command: string) {
  if (VERBOSE) {
    console.log('\n┌─ Command ─────────────────────────────────────────────────────');
    // Truncate very long commands for readability
    const displayCmd = command.length > 500
      ? command.slice(0, 500) + '\n...[truncated]'
      : command;
    console.log(displayCmd);
    console.log('└────────────────────────────────────────────────────────────────\n');
  }
}

function logResponse(reviewerName: string, output: string) {
  if (VERBOSE) {
    console.log(`\n┌─ Response from ${reviewerName} ────────────────────────────────`);
    // Show first 1000 chars of response
    const displayOutput = output.length > 1000
      ? output.slice(0, 1000) + '\n...[truncated]'
      : output;
    console.log(displayOutput);
    console.log('└────────────────────────────────────────────────────────────────\n');
  }
}

function logTiming(label: string, startTime: number) {
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`${label} (${duration}s)`);
}

/**
 * Execute a command with progress indicator
 * Shows elapsed time every 15 seconds while waiting for long-running operations
 * Uses process.stderr.write which is unbuffered (unlike console.log which vitest buffers)
 */
async function execWithProgress(
  command: string,
  label: string,
  options: { timeout: number; maxBuffer: number }
): Promise<{ stdout: string; stderr: string }> {
  const startTime = Date.now();
  let progressInterval: ReturnType<typeof setInterval> | null = null;

  // Progress output function - writes directly to stderr (unbuffered)
  const logProgress = (message: string) => {
    process.stderr.write(`${message}\n`);
  };

  // Start progress indicator (every 15 seconds)
  if (VERBOSE) {
    logProgress(`   ⏳ ${label} - sending request to model...`);

    progressInterval = setInterval(() => {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      logProgress(`   ⏳ ${label} - still waiting... ${elapsed}s elapsed`);
    }, 15000); // Every 15 seconds
  }

  try {
    const result = await execAsync(command, options);
    return result;
  } finally {
    if (progressInterval) {
      clearInterval(progressInterval);
    }
  }
}

// =============================================================================
// Backend Availability Detection
// =============================================================================

// Check for available Ollama models
interface OllamaModel {
  name: string;
}

let availableOllamaModels: string[] = [];
try {
  const output = execSync('curl -s http://localhost:11434/api/tags', { timeout: 5000, encoding: 'utf-8' });
  const tags = JSON.parse(output);
  availableOllamaModels = tags.models?.map((m: OllamaModel) => m.name) || [];
  log('Available Ollama models:', availableOllamaModels);
} catch {
  availableOllamaModels = [];
}

// Check which specific models are available
const hasOlmoModel = availableOllamaModels.some(m => m.includes('olmo'));
const hasGeminiModel = availableOllamaModels.some(m => m.includes('gemini'));
const hasOllamaBackend = availableOllamaModels.length > 0;

// Check for OpenRouter backend (API key present)
const hasOpenRouterBackend = !!process.env.OPENROUTER_API_KEY;

// Check for GitHub Models backend (token present)
const hasGitHubModelsBackend = !!(process.env.GITHUB_TOKEN || process.env.GH_PAT);

// Map of backend types to availability
const backendAvailability: Record<string, boolean> = {
  'ollama': hasOllamaBackend,
  'openrouter': hasOpenRouterBackend,
  'github-models': hasGitHubModelsBackend,
};

// Get active reviewers from environment (new format) or default
// Format: ACTIVE_REVIEWERS=olmo-local,gemini-local
const activeReviewers = process.env.ACTIVE_REVIEWERS?.split(',').map(r => r.trim()) || ['olmo-local', 'gemini-local'];

// Determine which backend each reviewer uses (from the config)
// For tests, we infer from reviewer name patterns:
// - "*-local" or "*-ollama" -> ollama backend
// - "*-cloud" or "*-openrouter" -> openrouter backend
// - "*-github" or "phi*" -> github-models backend
function inferBackendType(reviewerName: string): string {
  if (reviewerName.includes('-local') || reviewerName.endsWith('-ollama')) {
    return 'ollama';
  }
  if (reviewerName.includes('-cloud') || reviewerName.endsWith('-openrouter')) {
    return 'openrouter';
  }
  if (reviewerName.includes('-github') || reviewerName.startsWith('phi')) {
    return 'github-models';
  }
  // Default to ollama for unrecognized patterns
  return 'ollama';
}

// Check if specific reviewer's model is available
function isReviewerAvailable(reviewerName: string): boolean {
  const backend = inferBackendType(reviewerName);

  if (backend !== 'ollama') {
    return backendAvailability[backend] ?? false;
  }

  // For ollama backend, check if the specific model is available
  if (reviewerName.includes('olmo')) {
    return hasOlmoModel;
  }
  if (reviewerName.includes('gemini')) {
    return hasGeminiModel;
  }

  // Default: just check ollama is running
  return hasOllamaBackend;
}

// Check if all configured reviewers are available
const unavailableReviewers = activeReviewers.filter(r => !isReviewerAvailable(r));
const canRunTests = unavailableReviewers.length === 0;

// Use describe.skip if prerequisites not met
const describeIntegration = canRunTests ? describe : describe.skip;

// Log skip reason at module load time if prerequisites not met
if (!canRunTests) {
  const skipReasons: string[] = [];
  const missingBackends = new Set<string>();

  unavailableReviewers.forEach(reviewer => {
    const backend = inferBackendType(reviewer);
    missingBackends.add(backend);

    if (backend === 'ollama') {
      if (reviewer.includes('olmo') && !hasOlmoModel) {
        skipReasons.push(`   Reviewer '${reviewer}' requires OLMo model:`);
        skipReasons.push('     ollama pull olmo-3.1:32b-think');
      }
      if (reviewer.includes('gemini') && !hasGeminiModel) {
        skipReasons.push(`   Reviewer '${reviewer}' requires Gemini model:`);
        skipReasons.push('     ollama pull gemini-3-flash-preview');
      }
    }
  });

  if (missingBackends.has('ollama') && !hasOllamaBackend) {
    skipReasons.push('   Start Ollama server:');
    skipReasons.push('     ollama serve');
  }
  if (missingBackends.has('openrouter')) {
    skipReasons.push('   Set up OpenRouter API (for CI):');
    skipReasons.push('     Get API key from https://openrouter.ai/keys');
    skipReasons.push('     export OPENROUTER_API_KEY=your_api_key');
  }
  if (missingBackends.has('github-models')) {
    skipReasons.push('   Set up GitHub Models API:');
    skipReasons.push('     export GITHUB_TOKEN=your_personal_access_token');
  }

  console.warn(
    `\n` +
    `┌─────────────────────────────────────────────────────────────────┐\n` +
    `│  Integration tests skipped: Required reviewers not available   │\n` +
    `└─────────────────────────────────────────────────────────────────┘\n` +
    `\n` +
    `   Active reviewers: ${activeReviewers.join(', ')}\n` +
    `   Unavailable: ${unavailableReviewers.join(', ')}\n` +
    `   Available Ollama models: ${availableOllamaModels.length > 0 ? availableOllamaModels.join(', ') : '(none)'}\n` +
    `\n` +
    `   To run integration tests:\n` +
    skipReasons.join('\n') +
    `\n\n` +
    `   Then run: pnpm test:integration\n` +
    `   For verbose output: TEST_VERBOSE=true pnpm test:integration\n`
  );
}

// =============================================================================
// Test Suite
// =============================================================================

describeIntegration('ImplementOrchestrator - Real AI Review Integration', () => {
  const testLanguageConfig: LanguageConfig = {
    name: 'Test',
    commands: {
      lint: 'echo "lint"',
      build: 'echo "build"',
      test: 'echo "test"',
    },
    testFilePatterns: ['**/*.test.ts'],
    sourceFilePatterns: ['**/*.ts'],
    specsDir: 'src/__tests__/integration/test-output/test-specs/',
  };

  let orchestrator: ImplementOrchestrator;
  let workflowId: string;
  let specPath: string;

  beforeAll(async () => {
    // Create test artifacts directories (all under test-output)
    if (!existsSync('src/__tests__/integration/test-output/test-specs')) {
      await mkdir('src/__tests__/integration/test-output/test-specs', { recursive: true });
    }

    orchestrator = new ImplementOrchestrator(testLanguageConfig, reviewerRegistry);

    if (VERBOSE) {
      console.log('\n' +
        '┌─────────────────────────────────────────────────────────────────┐\n' +
        '│  Verbose mode enabled - showing detailed test output           │\n' +
        '└─────────────────────────────────────────────────────────────────┘\n'
      );
      console.log(`Active reviewers: ${activeReviewers.join(', ')}`);
      console.log(`Available Ollama models: ${availableOllamaModels.join(', ')}\n`);
    }
  });

  afterAll(async () => {
    // Cleanup
    if (specPath && existsSync(specPath)) {
      await unlink(specPath).catch(() => {});
    }
    if (workflowId) {
      try {
        const stateFile = `${process.env.HOME}/.devtools/workflows/implement/active/${workflowId}.json`;
        await unlink(stateFile).catch(() => {});
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  it('should complete workflow with all configured reviewers', async () => {
    // Use all active reviewers for this test
    const reviewersToTest = activeReviewers.filter(r => isReviewerAvailable(r));
    console.log(`\n🚀 Starting workflow with reviewers: ${reviewersToTest.join(', ')}`);

    // Step 1: Start workflow
    log('Starting workflow...');
    const startTime = Date.now();
    const startResult = await orchestrator.start({
      description: 'Add dark mode toggle to settings screen',
      projectPath: '.',
      reviewers: reviewersToTest,
    });

    expect(startResult).toBeDefined();
    expect(startResult.workflowId).toBeDefined();
    expect(startResult.action.type).toBe('create_file');

    workflowId = startResult.workflowId;
    specPath = startResult.action.path!;

    console.log(`✅ Workflow created: ${workflowId}`);
    log(`Spec path: ${specPath}`);

    // Step 2: Create spec file
    const specContent = `# Implementation Spec: Add dark mode toggle to settings screen

> Generated: ${new Date().toISOString()}
> Project: Test Project

## Overview

**Objective:** Add a dark mode toggle to the app settings screen that persists user preference

**Scope:**
- In scope: Settings UI toggle, theme switching, preference storage
- Out of scope: Custom color schemes, per-screen theme override

## Requirements

### Functional Requirements

1. Add a toggle switch in the Settings screen labeled "Dark Mode"
2. Switching the toggle should immediately apply dark/light theme
3. User preference should persist across app restarts
4. Theme should apply to all screens in the app

### Non-Functional Requirements

- [ ] Performance: Theme switch should be instantaneous (<100ms)
- [ ] Security: No security concerns (local preference only)

## Technical Design

### Architecture

Use standard theme switching with preference storage.

### Components

1. **SettingsScreen**
   - Purpose: Display dark mode toggle
   - Interface: Toggle component

2. **ThemeManager**
   - Purpose: Apply theme changes
   - Interface: \`function setDarkMode(enabled: boolean)\`

3. **PreferenceStorage**
   - Purpose: Persist user choice
   - Interface: Storage wrapper

## Testing Strategy

### Unit Tests
- [ ] Test PreferenceStorage save/load
- [ ] Test ThemeManager theme application
- [ ] Test preference change listener

### Integration Tests
- [ ] Test end-to-end theme switching
- [ ] Test persistence across app restart
`;

    await writeFile(specPath, specContent, 'utf-8');
    console.log('✅ Spec file created');

    // Step 3: Advance to spec_created phase
    const step1 = await orchestrator.step(workflowId, { success: true });
    logPhase('initialized', step1.phase);
    expect(step1.phase).toBe('spec_created');

    // Step 4: Advance to reviews_pending (or spec_refined if no reviewers)
    const step2 = await orchestrator.step(workflowId, { success: true });
    logPhase('spec_created', step2.phase);

    if (reviewersToTest.length === 0) {
      // No reviewers - should skip to spec_refined
      expect(step2.phase).toBe('spec_refined');
      console.log('✅ No reviewers configured - skipped to spec_refined');
      return;
    }

    expect(step2.phase).toBe('reviews_pending');
    expect(step2.action?.type).toBe('shell');

    // Process each reviewer in the queue
    let currentPhase = step2.phase;
    let currentAction = step2.action;
    const completedReviews: Record<string, unknown> = {};
    let reviewerIndex = 0;

    while (currentPhase === 'reviews_pending' && currentAction?.command) {
      const currentReviewer = reviewersToTest[reviewerIndex];
      const backendType = inferBackendType(currentReviewer);
      const reviewStartTime = Date.now();

      console.log(`\n🤖 Executing ${currentReviewer} review (${backendType} backend)...`);
      logCommand(currentAction.command);

      // Verify the command matches the expected backend
      if (backendType === 'ollama') {
        expect(currentAction.command).toMatch(/ollama|localhost:11434/);
      } else if (backendType === 'openrouter') {
        expect(currentAction.command).toMatch(/openrouter\.ai/);
      }

      // Execute the review command with progress indicator
      const { stdout: reviewOutput } = await execWithProgress(
        currentAction.command,
        currentReviewer,
        {
          timeout: 300000, // 5 minutes for large model
          maxBuffer: 1024 * 1024 * 10,
        }
      );

      expect(reviewOutput).toBeDefined();
      logResponse(currentReviewer, reviewOutput);
      logTiming(`✅ ${currentReviewer} review received`, reviewStartTime);

      // Submit the review result
      const stepResult = await orchestrator.step(workflowId, {
        success: true,
        output: reviewOutput,
      });

      logPhase('reviews_pending', stepResult.phase);
      currentPhase = stepResult.phase;
      currentAction = stepResult.action;

      // Track completed review
      const status = await orchestrator.getStatus(workflowId);
      if (status?.reviews[currentReviewer]) {
        completedReviews[currentReviewer] = status.reviews[currentReviewer];
      }

      reviewerIndex++;
    }

    // Should now be at reviews_complete
    expect(currentPhase).toBe('reviews_complete');

    // Advance to spec_refined
    const refineStep = await orchestrator.step(workflowId, { success: true });
    logPhase('reviews_complete', refineStep.phase);
    expect(refineStep.phase).toBe('spec_refined');

    // Verify all reviews were stored correctly
    const finalStatus = await orchestrator.getStatus(workflowId);
    for (const reviewerName of reviewersToTest) {
      expect(finalStatus?.reviews[reviewerName]).toBeDefined();
      expect(finalStatus?.reviews[reviewerName]?.reviewer).toBe(reviewerName);
      console.log(`   ${reviewerName} approved: ${finalStatus?.reviews[reviewerName]?.approved}`);
    }

    // Verify review structure for each
    for (const reviewerName of reviewersToTest) {
      const review = finalStatus?.reviews[reviewerName];
      expect(review?.feedback).toBeDefined();
      expect(review?.suggestions).toBeInstanceOf(Array);
      expect(review?.concerns).toBeInstanceOf(Array);
      expect(review?.backendType).toBeDefined();
      expect(review?.model).toBeDefined();
    }

    // Save all reviews to JSON file for analysis
    const reviewsOutput = {
      workflowId,
      timestamp: new Date().toISOString(),
      reviewers: reviewersToTest,
      reviews: finalStatus?.reviews,
    };
    const outputPath = `src/__tests__/integration/test-output/ai-reviews-multi.json`;
    await writeFile(
      outputPath,
      JSON.stringify(reviewsOutput, null, 2),
      'utf-8'
    );

    logTiming(`\n✅ All ${reviewersToTest.length} reviews completed successfully`, startTime);
    console.log(`📄 Reviews saved to: ${outputPath}`);

  }, 600000); // 10 minute timeout for multiple reviewers

  it('should skip reviews when no reviewers configured', async () => {
    console.log('\n🚀 Starting workflow with no reviewers...');

    // Start workflow with empty reviewers array
    const startResult = await orchestrator.start({
      description: 'Add user authentication',
      projectPath: '.',
      reviewers: [],
    });

    workflowId = startResult.workflowId;
    specPath = startResult.action.path!;
    log(`Workflow ID: ${workflowId}`);

    // Create minimal spec
    const specContent = `# Implementation Spec: Add user authentication

## Overview
Add basic user authentication to the app.

## Requirements
- User login/logout
- Session management
`;

    await writeFile(specPath, specContent, 'utf-8');

    // Advance to spec_created
    const step1 = await orchestrator.step(workflowId, { success: true });
    logPhase('initialized', step1.phase);
    expect(step1.phase).toBe('spec_created');

    // With no reviewers, should skip directly to spec_refined
    const step2 = await orchestrator.step(workflowId, { success: true });
    logPhase('spec_created', step2.phase);
    expect(step2.phase).toBe('spec_refined');

    const status = await orchestrator.getStatus(workflowId);
    expect(status?.activeReviewers).toEqual([]);
    expect(status?.completedReviewers).toEqual([]);
    expect(Object.keys(status?.reviews || {})).toHaveLength(0);

    console.log('✅ No-reviewer workflow skipped reviews correctly');

  }, 30000); // 30 second timeout
});
