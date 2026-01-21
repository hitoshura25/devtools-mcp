import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { iconPreflightCheck } from '../../../tools/icon/preflight.js';
import * as core from '@hitoshura25/core';
import { resetIconContext, IconWorkflowState, updateIconContext } from '../../../state/icon-workflow.js';

vi.mock('@hitoshura25/core');

describe('icon_preflight_check', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetIconContext();
    // Mock validation functions to return true
    vi.mocked(core.isValidPath).mockReturnValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns ready when all dependencies present and minSdk >= 26', async () => {
    // Mock dependency checks (command -v)
    vi.mocked(core.execCommand)
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: 'curl 8.0.0',
        stderr: '',
        durationMs: 10,
        timedOut: false
      })
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: 'Python 3.11',
        stderr: '',
        durationMs: 10,
        timedOut: false
      })
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: 'rsvg-convert 2.56',
        stderr: '',
        durationMs: 10,
        timedOut: false
      })
      // Mock minSdk detection (grep for minSdk)
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: 'minSdk = 26',
        stderr: '',
        durationMs: 10,
        timedOut: false
      });

    const result = await iconPreflightCheck({ project_path: '/test/project' });

    expect(result.success).toBe(true);
    expect(result.data?.status).toBe('ready');
    expect(result.data?.min_sdk).toBe(26);
    expect(result.data?.project_path).toBe('/test/project');
  });

  it('returns missing_dependencies when rsvg-convert not found', async () => {
    vi.mocked(core.execCommand)
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'curl 8.0.0', stderr: '', durationMs: 10, timedOut: false })
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'Python 3.11', stderr: '', durationMs: 10, timedOut: false })
      .mockResolvedValueOnce({ exitCode: 1, stdout: '', stderr: 'command not found', durationMs: 10, timedOut: false });

    const result = await iconPreflightCheck({ project_path: '/test/project' });

    expect(result.success).toBe(false);
    expect(result.data?.status).toBe('missing_dependencies');
    expect(result.data?.missing).toContain('rsvg-convert');
    expect(result.data?.install_commands).toHaveProperty('rsvg-convert');
  });

  it('returns unsupported_project when minSdk < 26', async () => {
    // Mock all deps present
    vi.mocked(core.execCommand)
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'curl 8.0.0', stderr: '', durationMs: 10, timedOut: false })
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'Python 3.11', stderr: '', durationMs: 10, timedOut: false })
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'rsvg-convert 2.56', stderr: '', durationMs: 10, timedOut: false })
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'minSdk = 21', stderr: '', durationMs: 10, timedOut: false });

    const result = await iconPreflightCheck({ project_path: '/test/project' });

    expect(result.success).toBe(false);
    expect(result.data?.status).toBe('unsupported_project');
    expect(result.data?.current_min_sdk).toBe(21);
  });

  it('returns invalid_state when not in INITIAL state', async () => {
    // Set state to something other than INITIAL
    updateIconContext({ state: IconWorkflowState.PREFLIGHT_PASSED });

    const result = await iconPreflightCheck({ project_path: '/test/project' });

    expect(result.success).toBe(false);
    expect(result.data?.status).toBe('invalid_state');
    expect(result.data?.current_state).toBe(IconWorkflowState.PREFLIGHT_PASSED);
  });

  it('updates state to PREFLIGHT_PASSED on success', async () => {
    vi.mocked(core.execCommand)
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'curl 8.0.0', stderr: '', durationMs: 10, timedOut: false })
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'Python 3.11', stderr: '', durationMs: 10, timedOut: false })
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'rsvg-convert 2.56', stderr: '', durationMs: 10, timedOut: false })
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'minSdk = 26', stderr: '', durationMs: 10, timedOut: false });

    await iconPreflightCheck({ project_path: '/test/project' });

    const { getIconContext } = await import('../../../state/icon-workflow.js');
    const ctx = getIconContext();
    expect(ctx.state).toBe(IconWorkflowState.PREFLIGHT_PASSED);
    expect(ctx.projectPath).toBe('/test/project');
  });

  it('detects minSdk from Groovy build.gradle', async () => {
    vi.mocked(core.execCommand)
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'curl 8.0.0', stderr: '', durationMs: 10, timedOut: false })
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'Python 3.11', stderr: '', durationMs: 10, timedOut: false })
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'rsvg-convert 2.56', stderr: '', durationMs: 10, timedOut: false })
      // First grep (kotlin) returns empty
      .mockResolvedValueOnce({ exitCode: 1, stdout: '', stderr: '', durationMs: 10, timedOut: false })
      // Second grep (groovy) returns minSdkVersion 28
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'minSdkVersion 28', stderr: '', durationMs: 10, timedOut: false });

    const result = await iconPreflightCheck({ project_path: '/test/project' });

    expect(result.success).toBe(true);
    expect(result.data?.min_sdk).toBe(28);
  });

  it('uses default project path when not provided', async () => {
    vi.mocked(core.execCommand)
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'curl 8.0.0', stderr: '', durationMs: 10, timedOut: false })
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'Python 3.11', stderr: '', durationMs: 10, timedOut: false })
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'rsvg-convert 2.56', stderr: '', durationMs: 10, timedOut: false })
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'minSdk = 26', stderr: '', durationMs: 10, timedOut: false });

    const result = await iconPreflightCheck({});

    expect(result.success).toBe(true);
    expect(result.data?.project_path).toBe('.');
  });
});
