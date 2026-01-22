import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execCommand, execWithRetry } from '../executor.js';

// Create mock functions using hoisted scope
const { mockExec, mockExecFile } = vi.hoisted(() => ({
  mockExec: vi.fn(),
  mockExecFile: vi.fn(),
}));

// Mock child_process
vi.mock('child_process', () => ({
  exec: mockExec,
  execFile: mockExecFile,
}));

// Mock promisify to return appropriate mock based on the function
vi.mock('util', () => ({
  promisify: (fn: unknown) => (fn === mockExec ? mockExec : mockExecFile),
}));

describe('execCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should execute command successfully', async () => {
    mockExec.mockResolvedValue({
      stdout: 'Success output',
      stderr: '',
    });

    const result = await execCommand('echo test');

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('Success output');
    expect(result.stderr).toBe('');
    expect(result.timedOut).toBe(false);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('should handle command failure', async () => {
    const error = Object.assign(new Error('Command failed'), {
      code: 1,
      stdout: 'Some output',
      stderr: 'Error output',
    });
    mockExec.mockRejectedValue(error);

    const result = await execCommand('failing-command');

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('Some output');
    expect(result.stderr).toBe('Error output');
    expect(result.timedOut).toBe(false);
  });

  it('should handle timeout', async () => {
    const error = Object.assign(new Error('Command timed out'), {
      killed: true,
      signal: 'SIGTERM',
      code: 1,
      stdout: '',
      stderr: 'Timeout',
    });
    mockExec.mockRejectedValue(error);

    const result = await execCommand('slow-command', { timeout: 1000 });

    expect(result.timedOut).toBe(true);
    expect(result.exitCode).toBe(1);
  });

  it('should use provided options', async () => {
    mockExec.mockResolvedValue({
      stdout: 'Output',
      stderr: '',
    });

    await execCommand('test-command', {
      cwd: '/custom/path',
      timeout: 5000,
      env: { CUSTOM_VAR: 'value' },
    });

    expect(mockExec).toHaveBeenCalledWith(
      'test-command',
      expect.objectContaining({
        cwd: '/custom/path',
        timeout: 5000,
        env: expect.objectContaining({ CUSTOM_VAR: 'value' }),
      })
    );
  });
});

describe('execWithRetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should succeed on first attempt', async () => {
    mockExec.mockResolvedValue({
      stdout: 'Success',
      stderr: '',
    });

    const result = await execWithRetry('test-command', { retries: 3 });

    expect(result.exitCode).toBe(0);
    expect(mockExec).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure', async () => {
    const error = Object.assign(new Error('Failed'), {
      code: 1,
      stdout: '',
      stderr: 'Error',
    });

    // Fail twice, succeed on third attempt
    mockExec
      .mockRejectedValueOnce(error)
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce({
        stdout: 'Success',
        stderr: '',
      });

    const result = await execWithRetry('flaky-command', {
      retries: 3,
      retryDelay: 10,
    });

    expect(result.exitCode).toBe(0);
    expect(mockExec).toHaveBeenCalledTimes(3);
  });

  it('should return last failure after all retries exhausted', async () => {
    const error = Object.assign(new Error('Failed'), {
      code: 1,
      stdout: '',
      stderr: 'Persistent error',
    });

    mockExec.mockRejectedValue(error);

    const result = await execWithRetry('always-failing', {
      retries: 2,
      retryDelay: 10,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe('Persistent error');
    expect(mockExec).toHaveBeenCalledTimes(3); // Initial + 2 retries
  });
});
