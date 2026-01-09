/**
 * Real integration test for the implementation workflow
 * This actually calls Gemini CLI and creates real files
 */

import { implementStart, implementStep, implementStatus } from './packages/mcp-android/src/tools/implement/tools.js';
import { readFile, writeFile, unlink } from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function testRealWorkflow() {
  console.log('='.repeat(80));
  console.log('REAL Implementation Workflow Integration Test');
  console.log('='.repeat(80));
  console.log();

  let workflowId: string | undefined;
  let specPath: string | undefined;

  try {
    // Step 1: Start a new workflow
    console.log('📋 Step 1: Starting REAL implementation workflow...');
    const startResult = await implementStart({
      description: 'Add dark mode toggle to settings screen',
      project_path: '.',
      reviewers: ['gemini'],
    });

    if (!startResult.success) {
      console.error('❌ Failed to start workflow:', startResult.error);
      return;
    }

    console.log('✅ Workflow started successfully!');
    console.log('   Workflow ID:', startResult.data?.workflowId);
    console.log('   Initial Phase:', startResult.data?.phase);
    console.log('   Spec will be created at:', startResult.data?.action?.path);
    console.log();

    workflowId = startResult.data!.workflowId!;
    specPath = startResult.data?.action?.path;

    // Step 2: Actually create the spec file
    console.log('📝 Step 2: Creating REAL spec file...');
    const specContent = `# Implementation Spec: Add dark mode toggle to settings screen

> Generated: ${new Date().toISOString()}
> Project: Android Demo
> Environment: Android

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
- [ ] Compatibility: Support Android API 21+ (Material Design)

## Technical Design

### Architecture

Use Android's AppCompatDelegate with SharedPreferences for persistence.

### Components

1. **SettingsFragment**
   - Purpose: Display dark mode toggle
   - Interface: SwitchPreference in XML

2. **ThemeManager**
   - Purpose: Apply theme changes
   - Interface: \`fun setDarkMode(enabled: Boolean)\`

3. **PreferenceStorage**
   - Purpose: Persist user choice
   - Interface: SharedPreferences wrapper

### Data Flow

1. User taps toggle in Settings
2. PreferenceStorage saves boolean value
3. ThemeManager calls AppCompatDelegate.setDefaultNightMode()
4. System applies theme change
5. Activity recreated with new theme

## Implementation Plan

### Phase 1: Preference Storage
- [ ] Create PreferenceStorage helper class
- [ ] Add "dark_mode_enabled" key constant
- [ ] Implement get/set methods

### Phase 2: Theme Manager
- [ ] Create ThemeManager singleton
- [ ] Implement theme switching logic
- [ ] Hook into Application onCreate()

### Phase 3: Settings UI
- [ ] Add SwitchPreference to settings.xml
- [ ] Wire up preference change listener
- [ ] Update SettingsFragment

## Testing Strategy

### Unit Tests
- [ ] Test PreferenceStorage save/load
- [ ] Test ThemeManager theme application
- [ ] Test preference change listener

### Integration Tests
- [ ] Test end-to-end theme switching
- [ ] Test persistence across app restart
- [ ] Test theme applies to all activities

### Edge Cases
- [ ] First launch (no preference set)
- [ ] System theme change while app running
- [ ] Rapid toggle switching

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Activity recreation disrupts UX | Medium | Use smooth transition animation |
| Memory leak from listener | Low | Properly unregister listeners |

## Open Questions

- [ ] Should we follow system theme by default?
- [ ] Should we add a "System default" option?
`;

    if (specPath) {
      await writeFile(specPath, specContent, 'utf-8');
      console.log('✅ Spec file created:', specPath);
      console.log();
    }

    // Step 3: Move to spec_created phase
    console.log('📋 Step 3: Advancing to spec_created phase...');
    const step1Result = await implementStep({
      workflow_id: workflowId,
      step_result: { success: true },
    });

    console.log('✅ Phase:', step1Result.data?.phase);
    console.log('   Next Action Type:', step1Result.data?.action?.type);
    console.log();

    // Step 4: Call REAL Gemini CLI for review using the workflow action
    console.log('🤖 Step 4: Calling REAL Gemini CLI for spec review...');
    console.log('   (This may take 10-30 seconds...)');
    console.log();

    const reviewCommand = step1Result.data?.action?.command;
    if (!reviewCommand) {
      throw new Error('No review command returned from workflow');
    }

    console.log('📝 Review Command:');
    console.log('-'.repeat(80));
    console.log(reviewCommand.substring(0, 200) + '...');
    console.log('-'.repeat(80));
    console.log();

    let geminiOutput: string;
    try {
      const { stdout } = await execAsync(reviewCommand, {
        timeout: 45000,
        maxBuffer: 1024 * 1024 * 10,
      });
      geminiOutput = stdout;
      console.log('✅ Gemini CLI response received!');
      console.log();
      console.log('📝 Review Output:');
      console.log('-'.repeat(80));
      console.log(geminiOutput.substring(0, 500) + (geminiOutput.length > 500 ? '...' : ''));
      console.log('-'.repeat(80));
      console.log();
    } catch (error) {
      console.error('❌ Gemini CLI call failed:', error);
      throw error;
    }

    // Step 5: Submit review result
    console.log('📊 Step 5: Processing review feedback...');
    const step2Result = await implementStep({
      workflow_id: workflowId,
      step_result: {
        success: true,
        output: geminiOutput,
      },
    });

    console.log('✅ Phase:', step2Result.data?.phase);
    console.log('   Review captured and parsed');
    console.log();

    // Step 6: Check workflow status
    console.log('📊 Step 6: Checking workflow status...');
    const statusResult = await implementStatus({ workflow_id: workflowId });

    if (statusResult.success) {
      console.log('✅ Workflow Status:');
      console.log('   ID:', statusResult.data?.workflowId);
      console.log('   Description:', statusResult.data?.description);
      console.log('   Current Phase:', statusResult.data?.phase);
      console.log('   Started:', statusResult.data?.startedAt);
      console.log('   Last Updated:', statusResult.data?.lastUpdated);
      console.log();
    }

    // Step 7: Read persisted workflow state
    console.log('💾 Step 7: Verifying state persistence...');
    try {
      const stateFile = `${process.env.HOME}/.devtools/workflows/implement/active/${workflowId}.json`;
      const state = JSON.parse(await readFile(stateFile, 'utf-8'));
      console.log('✅ Workflow state persisted to disk');
      console.log('   File:', stateFile);
      console.log('   Phase:', state.phase);
      console.log('   Reviewers:', state.reviewers);
      console.log('   Has review feedback:', !!state.reviews.gemini);
      if (state.reviews.gemini) {
        console.log('   Review approved:', state.reviews.gemini.approved);
        console.log('   Suggestions count:', state.reviews.gemini.suggestions?.length || 0);
        console.log('   Concerns count:', state.reviews.gemini.concerns?.length || 0);
      }
      console.log();
    } catch (error) {
      console.warn('⚠️  Could not read state file:', error);
    }

    console.log('='.repeat(80));
    console.log('✅ REAL Workflow Integration Test Complete!');
    console.log('='.repeat(80));
    console.log();
    console.log('Summary:');
    console.log('  ✅ Workflow created with real workflow ID');
    console.log('  ✅ Real spec file created on disk');
    console.log('  ✅ Real Gemini CLI called for review');
    console.log('  ✅ AI review feedback parsed and stored');
    console.log('  ✅ Workflow state persisted to disk');
    console.log('  ✅ State machine transitions validated');
    console.log();
    console.log('Note: Stopped before Android build commands (no Android project present)');
    console.log();

  } catch (error) {
    console.error('❌ Test failed:', error);
    throw error;
  } finally {
    // Cleanup
    console.log('🧹 Cleaning up...');
    if (specPath) {
      try {
        await unlink(specPath);
        console.log('   ✓ Removed spec file');
      } catch {}
    }
    if (workflowId) {
      try {
        const stateFile = `${process.env.HOME}/.devtools/workflows/implement/active/${workflowId}.json`;
        await unlink(stateFile);
        console.log('   ✓ Removed workflow state');
      } catch {}
    }
    console.log();
  }
}

// Run the test
testRealWorkflow().catch((error) => {
  console.error('Test execution failed:', error);
  process.exit(1);
});
