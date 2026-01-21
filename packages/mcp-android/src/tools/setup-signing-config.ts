import { execCommandSafe, ToolResult, isValidPath, isValidShellArg } from '@hitoshura25/core';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';

export interface SetupSigningParams {
  project_path?: string;
  strategy?: 'dual' | 'single';
  keystore_password?: string;
}

export interface KeystoreInfo {
  path: string;
  password: string;
  alias: string;
}

export interface SetupSigningResult {
  production_keystore: KeystoreInfo;
  local_dev_keystore?: KeystoreInfo;
  gradle_properties_created: boolean;
  instructions: string[];
}

function generatePassword(): string {
  return randomBytes(16).toString('hex');
}

export async function setupSigningConfig(
  params: SetupSigningParams
): Promise<ToolResult<SetupSigningResult>> {
  const startTime = Date.now();
  const steps: string[] = [];
  const projectPath = params.project_path || '.';
  const strategy = params.strategy || 'dual';
  const password = params.keystore_password || generatePassword();

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

  if (params.keystore_password && !isValidShellArg(params.keystore_password)) {
    return {
      success: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'Invalid keystore password: contains unsafe characters',
        details: 'Password must only contain alphanumeric characters and basic symbols',
        suggestions: ['Use a password without shell special characters like backticks, semicolons, or quotes'],
        recoverable: true,
      },
      duration_ms: Date.now() - startTime,
      steps_completed: steps,
    };
  }

  // 1. Create keystores directory
  const keystoresDir = join(projectPath, 'keystores');
  if (!existsSync(keystoresDir)) {
    mkdirSync(keystoresDir, { recursive: true });
  }
  steps.push('keystores_dir_created');

  // 2. Generate production keystore using execCommandSafe to prevent shell injection
  const productionKeystore: KeystoreInfo = {
    path: join(keystoresDir, 'production-release.jks'),
    password: password,
    alias: 'production-key',
  };

  // Use execCommandSafe with array arguments - bypasses shell interpretation
  const prodKeystoreArgs = [
    '-genkeypair',
    '-v',
    '-keystore', productionKeystore.path,
    '-alias', productionKeystore.alias,
    '-keyalg', 'RSA',
    '-keysize', '2048',
    '-validity', '10000',
    '-storepass', productionKeystore.password,
    '-keypass', productionKeystore.password,
    '-dname', 'CN=Production, OU=Android, O=Company, L=City, S=State, C=US',
  ];

  const prodResult = await execCommandSafe('keytool', prodKeystoreArgs, {
    cwd: projectPath,
    timeout: 30000,
  });

  if (prodResult.exitCode !== 0) {
    return {
      success: false,
      error: {
        code: 'KEYSTORE_GENERATION_FAILED',
        message: 'Failed to generate production keystore',
        details: prodResult.stderr,
        suggestions: [
          'Ensure keytool is installed (comes with JDK)',
          'Check if keytool is in PATH',
          'Verify write permissions in keystores directory',
        ],
        recoverable: true,
      },
      duration_ms: Date.now() - startTime,
      steps_completed: steps,
    };
  }
  steps.push('production_keystore_created');

  // 3. Generate local dev keystore if dual strategy
  let localDevKeystore: KeystoreInfo | undefined;

  if (strategy === 'dual') {
    const devPassword = generatePassword();
    localDevKeystore = {
      path: join(keystoresDir, 'local-dev-release.jks'),
      password: devPassword,
      alias: 'local-dev-key',
    };

    // Use execCommandSafe with array arguments - bypasses shell interpretation
    const devKeystoreArgs = [
      '-genkeypair',
      '-v',
      '-keystore', localDevKeystore.path,
      '-alias', localDevKeystore.alias,
      '-keyalg', 'RSA',
      '-keysize', '2048',
      '-validity', '10000',
      '-storepass', localDevKeystore.password,
      '-keypass', localDevKeystore.password,
      '-dname', 'CN=Dev, OU=Android, O=Company, L=City, S=State, C=US',
    ];

    const devResult = await execCommandSafe('keytool', devKeystoreArgs, {
      cwd: projectPath,
      timeout: 30000,
    });

    if (devResult.exitCode !== 0) {
      return {
        success: false,
        error: {
          code: 'DEV_KEYSTORE_GENERATION_FAILED',
          message: 'Failed to generate local dev keystore',
          details: devResult.stderr,
          suggestions: ['Check keytool installation', 'Verify write permissions'],
          recoverable: true,
        },
        duration_ms: Date.now() - startTime,
        steps_completed: steps,
      };
    }
    steps.push('local_dev_keystore_created');
  }

  // 4. Create local.properties template with signing config
  const localPropertiesPath = join(projectPath, 'local.properties');
  const localPropertiesContent = `# Auto-generated signing configuration
# DO NOT commit this file to version control

# Production keystore (for CI/CD)
# PRODUCTION_KEYSTORE_PATH=${productionKeystore.path}
# PRODUCTION_KEYSTORE_PASSWORD=${productionKeystore.password}
# PRODUCTION_KEY_ALIAS=${productionKeystore.alias}

# Local development keystore (for local builds)
${
  localDevKeystore
    ? `KEYSTORE_PATH=${localDevKeystore.path}
KEYSTORE_PASSWORD=${localDevKeystore.password}
KEY_ALIAS=${localDevKeystore.alias}`
    : `# KEYSTORE_PATH=${productionKeystore.path}
# KEYSTORE_PASSWORD=${productionKeystore.password}
# KEY_ALIAS=${productionKeystore.alias}`
}
`;

  // Only create if it doesn't exist
  let gradlePropertiesCreated = false;
  if (!existsSync(localPropertiesPath)) {
    writeFileSync(localPropertiesPath, localPropertiesContent);
    gradlePropertiesCreated = true;
    steps.push('local_properties_created');
  } else {
    steps.push('local_properties_exists');
  }

  // 5. Return success with instructions
  const instructions = [
    'Keystores have been generated successfully',
    `Production keystore: ${productionKeystore.path}`,
    localDevKeystore ? `Local dev keystore: ${localDevKeystore.path}` : '',
    '',
    'IMPORTANT SECURITY NOTES:',
    '1. Add keystores/ to .gitignore to prevent committing keystores',
    '2. Add local.properties to .gitignore',
    '3. Store production keystore password securely (e.g., password manager)',
    '4. For CI/CD, use GitHub Secrets or similar to store credentials',
    '',
    'Next steps:',
    '1. Update app/build.gradle.kts to use signing configuration',
    '2. Use setup_release_build tool to complete the setup',
  ].filter(Boolean);

  return {
    success: true,
    data: {
      production_keystore: productionKeystore,
      local_dev_keystore: localDevKeystore,
      gradle_properties_created: gradlePropertiesCreated,
      instructions,
    },
    duration_ms: Date.now() - startTime,
    steps_completed: steps,
  };
}
