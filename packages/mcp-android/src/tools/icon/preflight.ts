import { execCommand, ToolResult, isValidPath } from '@hitoshura25/core';
import { getIconContext, updateIconContext, IconWorkflowState, canTransition } from '../../state/icon-workflow.js';

export interface PreflightCheckParams {
  project_path?: string;
}

export interface PreflightCheckResult {
  status: 'ready' | 'missing_dependencies' | 'unsupported_project' | 'invalid_state';
  project_path?: string;
  min_sdk?: number;
  missing?: string[];
  install_commands?: Record<string, { macos: string; ubuntu: string }>;
  error?: string;
  current_min_sdk?: number;
  next?: string;
  current_state?: string;
  required_state?: string;
  message?: string;
}

async function checkDependency(command: string): Promise<boolean> {
  try {
    const result = await execCommand(`command -v ${command}`, { timeout: 5000 });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

async function getMinSdk(projectPath: string): Promise<number | null> {
  try {
    // Try build.gradle.kts first
    const ktsResult = await execCommand(
      `grep -r "minSdk\\s*=" "${projectPath}/app/build.gradle.kts" 2>/dev/null || true`,
      { timeout: 5000 }
    );

    if (ktsResult.exitCode === 0 && ktsResult.stdout) {
      const match = ktsResult.stdout.match(/minSdk\s*=\s*(\d+)/);
      if (match) {
        return parseInt(match[1]);
      }
    }

    // Try build.gradle (Groovy)
    const groovyResult = await execCommand(
      `grep -r "minSdkVersion\\s" "${projectPath}/app/build.gradle" 2>/dev/null || true`,
      { timeout: 5000 }
    );

    if (groovyResult.exitCode === 0 && groovyResult.stdout) {
      const match = groovyResult.stdout.match(/minSdkVersion\s+(\d+)/);
      if (match) {
        return parseInt(match[1]);
      }
    }

    return null;
  } catch {
    return null;
  }
}

export async function iconPreflightCheck(
  params: PreflightCheckParams
): Promise<ToolResult<PreflightCheckResult>> {
  const startTime = Date.now();
  const steps: string[] = [];
  const ctx = getIconContext();

  // Check state
  if (!canTransition(ctx.state, 'icon_preflight_check')) {
    return {
      success: false,
      error: {
        code: 'INVALID_STATE',
        message: `Cannot run preflight check from state: ${ctx.state}`,
        details: `Current state: ${ctx.state}, required state: ${IconWorkflowState.INITIAL}`,
        suggestions: ['Call icon_reset_workflow() to reset state'],
        recoverable: true,
      },
      duration_ms: Date.now() - startTime,
      steps_completed: steps,
      data: {
        status: 'invalid_state',
        current_state: ctx.state,
        required_state: IconWorkflowState.INITIAL,
        message: 'Call icon_reset_workflow() first',
      },
    };
  }

  const projectPath = params.project_path || '.';

  // Validate project path to prevent command injection
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
      data: { status: 'invalid_state' as const, error: 'Invalid project path' },
    };
  }

  steps.push('parameters_validated');

  // Check dependencies
  const dependencies = {
    curl: await checkDependency('curl'),
    python3: await checkDependency('python3'),
    'rsvg-convert': await checkDependency('rsvg-convert'),
  };

  steps.push('dependencies_checked');

  const missing = Object.entries(dependencies)
    .filter(([_, present]) => !present)
    .map(([name]) => name);

  if (missing.length > 0) {
    const installCommands: Record<string, { macos: string; ubuntu: string }> = {
      'rsvg-convert': {
        macos: 'brew install librsvg',
        ubuntu: 'sudo apt install librsvg2-bin',
      },
      curl: {
        macos: 'brew install curl',
        ubuntu: 'sudo apt install curl',
      },
      python3: {
        macos: 'brew install python3',
        ubuntu: 'sudo apt install python3',
      },
    };

    return {
      success: false,
      error: {
        code: 'MISSING_DEPENDENCIES',
        message: `Missing required dependencies: ${missing.join(', ')}`,
        details: missing.map((dep) => `${dep}: ${installCommands[dep]?.macos || 'N/A'}`).join('\n'),
        suggestions: missing.map((dep) => `Install ${dep}: ${installCommands[dep]?.macos || 'N/A'}`),
        recoverable: true,
      },
      duration_ms: Date.now() - startTime,
      steps_completed: steps,
      data: {
        status: 'missing_dependencies',
        missing,
        install_commands: missing.reduce(
          (acc, dep) => ({ ...acc, [dep]: installCommands[dep] }),
          {}
        ),
      },
    };
  }

  // Check minSdk
  const minSdk = await getMinSdk(projectPath);
  steps.push('min_sdk_checked');

  if (minSdk === null) {
    return {
      success: false,
      error: {
        code: 'MIN_SDK_NOT_FOUND',
        message: 'Could not determine minSdk from build.gradle or build.gradle.kts',
        details: `Searched in: ${projectPath}/app/build.gradle.kts and ${projectPath}/app/build.gradle`,
        suggestions: ['Ensure minSdk is set in app/build.gradle or app/build.gradle.kts'],
        recoverable: true,
      },
      duration_ms: Date.now() - startTime,
      steps_completed: steps,
      data: {
        status: 'unsupported_project',
        error: 'Could not determine minSdk',
      },
    };
  }

  if (minSdk < 26) {
    return {
      success: false,
      error: {
        code: 'UNSUPPORTED_MIN_SDK',
        message: `minSdk must be >= 26 for VectorDrawable icons (found: ${minSdk})`,
        details: 'VectorDrawable adaptive icons require API level 26 or higher',
        suggestions: ['Update minSdk to 26 or higher in build.gradle'],
        recoverable: false,
      },
      duration_ms: Date.now() - startTime,
      steps_completed: steps,
      data: {
        status: 'unsupported_project',
        error: 'minSdk must be >= 26 for VectorDrawable icons',
        current_min_sdk: minSdk,
      },
    };
  }

  // Update state
  updateIconContext({
    state: IconWorkflowState.PREFLIGHT_PASSED,
    projectPath,
  });

  steps.push('state_updated');

  return {
    success: true,
    data: {
      status: 'ready',
      project_path: projectPath,
      min_sdk: minSdk,
      next: 'Call icon_check_legacy() to continue',
    },
    duration_ms: Date.now() - startTime,
    steps_completed: steps,
  };
}
