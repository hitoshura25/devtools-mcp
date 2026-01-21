import { execCommand, ToolResult, isValidPath, isValidModuleName, isValidBuildType, isValidTestFilter } from '@hitoshura25/core';

export interface RunTestsParams {
  project_path?: string;
  module?: string;
  build_type?: 'debug' | 'release';
  test_filter?: string;
}

export interface TestFailure {
  class_name: string;
  method_name: string;
  message: string;
  stack_trace?: string;
}

export interface RunTestsResult {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  duration_seconds: number;
  failures: TestFailure[];
}

function parseTestResults(stdout: string, stderr: string): Partial<RunTestsResult> {
  const output = stdout + stderr;

  // Try to parse test summary
  const totalMatch = output.match(/(\d+) tests?/i);
  const failedMatch = output.match(/(\d+) failed/i);
  const passedMatch = output.match(/(\d+) passed/i);
  const skippedMatch = output.match(/(\d+) skipped/i);

  const total = totalMatch ? parseInt(totalMatch[1]) : 0;
  const failed = failedMatch ? parseInt(failedMatch[1]) : 0;
  const passed = passedMatch ? parseInt(passedMatch[1]) : 0;
  const skipped = skippedMatch ? parseInt(skippedMatch[1]) : 0;

  // Parse failures
  const failures: TestFailure[] = [];
  const failureRegex = /([^\s]+)#([^\s]+)\s+FAILED/g;
  let match;

  while ((match = failureRegex.exec(output)) !== null) {
    failures.push({
      class_name: match[1],
      method_name: match[2],
      message: 'Test failed',
    });
  }

  return {
    total,
    passed,
    failed,
    skipped,
    failures,
  };
}

export async function runAndroidTests(
  params: RunTestsParams
): Promise<ToolResult<RunTestsResult>> {
  const startTime = Date.now();
  const steps: string[] = [];
  const projectPath = params.project_path || '.';
  const module = params.module || 'app';
  const buildType = params.build_type || 'debug';

  // Validate inputs to prevent command injection
  if (!isValidPath(projectPath)) {
    return {
      success: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'Invalid project path: contains unsafe characters',
        details: 'Project path must only contain alphanumeric characters, dots, dashes, underscores, and forward slashes',
        suggestions: ['Use a path without special characters'],
        recoverable: true,
      },
      duration_ms: Date.now() - startTime,
      steps_completed: steps,
    };
  }

  if (!isValidModuleName(module)) {
    return {
      success: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'Invalid module name: contains unsafe characters',
        details: 'Module name must only contain alphanumeric characters, dashes, and underscores',
        suggestions: ['Use a module name like "app" or "core-library"'],
        recoverable: true,
      },
      duration_ms: Date.now() - startTime,
      steps_completed: steps,
    };
  }

  if (!isValidBuildType(buildType)) {
    return {
      success: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'Invalid build type: must be "debug" or "release"',
        details: `Received: ${buildType}`,
        suggestions: ['Use build_type: "debug" or build_type: "release"'],
        recoverable: true,
      },
      duration_ms: Date.now() - startTime,
      steps_completed: steps,
    };
  }

  if (params.test_filter && !isValidTestFilter(params.test_filter)) {
    return {
      success: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'Invalid test filter: contains unsafe characters',
        details: 'Test filter must only contain alphanumeric characters, dots, asterisks, dashes, and underscores',
        suggestions: ['Use a test filter like "com.example.*" or "MyTestClass"'],
        recoverable: true,
      },
      duration_ms: Date.now() - startTime,
      steps_completed: steps,
    };
  }

  // 1. Construct test command
  let testCmd = `./gradlew :${module}:connected${buildType.charAt(0).toUpperCase() + buildType.slice(1)}AndroidTest`;

  if (params.test_filter) {
    testCmd += ` --tests "${params.test_filter}"`;
  }

  steps.push('command_constructed');

  // 2. Run tests
  const testResult = await execCommand(testCmd, {
    cwd: projectPath,
    timeout: 600000, // 10 minutes for tests
  });

  steps.push('tests_executed');

  // 3. Parse results
  const parsedResults = parseTestResults(testResult.stdout, testResult.stderr);
  const durationSeconds = Math.round((Date.now() - startTime) / 1000);

  // 4. Check if tests passed
  if (testResult.exitCode !== 0 && (parsedResults.failed ?? 0) > 0) {
    return {
      success: false,
      error: {
        code: 'TESTS_FAILED',
        message: `${parsedResults.failed} test(s) failed`,
        details: testResult.stderr.slice(-2000),
        suggestions: [
          'Review test failure details',
          'Check test logs in build/outputs/androidTest-results',
          'Ensure test environment is correctly configured',
        ],
        recoverable: true,
      },
      duration_ms: Date.now() - startTime,
      steps_completed: steps,
      data: {
        total: parsedResults.total ?? 0,
        passed: parsedResults.passed ?? 0,
        failed: parsedResults.failed ?? 0,
        skipped: parsedResults.skipped ?? 0,
        duration_seconds: durationSeconds,
        failures: parsedResults.failures ?? [],
      },
    };
  }

  // 5. Return success
  return {
    success: true,
    data: {
      total: parsedResults.total ?? 0,
      passed: parsedResults.passed ?? 0,
      failed: parsedResults.failed ?? 0,
      skipped: parsedResults.skipped ?? 0,
      duration_seconds: durationSeconds,
      failures: parsedResults.failures ?? [],
    },
    duration_ms: Date.now() - startTime,
    steps_completed: steps,
  };
}
