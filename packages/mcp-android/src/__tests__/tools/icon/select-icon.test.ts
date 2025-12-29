import { describe, it, expect, beforeEach } from 'vitest';
import { iconSelect } from '../../../tools/icon/select-icon.js';
import {
  resetIconContext,
  updateIconContext,
  IconWorkflowState,
  getIconContext,
} from '../../../state/icon-workflow.js';

describe('icon_select', () => {
  beforeEach(() => {
    resetIconContext();
  });

  it('returns invalid_state when not in SEARCH_COMPLETE state', async () => {
    updateIconContext({ state: IconWorkflowState.INITIAL });

    const result = await iconSelect({ icon_id: 'mdi:heart' });

    expect(result.success).toBe(false);
    expect(result.data?.status).toBe('invalid_state');
  });

  it('returns icon_not_found when icon is not in search results', async () => {
    updateIconContext({
      state: IconWorkflowState.SEARCH_COMPLETE,
      searchResults: [
        {
          id: 'mdi:star',
          collection: 'Material Design Icons',
          license: 'Apache 2.0',
          preview_url: 'https://example.com/star',
        },
      ],
    });

    const result = await iconSelect({ icon_id: 'mdi:heart' });

    expect(result.success).toBe(false);
    expect(result.data?.status).toBe('icon_not_found');
    expect(result.error?.message).toContain('not found in search results');
  });

  it('successfully selects icon when found in search results', async () => {
    const searchResults = [
      {
        id: 'mdi:heart',
        collection: 'Material Design Icons',
        license: 'Apache 2.0',
        preview_url: 'https://example.com/heart',
      },
      {
        id: 'mdi:star',
        collection: 'Material Design Icons',
        license: 'Apache 2.0',
        preview_url: 'https://example.com/star',
      },
    ];

    updateIconContext({
      state: IconWorkflowState.SEARCH_COMPLETE,
      searchResults,
    });

    const result = await iconSelect({ icon_id: 'mdi:heart' });

    expect(result.success).toBe(true);
    expect(result.data?.status).toBe('icon_selected');
    expect(result.data?.icon_id).toBe('mdi:heart');
    expect(result.data?.preview_url).toBe('https://example.com/heart');
  });

  it('updates context with selected icon', async () => {
    updateIconContext({
      state: IconWorkflowState.SEARCH_COMPLETE,
      searchResults: [
        {
          id: 'mdi:heart-pulse',
          collection: 'Material Design Icons',
          license: 'Apache 2.0',
          preview_url: 'https://example.com/heart-pulse',
        },
      ],
    });

    await iconSelect({ icon_id: 'mdi:heart-pulse' });

    const ctx = getIconContext();
    expect(ctx.state).toBe(IconWorkflowState.ICON_SELECTED);
    expect(ctx.selectedIcon).toBe('mdi:heart-pulse');
  });

  it('provides next step guidance in response', async () => {
    updateIconContext({
      state: IconWorkflowState.SEARCH_COMPLETE,
      searchResults: [
        {
          id: 'mdi:android',
          collection: 'Material Design Icons',
          license: 'Apache 2.0',
          preview_url: 'https://example.com/android',
        },
      ],
    });

    const result = await iconSelect({ icon_id: 'mdi:android' });

    expect(result.success).toBe(true);
    expect(result.data?.next).toContain('icon_generate');
  });

  it('includes suggestions in error when icon not found', async () => {
    updateIconContext({
      state: IconWorkflowState.SEARCH_COMPLETE,
      searchResults: [
        {
          id: 'mdi:star',
          collection: 'Material Design Icons',
          license: 'Apache 2.0',
          preview_url: 'https://example.com/star',
        },
      ],
    });

    const result = await iconSelect({ icon_id: 'mdi:invalid' });

    expect(result.success).toBe(false);
    expect(result.error?.suggestions).toBeDefined();
    expect(result.error?.suggestions?.length).toBeGreaterThan(0);
  });
});
