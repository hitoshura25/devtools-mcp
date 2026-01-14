/**
 * Real integration test for the implementation workflow orchestrator
 * This actually calls Ollama and OpenRouter (no mocks)
 *
 * Reviewer Architecture:
 * - ReviewerName: User-defined string (e.g., "olmo-local", "olmo-cloud")
 * - BackendType: Infrastructure provider ("ollama", "openrouter", "github-models")
 * - Config maps reviewer names to their backend configurations
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ImplementOrchestrator, reviewerRegistry } from '@hitoshura25/core';
import type { LanguageConfig } from '@hitoshura25/core';
import { writeFile, unlink, mkdir } from 'fs/promises';
import { exec, execSync } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';

const execAsync = promisify(exec);

// Check for Ollama backend synchronously
let hasOllamaBackend = false;
try {
  const output = execSync('curl -s http://localhost:11434/api/tags', { timeout: 5000, encoding: 'utf-8' });
  const tags = JSON.parse(output);
  hasOllamaBackend = tags.models?.some((m: { name: string }) => m.name.includes('olmo'));
} catch {
  hasOllamaBackend = false;
}

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
// Format: ACTIVE_REVIEWERS=olmo-local,olmo-cloud
const activeReviewers = process.env.ACTIVE_REVIEWERS?.split(',').map(r => r.trim()) || ['olmo-local'];

// Determine which backend each reviewer uses (from the config)
// For tests, we infer from reviewer name patterns:
// - "olmo-local" -> ollama backend
// - "olmo-cloud" -> openrouter backend
// - "*-github" or "phi4-github" -> github-models backend
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

// Check if all configured reviewers have available backends
const canRunTests = activeReviewers.every(reviewer => {
  const backend = inferBackendType(reviewer);
  return backendAvailability[backend] ?? false;
});

// Use describe.skip if prerequisites not met
const describeIntegration = canRunTests ? describe : describe.skip;

// Log skip reason at module load time if prerequisites not met
if (!canRunTests) {
  const skipReasons: string[] = [];
  const missingBackends = new Set<string>();

  activeReviewers.forEach(reviewer => {
    const backend = inferBackendType(reviewer);
    if (!backendAvailability[backend]) {
      missingBackends.add(backend);
    }
  });

  if (missingBackends.has('ollama')) {
    skipReasons.push('   Install Ollama with OLMo model:');
    skipReasons.push('     ollama pull olmo-3.1:32b-think');
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
    skipReasons.push('     Or in CI, use automatic ${{ secrets.GITHUB_TOKEN }}');
  }

  console.warn(
    `\nℹ️  Integration tests skipped: Required backends not available.\n` +
    `   Active reviewers: ${activeReviewers.join(', ')}\n` +
    `   Missing backends: ${Array.from(missingBackends).join(', ')}\n\n` +
    '   To run integration tests, ensure:\n' +
    skipReasons.join('\n') +
    '\n\n   Then run: pnpm test:integration\n'
  );
}

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

  it('should complete workflow with configured reviewer', async () => {
    // Use the first active reviewer for this test
    const reviewerName = activeReviewers[0];
    console.log(`🚀 Starting workflow with reviewer: ${reviewerName}`);

    // Step 1: Start workflow
    const startResult = await orchestrator.start({
      description: 'Add dark mode toggle to settings screen',
      projectPath: '.',
      reviewers: [reviewerName],
    });

    expect(startResult).toBeDefined();
    expect(startResult.workflowId).toBeDefined();
    expect(startResult.action.type).toBe('create_file');

    workflowId = startResult.workflowId;
    specPath = startResult.action.path!;

    console.log(`✅ Workflow created: ${workflowId}`);
    console.log(`   Spec path: ${specPath}`);

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
    expect(step1.phase).toBe('spec_created');

    // Step 4: Should get review action (reviews_pending phase)
    const step2 = await orchestrator.step(workflowId, { success: true });
    expect(step2.phase).toBe('reviews_pending');
    expect(step2.action?.type).toBe('shell');

    // Step 5: Execute review command
    const backendType = inferBackendType(reviewerName);
    console.log(`🤖 Executing ${reviewerName} review (${backendType} backend)...`);

    const reviewCommand = step2.action?.command;
    expect(reviewCommand).toBeDefined();

    // Verify the command matches the expected backend
    if (backendType === 'ollama') {
      expect(reviewCommand).toMatch(/ollama|localhost:11434/);
    } else if (backendType === 'openrouter') {
      expect(reviewCommand).toMatch(/openrouter\.ai/);
    }

    const { stdout: reviewOutput } = await execAsync(reviewCommand as string, {
      timeout: 300000, // 5 minutes for large model
      maxBuffer: 1024 * 1024 * 10,
    });

    expect(reviewOutput).toBeDefined();
    console.log(`✅ ${reviewerName} review received`);

    // Step 6: Submit review - should advance to reviews_complete then spec_refined
    const step3 = await orchestrator.step(workflowId, {
      success: true,
      output: reviewOutput,
    });

    // With single reviewer, we should go from reviews_pending -> reviews_complete
    expect(step3.phase).toBe('reviews_complete');

    // Step 7: Advance to spec_refined
    const step4 = await orchestrator.step(workflowId, { success: true });
    expect(step4.phase).toBe('spec_refined');

    // Verify review was stored with the reviewer name as key
    const status = await orchestrator.getStatus(workflowId);
    expect(status?.reviews[reviewerName]).toBeDefined();
    expect(status?.reviews[reviewerName]?.reviewer).toBe(reviewerName);
    console.log(`   ${reviewerName} approved: ${status?.reviews[reviewerName]?.approved}`);

    // Verify review structure
    const review = status?.reviews[reviewerName];
    expect(review?.feedback).toBeDefined();
    expect(review?.suggestions).toBeInstanceOf(Array);
    expect(review?.concerns).toBeInstanceOf(Array);
    expect(review?.backendType).toBeDefined();
    expect(review?.model).toBeDefined();

    // Save review to JSON file for analysis
    const reviewsOutput = {
      workflowId,
      timestamp: new Date().toISOString(),
      reviewer: reviewerName,
      backendType: review?.backendType,
      model: review?.model,
      review: review,
    };
    const outputPath = `src/__tests__/integration/test-output/ai-review-${reviewerName}.json`;
    await writeFile(
      outputPath,
      JSON.stringify(reviewsOutput, null, 2),
      'utf-8'
    );

    console.log(`✅ ${reviewerName} review completed and stored successfully`);
    console.log(`📄 Review saved to: ${outputPath}`);

  }, 420000); // 7 minute timeout

  it('should skip reviews when no reviewers configured', async () => {
    console.log('🚀 Starting workflow with no reviewers...');

    // Start workflow with empty reviewers array
    const startResult = await orchestrator.start({
      description: 'Add user authentication',
      projectPath: '.',
      reviewers: [],
    });

    workflowId = startResult.workflowId;
    specPath = startResult.action.path!;

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
    expect(step1.phase).toBe('spec_created');

    // With no reviewers, should skip directly to spec_refined
    const step2 = await orchestrator.step(workflowId, { success: true });
    expect(step2.phase).toBe('spec_refined');

    const status = await orchestrator.getStatus(workflowId);
    expect(status?.activeReviewers).toEqual([]);
    expect(status?.completedReviewers).toEqual([]);
    expect(Object.keys(status?.reviews || {})).toHaveLength(0);

    console.log('✅ No-reviewer workflow skipped reviews correctly');

  }, 30000); // 30 second timeout
});
