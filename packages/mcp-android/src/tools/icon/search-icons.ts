import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { execCommand, ToolResult } from '@hitoshura25/core';
import {
  getIconContext,
  updateIconContext,
  IconWorkflowState,
  IconSearchResult,
} from '../../state/icon-workflow.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCRIPTS_DIR = join(__dirname, '..', '..', 'scripts');

export interface SearchIconsParams {
  term: string;
  limit?: number;
}

export interface SearchIconsResult {
  status: 'search_complete' | 'invalid_state';
  term?: string;
  total_results?: number;
  showing?: number;
  results?: IconSearchResult[];
  next?: string;
  error?: string;
  current_state?: string;
  message?: string;
}

export async function iconSearch(
  params: SearchIconsParams
): Promise<ToolResult<SearchIconsResult>> {
  const startTime = Date.now();
  const steps: string[] = [];
  const ctx = getIconContext();

  // Check state - allow searching from multiple states
  const validStates = [
    IconWorkflowState.LEGACY_RESOLVED,
    IconWorkflowState.SEARCH_COMPLETE,
    IconWorkflowState.ICON_SELECTED,
    IconWorkflowState.GENERATION_COMPLETE,
  ];

  if (!validStates.includes(ctx.state)) {
    return {
      success: false,
      error: {
        code: 'INVALID_STATE',
        message: `Cannot search from state: ${ctx.state}`,
        details: `Valid states: ${validStates.join(', ')}`,
        suggestions: ['Complete previous workflow steps first'],
        recoverable: true,
      },
      duration_ms: Date.now() - startTime,
      steps_completed: steps,
      data: {
        status: 'invalid_state',
        error: 'Invalid state',
        current_state: ctx.state,
        message: 'Complete previous steps first',
      },
    };
  }

  const limit = Math.min(params.limit || 10, 50);
  steps.push('parameters_validated');

  // Execute search script
  const scriptPath = join(SCRIPTS_DIR, 'search-icons.sh');

  try {
    const result = await execCommand(`"${scriptPath}" "${params.term}" ${limit}`, {
      timeout: 30000,
    });

    if (result.exitCode !== 0) {
      return {
        success: false,
        error: {
          code: 'SEARCH_FAILED',
          message: 'Icon search failed',
          details: result.stderr,
          suggestions: ['Check search term and try again', 'Ensure curl is installed'],
          recoverable: true,
        },
        duration_ms: Date.now() - startTime,
        steps_completed: steps,
        data: {
          status: 'invalid_state',
          error: `Search failed: ${result.stderr}`,
        },
      };
    }

    steps.push('search_executed');

    // Parse JSON output from script
    const searchResults: IconSearchResult[] = JSON.parse(result.stdout);

    // Update context
    updateIconContext({
      state: IconWorkflowState.SEARCH_COMPLETE,
      searchTerm: params.term,
      searchResults,
      selectedIcon: null, // Clear any previous selection
    });

    steps.push('state_updated');

    return {
      success: true,
      data: {
        status: 'search_complete',
        term: params.term,
        total_results: searchResults.length,
        showing: Math.min(searchResults.length, limit),
        results: searchResults,
        next: 'Call icon_select(icon_id) to select an icon, or icon_search(term) to search again',
      },
      duration_ms: Date.now() - startTime,
      steps_completed: steps,
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'SEARCH_ERROR',
        message: 'Failed to execute search',
        details: error instanceof Error ? error.message : String(error),
        suggestions: ['Check search script exists', 'Verify script permissions'],
        recoverable: true,
      },
      duration_ms: Date.now() - startTime,
      steps_completed: steps,
      data: {
        status: 'invalid_state',
        error: `Search error: ${error instanceof Error ? error.message : String(error)}`,
      },
    };
  }
}
