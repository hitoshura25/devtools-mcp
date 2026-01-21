import { exec, execFile } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

export interface ExecOptions {
  cwd?: string;
  timeout?: number; // Default: 300000 (5 min)
  retries?: number; // Default: 0
  retryDelay?: number; // Default: 1000
  env?: Record<string, string>;
}

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
}

export async function execCommand(
  command: string,
  options?: ExecOptions
): Promise<ExecResult> {
  const startTime = Date.now();
  const timeout = options?.timeout ?? 300000; // 5 minutes default
  const cwd = options?.cwd ?? process.cwd();
  const env = options?.env
    ? { ...process.env, ...options.env }
    : process.env;

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd,
      timeout,
      env: env as NodeJS.ProcessEnv,
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });

    return {
      exitCode: 0,
      stdout: stdout.toString(),
      stderr: stderr.toString(),
      durationMs: Date.now() - startTime,
      timedOut: false,
    };
  } catch (error: unknown) {
    const isTimeout =
      error instanceof Error &&
      'killed' in error &&
      error.killed === true &&
      'signal' in error &&
      error.signal === 'SIGTERM';

    const exitCode =
      error instanceof Error && 'code' in error && typeof error.code === 'number'
        ? error.code
        : 1;

    const stdout =
      error instanceof Error && 'stdout' in error && error.stdout
        ? error.stdout.toString()
        : '';

    const stderr =
      error instanceof Error && 'stderr' in error && error.stderr
        ? error.stderr.toString()
        : error instanceof Error
        ? error.message
        : '';

    return {
      exitCode,
      stdout,
      stderr,
      durationMs: Date.now() - startTime,
      timedOut: isTimeout,
    };
  }
}

export async function execWithRetry(
  command: string,
  options: ExecOptions & { retries: number }
): Promise<ExecResult> {
  const { retries, retryDelay = 1000, ...execOptions } = options;
  let lastResult: ExecResult | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    lastResult = await execCommand(command, execOptions);

    if (lastResult.exitCode === 0) {
      return lastResult;
    }

    // Don't retry if we're out of attempts
    if (attempt < retries) {
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    }
  }

  return lastResult!;
}

/**
 * Execute a command safely using execFile with array arguments.
 * This bypasses shell interpretation, preventing command injection.
 *
 * Use this instead of execCommand when arguments come from user input.
 *
 * @param command - The command/executable to run (e.g., 'wget', './script.sh')
 * @param args - Array of arguments to pass to the command
 * @param options - Execution options
 */
export async function execCommandSafe(
  command: string,
  args: string[],
  options?: ExecOptions
): Promise<ExecResult> {
  const startTime = Date.now();
  const timeout = options?.timeout ?? 300000; // 5 minutes default
  const cwd = options?.cwd ?? process.cwd();
  const env = options?.env ? { ...process.env, ...options.env } : process.env;

  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd,
      timeout,
      env: env as NodeJS.ProcessEnv,
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });

    return {
      exitCode: 0,
      stdout: stdout.toString(),
      stderr: stderr.toString(),
      durationMs: Date.now() - startTime,
      timedOut: false,
    };
  } catch (error: unknown) {
    const isTimeout =
      error instanceof Error &&
      'killed' in error &&
      error.killed === true &&
      'signal' in error &&
      error.signal === 'SIGTERM';

    const exitCode =
      error instanceof Error && 'code' in error && typeof error.code === 'number'
        ? error.code
        : 1;

    const stdout =
      error instanceof Error && 'stdout' in error && error.stdout
        ? error.stdout.toString()
        : '';

    const stderr =
      error instanceof Error && 'stderr' in error && error.stderr
        ? error.stderr.toString()
        : error instanceof Error
          ? error.message
          : '';

    return {
      exitCode,
      stdout,
      stderr,
      durationMs: Date.now() - startTime,
      timedOut: isTimeout,
    };
  }
}
