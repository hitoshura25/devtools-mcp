import { describe, it, expect, beforeEach, vi } from 'vitest';
import { iconPreflightCheck } from '../../tools/icon/preflight.js';
import { iconCheckLegacy } from '../../tools/icon/check-legacy.js';
import { iconConfirmDeleteLegacy } from '../../tools/icon/confirm-legacy.js';
import { iconSearch } from '../../tools/icon/search-icons.js';
import { iconSelect } from '../../tools/icon/select-icon.js';
import { iconResetWorkflow } from '../../tools/icon/reset-workflow.js';
import { iconGetStatus } from '../../tools/icon/get-status.js';
import { resetIconContext, IconWorkflowState } from '../../state/icon-workflow.js';
import * as core from '@hitoshura25/core';

vi.mock('@hitoshura25/core');

describe('Icon Workflow Integration', () => {
  beforeEach(() => {
    resetIconContext();
    vi.resetAllMocks();
    // Mock validation functions to return true
    vi.mocked(core.isValidPath).mockReturnValue(true);
    vi.mocked(core.isValidSearchTerm).mockReturnValue(true);
  });

  it('enforces workflow order - cannot skip preflight', async () => {
    // Try to check legacy without running preflight first
    const result = await iconCheckLegacy();

    expect(result.success).toBe(false);
    expect(result.data?.status).toBe('invalid_state');
    expect(result.error?.suggestions).toContain('Call icon_preflight_check() first');
  });

  it('enforces workflow order - cannot search before resolving legacy', async () => {
    // Mock preflight to pass
    vi.mocked(core.execCommand)
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'curl', stderr: '', durationMs: 10, timedOut: false })
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'python3', stderr: '', durationMs: 10, timedOut: false })
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'rsvg-convert', stderr: '', durationMs: 10, timedOut: false })
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'minSdk = 26', stderr: '', durationMs: 10, timedOut: false });

    await iconPreflightCheck({});

    // Try to search without resolving legacy
    const searchResult = await iconSearch({ term: 'health' });

    expect(searchResult.success).toBe(false);
    expect(searchResult.data?.status).toBe('invalid_state');
  });

  it('allows full workflow when steps are followed in order', async () => {
    // Step 1: Preflight check
    vi.mocked(core.execCommand)
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'curl', stderr: '', durationMs: 10, timedOut: false })
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'python3', stderr: '', durationMs: 10, timedOut: false })
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'rsvg-convert', stderr: '', durationMs: 10, timedOut: false })
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'minSdk = 26', stderr: '', durationMs: 10, timedOut: false });

    const preflightResult = await iconPreflightCheck({});
    expect(preflightResult.success).toBe(true);

    // Step 2: Check legacy (mock no legacy found)
    vi.mocked(core.execCommand)
      .mockResolvedValue({ exitCode: 1, stdout: '', stderr: '', durationMs: 10, timedOut: false });

    const legacyResult = await iconCheckLegacy();
    expect(legacyResult.success).toBe(true);
    expect(legacyResult.data?.status).toBe('no_legacy_icons');

    // Step 3: Search (mock search results)
    vi.mocked(core.execCommand).mockResolvedValueOnce({
      exitCode: 0,
      stdout: JSON.stringify([
        {
          id: 'mdi:heart',
          collection: 'Material Design Icons',
          license: 'Apache 2.0',
          preview_url: 'https://example.com/heart',
        },
      ]),
      stderr: '',
      durationMs: 10,
      timedOut: false,
    });

    const searchResult = await iconSearch({ term: 'heart' });
    expect(searchResult.success).toBe(true);
    expect(searchResult.data?.status).toBe('search_complete');

    // Step 4: Select
    const selectResult = await iconSelect({ icon_id: 'mdi:heart' });
    expect(selectResult.success).toBe(true);
    expect(selectResult.data?.status).toBe('icon_selected');
  });

  it('allows re-searching after selecting an icon', async () => {
    // Set up state as if we've already selected an icon
    vi.mocked(core.execCommand)
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'curl', stderr: '', durationMs: 10, timedOut: false })
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'python3', stderr: '', durationMs: 10, timedOut: false })
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'rsvg-convert', stderr: '', durationMs: 10, timedOut: false })
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'minSdk = 26', stderr: '', durationMs: 10, timedOut: false });

    await iconPreflightCheck({});

    vi.mocked(core.execCommand).mockResolvedValue({
      exitCode: 1,
      stdout: '',
      stderr: '',
      durationMs: 10,
      timedOut: false,
    });
    await iconCheckLegacy();

    // First search
    vi.mocked(core.execCommand).mockResolvedValueOnce({
      exitCode: 0,
      stdout: JSON.stringify([
        { id: 'mdi:heart', collection: 'MDI', license: 'Apache 2.0', preview_url: 'https://example.com' },
      ]),
      stderr: '',
      durationMs: 10,
      timedOut: false,
    });
    await iconSearch({ term: 'heart' });
    await iconSelect({ icon_id: 'mdi:heart' });

    // Now search again (should be allowed)
    vi.mocked(core.execCommand).mockResolvedValueOnce({
      exitCode: 0,
      stdout: JSON.stringify([
        { id: 'mdi:star', collection: 'MDI', license: 'Apache 2.0', preview_url: 'https://example.com' },
      ]),
      stderr: '',
      durationMs: 10,
      timedOut: false,
    });

    const searchResult = await iconSearch({ term: 'star' });
    expect(searchResult.success).toBe(true);
  });

  it('provides workflow status at each step', async () => {
    // Initial state
    let statusResult = await iconGetStatus();
    expect(statusResult.data?.state).toBe(IconWorkflowState.INITIAL);
    expect(statusResult.data?.available_actions).toContain('icon_preflight_check');

    // After preflight
    vi.mocked(core.execCommand)
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'curl', stderr: '', durationMs: 10, timedOut: false })
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'python3', stderr: '', durationMs: 10, timedOut: false })
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'rsvg-convert', stderr: '', durationMs: 10, timedOut: false })
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'minSdk = 26', stderr: '', durationMs: 10, timedOut: false });

    await iconPreflightCheck({});

    statusResult = await iconGetStatus();
    expect(statusResult.data?.state).toBe(IconWorkflowState.PREFLIGHT_PASSED);
    expect(statusResult.data?.available_actions).toContain('icon_check_legacy');
  });

  it('can reset workflow at any time', async () => {
    // Do some steps
    vi.mocked(core.execCommand)
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'curl', stderr: '', durationMs: 10, timedOut: false })
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'python3', stderr: '', durationMs: 10, timedOut: false })
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'rsvg-convert', stderr: '', durationMs: 10, timedOut: false })
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'minSdk = 26', stderr: '', durationMs: 10, timedOut: false });

    await iconPreflightCheck({ project_path: '/test' });

    // Reset
    const resetResult = await iconResetWorkflow();
    expect(resetResult.success).toBe(true);

    // Verify reset
    const statusResult = await iconGetStatus();
    expect(statusResult.data?.state).toBe(IconWorkflowState.INITIAL);
    expect(statusResult.data?.project_path).toBeNull();
  });

  it('handles legacy confirmation flow', async () => {
    // Mock preflight
    vi.mocked(core.execCommand)
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'curl', stderr: '', durationMs: 10, timedOut: false })
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'python3', stderr: '', durationMs: 10, timedOut: false })
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'rsvg-convert', stderr: '', durationMs: 10, timedOut: false })
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'minSdk = 26', stderr: '', durationMs: 10, timedOut: false });

    await iconPreflightCheck({});

    // Mock finding legacy files
    vi.mocked(core.execCommand).mockResolvedValue({
      exitCode: 0,
      stdout: '/test/app/res/mipmap-hdpi/ic_launcher.png',
      stderr: '',
      durationMs: 10,
      timedOut: false,
    });

    const legacyResult = await iconCheckLegacy();
    expect(legacyResult.data?.status).toBe('confirmation_required');

    // User confirms deletion
    vi.mocked(core.execCommand).mockResolvedValue({
      exitCode: 0,
      stdout: '',
      stderr: '',
      durationMs: 10,
      timedOut: false,
    });

    const confirmResult = await iconConfirmDeleteLegacy({ confirm: true });
    expect(confirmResult.success).toBe(true);
    expect(confirmResult.data?.status).toBe('legacy_resolved');
    expect(confirmResult.data?.action_taken).toBe('deleted');
  });
});
