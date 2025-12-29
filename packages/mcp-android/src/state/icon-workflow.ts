// src/state/icon-workflow.ts

export enum IconWorkflowState {
  INITIAL = 'initial',
  PREFLIGHT_PASSED = 'preflight_passed',
  AWAITING_LEGACY_CONFIRMATION = 'awaiting_legacy_confirmation',
  LEGACY_RESOLVED = 'legacy_resolved',
  SEARCH_COMPLETE = 'search_complete',
  ICON_SELECTED = 'icon_selected',
  GENERATION_COMPLETE = 'generation_complete',
  VERIFIED = 'verified',
}

export interface IconSearchResult {
  id: string;
  collection: string;
  license: string;
  preview_url: string;
}

export interface IconWorkflowContext {
  state: IconWorkflowState;
  projectPath: string | null;
  legacyFiles: string[];
  searchTerm: string | null;
  searchResults: IconSearchResult[];
  selectedIcon: string | null;
  generatedFiles: string[];
}

export const initialIconContext: IconWorkflowContext = {
  state: IconWorkflowState.INITIAL,
  projectPath: null,
  legacyFiles: [],
  searchTerm: null,
  searchResults: [],
  selectedIcon: null,
  generatedFiles: [],
};

// Singleton for server lifetime
let iconContext: IconWorkflowContext = { ...initialIconContext };

export function getIconContext(): IconWorkflowContext {
  return iconContext;
}

export function updateIconContext(updates: Partial<IconWorkflowContext>): void {
  iconContext = { ...iconContext, ...updates };
}

export function resetIconContext(): void {
  iconContext = { ...initialIconContext };
}

// Valid transitions
const validTransitions: Record<IconWorkflowState, string[]> = {
  [IconWorkflowState.INITIAL]: ['icon_preflight_check'],
  [IconWorkflowState.PREFLIGHT_PASSED]: ['icon_check_legacy'],
  [IconWorkflowState.AWAITING_LEGACY_CONFIRMATION]: ['icon_confirm_delete_legacy'],
  [IconWorkflowState.LEGACY_RESOLVED]: ['icon_search'],
  [IconWorkflowState.SEARCH_COMPLETE]: ['icon_search', 'icon_select'],
  [IconWorkflowState.ICON_SELECTED]: ['icon_search', 'icon_generate'],
  [IconWorkflowState.GENERATION_COMPLETE]: ['icon_search', 'icon_verify_build'],
  [IconWorkflowState.VERIFIED]: ['icon_reset_workflow'],
};

export function canTransition(currentState: IconWorkflowState, action: string): boolean {
  return validTransitions[currentState]?.includes(action) ?? false;
}

export function getAvailableActions(state: IconWorkflowState): string[] {
  return validTransitions[state] ?? [];
}
