export interface ParsedError {
  type: ErrorType;
  message: string;
  file?: string;
  line?: number;
  suggestions: string[];
}

export type ErrorType =
  | 'compilation'
  | 'dependency'
  | 'signing'
  | 'proguard'
  | 'test_failure'
  | 'timeout'
  | 'unknown';

export function parseGradleError(stderr: string): ParsedError {
  // Parse compilation errors
  if (stderr.includes('compileReleaseKotlin FAILED') || stderr.includes('compileReleaseJava FAILED')) {
    const fileMatch = stderr.match(/e: ([^:]+):(\d+):\d+/);
    const errorMessage = stderr.match(/e: [^:]+:\d+:\d+ (.+)/)?.[1] ?? 'Compilation error';

    return {
      type: 'compilation',
      message: `Kotlin compilation failed: ${errorMessage}`,
      file: fileMatch?.[1],
      line: fileMatch?.[2] ? parseInt(fileMatch[2]) : undefined,
      suggestions: [
        'Fix compilation errors in the source files',
        'Ensure all required imports are present',
        'Check for syntax errors',
      ],
    };
  }

  // Parse dependency resolution errors
  if (stderr.includes('Could not resolve') || stderr.includes('Could not find')) {
    const dependencyMatch = stderr.match(/Could not (?:resolve|find) ([^\s]+)/);
    const dependency = dependencyMatch?.[1] ?? 'dependency';

    return {
      type: 'dependency',
      message: `Failed to resolve dependency: ${dependency}`,
      suggestions: [
        'Check if dependency exists in configured repositories',
        'Verify network connectivity',
        'Check if version number is correct',
        'Add missing repository to build.gradle.kts',
      ],
    };
  }

  // Parse signing errors
  if (stderr.includes('signRelease') || stderr.includes('KeyStore')) {
    return {
      type: 'signing',
      message: 'Failed to sign APK',
      suggestions: [
        'Verify keystore path in signing config',
        'Check gradle.properties for signing credentials',
        'Ensure keystore password is correct',
        'Verify key alias exists in keystore',
      ],
    };
  }

  // Parse ProGuard/R8 errors
  if (stderr.includes('R8:') || stderr.includes("can't find referenced class")) {
    const classMatch = stderr.match(/can't find referenced class ([^\s]+)/);
    const className = classMatch?.[1];

    return {
      type: 'proguard',
      message: `ProGuard/R8 error${className ? `: can't find ${className}` : ''}`,
      suggestions: [
        className ? `Add keep rule for ${className} in proguard-rules.pro` : 'Review ProGuard rules',
        'Check if required dependencies are included',
        'Verify ProGuard configuration',
      ],
    };
  }

  // Parse test failures
  if (stderr.includes('test') && stderr.includes('FAILED')) {
    return {
      type: 'test_failure',
      message: 'Tests failed',
      suggestions: [
        'Check test output for failure details',
        'Review test logs',
        'Ensure test environment is correctly configured',
      ],
    };
  }

  // Default unknown error
  return {
    type: 'unknown',
    message: 'Build failed with unknown error',
    suggestions: [
      'Check the full error output',
      'Try running ./gradlew clean',
      'Verify Gradle version compatibility',
    ],
  };
}

export function parseTestFailure(output: string): ParsedError {
  const failureMatch = output.match(/([^#\s]+)#([^\s]+)/);

  return {
    type: 'test_failure',
    message: 'Test execution failed',
    file: failureMatch?.[1],
    suggestions: [
      'Review test failure details',
      'Check test assertions',
      'Verify test environment setup',
    ],
  };
}
