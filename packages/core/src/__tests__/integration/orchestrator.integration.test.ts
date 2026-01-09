/**
 * Real integration test for the implementation workflow orchestrator
 * This actually calls Gemini CLI and Ollama (no mocks)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ImplementOrchestrator } from '../../workflows/implement/orchestrator.js';
import { reviewerRegistry } from '../../reviewers/registry.js';
import { writeFile, unlink, mkdir } from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import type { LanguageConfig } from '../../workflows/implement/types.js';

const execAsync = promisify(exec);

// Check if Gemini is available (local CLI with cached credentials OR Docker with GOOGLE_API_KEY)
let hasGemini = false;
try {
  const { execSync } = require('child_process');
  // Try local Gemini CLI first (uses cached credentials)
  execSync('gemini "test" --model gemini-2.5-flash-lite', { timeout: 15000, stdio: 'ignore' });
  hasGemini = true;
} catch {
  // Local CLI failed, check if Docker + GOOGLE_API_KEY available
  try {
    const { execSync } = require('child_process');
    execSync('docker info', { timeout: 5000, stdio: 'ignore' });
    hasGemini = !!process.env.GOOGLE_API_KEY; // Docker requires API key
  } catch {
    hasGemini = false;
  }
}

// Check for Ollama synchronously
let hasOllama = false;
try {
  const { execSync } = require('child_process');
  const output = execSync('curl -s http://localhost:11434/api/tags', { timeout: 5000, encoding: 'utf-8' });
  const tags = JSON.parse(output);
  hasOllama = tags.models?.some((m: { name: string }) => m.name.includes('olmo'));
} catch {
  hasOllama = false;
}

const canRunTests = hasGemini && hasOllama;

// Use describe.skip if prerequisites not met
const describeIntegration = canRunTests ? describe : describe.skip;

// Log skip reason at module load time if prerequisites not met
if (!canRunTests) {
  const skipReasons: string[] = [];
  if (!hasGemini) {
    skipReasons.push('   Install Gemini CLI with cached credentials:');
    skipReasons.push('     npm install -g @google/generative-ai-cli');
    skipReasons.push('     gemini auth  # Follow auth prompts');
    skipReasons.push('   OR use Docker:');
    skipReasons.push('     export GOOGLE_API_KEY=your_api_key');
    skipReasons.push('     docker pull us-docker.pkg.dev/gemini-code-dev/gemini-cli/sandbox:0.1.1');
  }
  if (!hasOllama) {
    skipReasons.push('   Install Ollama with OLMo model:');
    skipReasons.push('     ollama pull olmo-3.1:32b-think');
    skipReasons.push('     ollama serve');
  }

  console.warn(
    '\nℹ️  Integration tests skipped: Required reviewers not available.\n' +
    '   To run integration tests, ensure:\n' +
    skipReasons.join('\n') +
    '\n   Then run: pnpm test:integration\n'
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
    specsDir: 'test-specs/',
  };

  let orchestrator: ImplementOrchestrator;
  let workflowId: string;
  let specPath: string;

  beforeAll(async () => {
    // Create test artifacts directories
    if (!existsSync('test-specs')) {
      await mkdir('test-specs', { recursive: true });
    }
    if (!existsSync('src/__tests__/integration/test-output')) {
      await mkdir('src/__tests__/integration/test-output', { recursive: true });
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
      } catch {}
    }
  });

  it('should complete full workflow with Gemini and OLMo reviews', async () => {
    console.log('🚀 Starting workflow with both Gemini and OLMo reviewers...');

    // Step 1: Start workflow
    const startResult = await orchestrator.start({
      description: 'Add dark mode toggle to settings screen',
      projectPath: '.',
      reviewers: ['gemini', 'olmo'],
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
    expect(step1.action?.type).toBe('shell');

    // Step 4: Execute Gemini review
    console.log('🤖 Executing Gemini review (may take 30-60 seconds)...');
    const geminiCommand = step1.action?.command!;
    expect(geminiCommand).toContain('gemini');

    const { stdout: geminiOutput } = await execAsync(geminiCommand, {
      timeout: 90000,
      maxBuffer: 1024 * 1024 * 10,
    });

    expect(geminiOutput).toBeDefined();
    console.log('✅ Gemini review received');

    // Step 5: Submit Gemini review
    const step2 = await orchestrator.step(workflowId, {
      success: true,
      output: geminiOutput,
    });

    expect(step2.phase).toBe('olmo_review_pending');
    expect(step2.action?.type).toBe('shell');

    const status1 = await orchestrator.getStatus(workflowId);
    expect(status1?.reviews.gemini).toBeDefined();
    expect(status1?.reviews.gemini?.reviewer).toBe('gemini');
    console.log(`   Gemini approved: ${status1?.reviews.gemini?.approved}`);

    // Step 6: Execute OLMo review
    console.log('🤖 Executing OLMo review (may take 3-5 minutes for 32B model)...');
    const olmoCommand = step2.action?.command!;
    expect(olmoCommand).toMatch(/ollama|localhost:11434/); // Matches Ollama API endpoint

    const { stdout: olmoOutput } = await execAsync(olmoCommand, {
      timeout: 300000, // 5 minutes for large model
      maxBuffer: 1024 * 1024 * 10,
    });

    expect(olmoOutput).toBeDefined();
    console.log('✅ OLMo review received');

    // Step 7: Submit OLMo review
    const step3 = await orchestrator.step(workflowId, {
      success: true,
      output: olmoOutput,
    });

    expect(step3.phase).toBe('spec_refined');

    const status2 = await orchestrator.getStatus(workflowId);
    expect(status2?.reviews.olmo).toBeDefined();
    expect(status2?.reviews.olmo?.reviewer).toBe('olmo');
    console.log(`   OLMo approved: ${status2?.reviews.olmo?.approved}`);

    // Verify both reviews are stored
    expect(status2?.reviews.gemini).toBeDefined();
    expect(status2?.reviews.olmo).toBeDefined();

    // Verify review structure
    expect(status2?.reviews.gemini?.feedback).toBeDefined();
    expect(status2?.reviews.gemini?.suggestions).toBeInstanceOf(Array);
    expect(status2?.reviews.gemini?.concerns).toBeInstanceOf(Array);

    expect(status2?.reviews.olmo?.feedback).toBeDefined();
    expect(status2?.reviews.olmo?.suggestions).toBeInstanceOf(Array);
    expect(status2?.reviews.olmo?.concerns).toBeInstanceOf(Array);

    // Save reviews to JSON file for analysis
    const reviewsOutput = {
      workflowId,
      timestamp: new Date().toISOString(),
      gemini: status2?.reviews.gemini,
      olmo: status2?.reviews.olmo,
    };
    const outputPath = 'src/__tests__/integration/test-output/ai-reviews-dual.json';
    await writeFile(
      outputPath,
      JSON.stringify(reviewsOutput, null, 2),
      'utf-8'
    );

    console.log('✅ Both AI reviews completed and stored successfully');
    console.log(`📄 Reviews saved to: ${outputPath}`);

  }, 420000); // 7 minute timeout (Gemini ~1min + OLMo ~5min + overhead)

  it('should handle Gemini-only workflow', async () => {
    console.log('🚀 Starting workflow with Gemini only...');

    // Start workflow with only Gemini
    const startResult = await orchestrator.start({
      description: 'Add user authentication',
      projectPath: '.',
      reviewers: ['gemini'],
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

    // Execute Gemini review
    console.log('🤖 Executing Gemini review...');
    const { stdout } = await execAsync(step1.action?.command!, {
      timeout: 90000,
      maxBuffer: 1024 * 1024 * 10,
    });

    // Submit review - should go directly to spec_refined (skip OLMo)
    const step2 = await orchestrator.step(workflowId, {
      success: true,
      output: stdout,
    });

    expect(step2.phase).toBe('spec_refined');

    const status = await orchestrator.getStatus(workflowId);
    expect(status?.reviews.gemini).toBeDefined();
    expect(status?.reviews.olmo).toBeUndefined();

    // Save review to JSON file for analysis
    const reviewsOutput = {
      workflowId,
      timestamp: new Date().toISOString(),
      gemini: status?.reviews.gemini,
    };
    const outputPath = 'src/__tests__/integration/test-output/ai-reviews-gemini-only.json';
    await writeFile(
      outputPath,
      JSON.stringify(reviewsOutput, null, 2),
      'utf-8'
    );

    console.log('✅ Gemini-only workflow completed');
    console.log(`📄 Review saved to: ${outputPath}`);

  }, 120000); // 2 minute timeout
});
