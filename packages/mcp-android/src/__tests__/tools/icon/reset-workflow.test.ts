import { describe, it, expect, beforeEach } from 'vitest';
import { iconResetWorkflow } from '../../../tools/icon/reset-workflow.js';
import { iconGetStatus } from '../../../tools/icon/get-status.js';
import {
  resetIconContext,
  updateIconContext,
  IconWorkflowState,
  getIconContext,
} from '../../../state/icon-workflow.js';

describe('icon_reset_workflow', () => {
  beforeEach(() => {
    resetIconContext();
  });

  it('resets workflow to initial state', async () => {
    // Set some state
    updateIconContext({
      state: IconWorkflowState.VERIFIED,
      projectPath: '/test/project',
      searchTerm: 'health',
      selectedIcon: 'mdi:heart',
    });

    const result = await iconResetWorkflow();

    expect(result.success).toBe(true);
    expect(result.data?.status).toBe('reset');

    const ctx = getIconContext();
    expect(ctx.state).toBe(IconWorkflowState.INITIAL);
    expect(ctx.projectPath).toBeNull();
    expect(ctx.searchTerm).toBeNull();
    expect(ctx.selectedIcon).toBeNull();
  });

  it('provides next step guidance after reset', async () => {
    updateIconContext({ state: IconWorkflowState.VERIFIED });

    const result = await iconResetWorkflow();

    expect(result.success).toBe(true);
    expect(result.data?.next).toContain('icon_preflight_check');
  });

  it('can be called from any state', async () => {
    const states = [
      IconWorkflowState.INITIAL,
      IconWorkflowState.PREFLIGHT_PASSED,
      IconWorkflowState.SEARCH_COMPLETE,
      IconWorkflowState.VERIFIED,
    ];

    for (const state of states) {
      updateIconContext({ state });
      const result = await iconResetWorkflow();
      expect(result.success).toBe(true);
    }
  });
});

describe('icon_get_status', () => {
  beforeEach(() => {
    resetIconContext();
  });

  it('returns current workflow state', async () => {
    updateIconContext({
      state: IconWorkflowState.SEARCH_COMPLETE,
      projectPath: '/test/project',
      searchTerm: 'health',
      searchResults: [
        {
          id: 'mdi:heart',
          collection: 'Material Design Icons',
          license: 'Apache 2.0',
          preview_url: 'https://example.com',
        },
      ],
    });

    const result = await iconGetStatus();

    expect(result.success).toBe(true);
    expect(result.data?.state).toBe(IconWorkflowState.SEARCH_COMPLETE);
    expect(result.data?.project_path).toBe('/test/project');
    expect(result.data?.search_term).toBe('health');
    expect(result.data?.search_results_count).toBe(1);
  });

  it('returns available actions for current state', async () => {
    updateIconContext({ state: IconWorkflowState.SEARCH_COMPLETE });

    const result = await iconGetStatus();

    expect(result.success).toBe(true);
    expect(result.data?.available_actions).toContain('icon_search');
    expect(result.data?.available_actions).toContain('icon_select');
  });

  it('handles initial state correctly', async () => {
    const result = await iconGetStatus();

    expect(result.success).toBe(true);
    expect(result.data?.state).toBe(IconWorkflowState.INITIAL);
    expect(result.data?.project_path).toBeNull();
    expect(result.data?.search_results_count).toBe(0);
  });

  it('includes legacy files count when present', async () => {
    updateIconContext({
      state: IconWorkflowState.AWAITING_LEGACY_CONFIRMATION,
      legacyFiles: ['app/res/mipmap-hdpi/ic_launcher.png', 'app/res/mipmap-mdpi/ic_launcher.png'],
    });

    const result = await iconGetStatus();

    expect(result.success).toBe(true);
    expect(result.data?.legacy_files_found).toBe(2);
  });
});
