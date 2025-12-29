import { ToolResult } from '@hitoshura25/core';
import { getIconContext, updateIconContext, IconWorkflowState, canTransition } from '../../state/icon-workflow.js';

export interface SelectIconParams {
  icon_id: string;
}

export interface SelectIconResult {
  status: 'icon_selected' | 'invalid_state' | 'icon_not_found';
  icon_id?: string;
  preview_url?: string;
  next?: string;
  error?: string;
  current_state?: string;
  required_state?: string;
  message?: string;
}

export async function iconSelect(
  params: SelectIconParams
): Promise<ToolResult<SelectIconResult>> {
  const startTime = Date.now();
  const steps: string[] = [];
  const ctx = getIconContext();

  // Check state
  if (!canTransition(ctx.state, 'icon_select')) {
    return {
      success: false,
      error: {
        code: 'INVALID_STATE',
        message: `Cannot select icon from state: ${ctx.state}`,
        details: `Current state: ${ctx.state}, required state: ${IconWorkflowState.SEARCH_COMPLETE}`,
        suggestions: ['Call icon_search(term) first'],
        recoverable: true,
      },
      duration_ms: Date.now() - startTime,
      steps_completed: steps,
      data: {
        status: 'invalid_state',
        error: 'Invalid state',
        current_state: ctx.state,
        required_state: IconWorkflowState.SEARCH_COMPLETE,
        message: 'Call icon_search(term) first',
      },
    };
  }

  steps.push('state_validated');

  // Check if icon exists in search results
  const icon = ctx.searchResults.find((r) => r.id === params.icon_id);

  if (!icon) {
    return {
      success: false,
      error: {
        code: 'ICON_NOT_FOUND',
        message: `Icon "${params.icon_id}" not found in search results`,
        details: `Available icons: ${ctx.searchResults.map((r) => r.id).join(', ')}`,
        suggestions: ['Search again with icon_search(term)', 'Select from available icons in search results'],
        recoverable: true,
      },
      duration_ms: Date.now() - startTime,
      steps_completed: steps,
      data: {
        status: 'icon_not_found',
        error: `Icon "${params.icon_id}" not found in search results`,
        message: 'Search again with icon_search(term)',
      },
    };
  }

  steps.push('icon_validated');

  // Update context
  updateIconContext({
    state: IconWorkflowState.ICON_SELECTED,
    selectedIcon: params.icon_id,
  });

  steps.push('state_updated');

  return {
    success: true,
    data: {
      status: 'icon_selected',
      icon_id: params.icon_id,
      preview_url: icon.preview_url,
      next: 'Call icon_generate() to generate icon files, or icon_search(term) to select a different icon',
    },
    duration_ms: Date.now() - startTime,
    steps_completed: steps,
  };
}
