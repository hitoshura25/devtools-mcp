import { ToolResult } from '@hitoshura25/core';
import { getIconContext, getAvailableActions } from '../../state/icon-workflow.js';

export interface GetStatusResult {
  state: string;
  project_path: string | null;
  legacy_files_found: number;
  legacy_resolution: string | null;
  search_term: string | null;
  search_results_count: number;
  selected_icon: string | null;
  available_actions: string[];
}

export async function iconGetStatus(): Promise<ToolResult<GetStatusResult>> {
  const startTime = Date.now();
  const steps: string[] = [];
  const ctx = getIconContext();

  steps.push('status_retrieved');

  const legacyResolution = ctx.legacyFiles.length > 0 ? 'pending' : null;

  return {
    success: true,
    data: {
      state: ctx.state,
      project_path: ctx.projectPath,
      legacy_files_found: ctx.legacyFiles.length,
      legacy_resolution: legacyResolution,
      search_term: ctx.searchTerm,
      search_results_count: ctx.searchResults.length,
      selected_icon: ctx.selectedIcon,
      available_actions: getAvailableActions(ctx.state),
    },
    duration_ms: Date.now() - startTime,
    steps_completed: steps,
  };
}
