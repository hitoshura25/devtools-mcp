import { describe, it, expect, beforeEach } from 'vitest';
import {
  IconWorkflowState,
  getIconContext,
  updateIconContext,
  resetIconContext,
  canTransition,
  getAvailableActions,
} from '../../state/icon-workflow.js';

describe('IconWorkflowState', () => {
  beforeEach(() => {
    resetIconContext();
  });

  it('starts in INITIAL state', () => {
    expect(getIconContext().state).toBe(IconWorkflowState.INITIAL);
  });

  it('allows icon_preflight_check from INITIAL', () => {
    expect(canTransition(IconWorkflowState.INITIAL, 'icon_preflight_check')).toBe(true);
  });

  it('blocks icon_check_legacy from INITIAL', () => {
    expect(canTransition(IconWorkflowState.INITIAL, 'icon_check_legacy')).toBe(false);
  });

  it('updates context correctly', () => {
    updateIconContext({
      state: IconWorkflowState.PREFLIGHT_PASSED,
      projectPath: '/test/project',
    });

    const ctx = getIconContext();
    expect(ctx.state).toBe(IconWorkflowState.PREFLIGHT_PASSED);
    expect(ctx.projectPath).toBe('/test/project');
  });

  it('allows going back to search from ICON_SELECTED', () => {
    expect(canTransition(IconWorkflowState.ICON_SELECTED, 'icon_search')).toBe(true);
  });

  it('returns correct available actions', () => {
    const actions = getAvailableActions(IconWorkflowState.SEARCH_COMPLETE);
    expect(actions).toContain('icon_search');
    expect(actions).toContain('icon_select');
    expect(actions).not.toContain('icon_generate');
  });

  it('allows icon_check_legacy from PREFLIGHT_PASSED', () => {
    expect(canTransition(IconWorkflowState.PREFLIGHT_PASSED, 'icon_check_legacy')).toBe(true);
  });

  it('allows icon_confirm_delete_legacy from AWAITING_LEGACY_CONFIRMATION', () => {
    expect(
      canTransition(IconWorkflowState.AWAITING_LEGACY_CONFIRMATION, 'icon_confirm_delete_legacy')
    ).toBe(true);
  });

  it('allows icon_search from LEGACY_RESOLVED', () => {
    expect(canTransition(IconWorkflowState.LEGACY_RESOLVED, 'icon_search')).toBe(true);
  });

  it('allows icon_select from SEARCH_COMPLETE', () => {
    expect(canTransition(IconWorkflowState.SEARCH_COMPLETE, 'icon_select')).toBe(true);
  });

  it('allows icon_generate from ICON_SELECTED', () => {
    expect(canTransition(IconWorkflowState.ICON_SELECTED, 'icon_generate')).toBe(true);
  });

  it('allows icon_verify_build from GENERATION_COMPLETE', () => {
    expect(canTransition(IconWorkflowState.GENERATION_COMPLETE, 'icon_verify_build')).toBe(true);
  });

  it('allows icon_reset_workflow from VERIFIED', () => {
    expect(canTransition(IconWorkflowState.VERIFIED, 'icon_reset_workflow')).toBe(true);
  });

  it('resets to initial state when reset is called', () => {
    updateIconContext({
      state: IconWorkflowState.VERIFIED,
      projectPath: '/test/project',
      searchTerm: 'health',
      selectedIcon: 'mdi:heart',
    });

    resetIconContext();

    const ctx = getIconContext();
    expect(ctx.state).toBe(IconWorkflowState.INITIAL);
    expect(ctx.projectPath).toBeNull();
    expect(ctx.searchTerm).toBeNull();
    expect(ctx.selectedIcon).toBeNull();
  });

  it('maintains search results in context', () => {
    const results = [
      {
        id: 'mdi:heart',
        collection: 'Material Design Icons',
        license: 'Apache 2.0',
        preview_url: 'https://example.com',
      },
    ];

    updateIconContext({
      state: IconWorkflowState.SEARCH_COMPLETE,
      searchResults: results,
    });

    const ctx = getIconContext();
    expect(ctx.searchResults).toEqual(results);
  });
});
