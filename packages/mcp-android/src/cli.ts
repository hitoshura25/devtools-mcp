#!/usr/bin/env node

import { Command } from 'commander';
import {
  validateReleaseBuild,
  verifyApkSignature,
  validateProguardMapping,
  runAndroidTests,
  setupSigningConfig,
  setupReleaseBuild,
} from './tools/index.js';
import {
  iconPreflightCheck,
  iconCheckLegacy,
  iconConfirmDeleteLegacy,
  iconSearch,
  iconSelect,
  iconGenerate,
  iconVerifyBuild,
  iconResetWorkflow,
  iconGetStatus,
} from './tools/icon/index.js';

const program = new Command();

program
  .name('mcp-android-cli')
  .description('Android development quality gates CLI')
  .version('0.1.0');

// validate-release-build command
program
  .command('validate-release-build')
  .description('Build release APK and validate outputs')
  .option('-p, --project-path <path>', 'Project path', '.')
  .option('-m, --module <name>', 'Module name', 'app')
  .option('-t, --build-type <type>', 'Build type (debug|release)', 'release')
  .action(async (opts) => {
    const result = await validateReleaseBuild({
      project_path: opts.projectPath,
      module: opts.module,
      build_type: opts.buildType,
    });

    if (result.success) {
      console.log(JSON.stringify(result.data, null, 2));
      process.exit(0);
    } else {
      console.error(JSON.stringify(result.error, null, 2));
      process.exit(1);
    }
  });

// verify-apk-signature command
program
  .command('verify-apk-signature')
  .description('Verify APK signature')
  .requiredOption('-a, --apk-path <path>', 'Path to APK file')
  .option('-e, --expected-alias <alias>', 'Expected keystore alias')
  .action(async (opts) => {
    const result = await verifyApkSignature({
      apk_path: opts.apkPath,
      expected_alias: opts.expectedAlias,
    });

    if (result.success) {
      console.log(JSON.stringify(result.data, null, 2));
      process.exit(0);
    } else {
      console.error(JSON.stringify(result.error, null, 2));
      process.exit(1);
    }
  });

// validate-proguard-mapping command
program
  .command('validate-proguard-mapping')
  .description('Validate ProGuard mapping file')
  .option('-p, --project-path <path>', 'Project path', '.')
  .option('-m, --module <name>', 'Module name', 'app')
  .option('-t, --build-type <type>', 'Build type', 'release')
  .action(async (opts) => {
    const result = await validateProguardMapping({
      project_path: opts.projectPath,
      module: opts.module,
      build_type: opts.buildType,
    });

    if (result.success) {
      console.log(JSON.stringify(result.data, null, 2));
      process.exit(0);
    } else {
      console.error(JSON.stringify(result.error, null, 2));
      process.exit(1);
    }
  });

// run-android-tests command
program
  .command('run-android-tests')
  .description('Run Android instrumented tests')
  .option('-p, --project-path <path>', 'Project path', '.')
  .option('-m, --module <name>', 'Module name', 'app')
  .option('-t, --build-type <type>', 'Build type (debug|release)', 'debug')
  .option('-f, --test-filter <filter>', 'Test class or method filter')
  .action(async (opts) => {
    const result = await runAndroidTests({
      project_path: opts.projectPath,
      module: opts.module,
      build_type: opts.buildType,
      test_filter: opts.testFilter,
    });

    if (result.success) {
      console.log(JSON.stringify(result.data, null, 2));
      process.exit(0);
    } else {
      console.error(JSON.stringify(result.error, null, 2));
      process.exit(1);
    }
  });

// setup-signing-config command
program
  .command('setup-signing-config')
  .description('Generate Android signing configuration')
  .option('-p, --project-path <path>', 'Project path', '.')
  .option('-s, --strategy <strategy>', 'Keystore strategy (dual|single)', 'dual')
  .option('-pwd, --keystore-password <password>', 'Keystore password (generated if not provided)')
  .action(async (opts) => {
    const result = await setupSigningConfig({
      project_path: opts.projectPath,
      strategy: opts.strategy,
      keystore_password: opts.keystorePassword,
    });

    if (result.success) {
      console.log(JSON.stringify(result.data, null, 2));
      process.exit(0);
    } else {
      console.error(JSON.stringify(result.error, null, 2));
      process.exit(1);
    }
  });

// setup-release-build command (orchestrator)
program
  .command('setup-release-build')
  .description('Complete Android release build setup')
  .option('-p, --project-path <path>', 'Project path', '.')
  .option('-pkg, --package-name <name>', 'Package name (auto-detected if not provided)')
  .option('-s, --keystore-strategy <strategy>', 'Keystore strategy (dual|single)', 'dual')
  .option('--skip-validation', 'Skip build validation (NOT RECOMMENDED)', false)
  .action(async (opts) => {
    const result = await setupReleaseBuild({
      project_path: opts.projectPath,
      package_name: opts.packageName,
      keystore_strategy: opts.keystoreStrategy,
      skip_validation: opts.skipValidation,
    });

    if (result.success) {
      console.log(JSON.stringify(result.data, null, 2));
      process.exit(0);
    } else {
      console.error(JSON.stringify(result.error, null, 2));
      process.exit(1);
    }
  });

// Icon generation commands
const iconCmd = program.command('icon').description('Icon generation commands');

iconCmd
  .command('preflight')
  .description('Check dependencies for icon generation')
  .option('-p, --project-path <path>', 'Project path', '.')
  .action(async (opts) => {
    const result = await iconPreflightCheck({ project_path: opts.projectPath });

    if (result.success) {
      console.log(JSON.stringify(result.data, null, 2));
      process.exit(0);
    } else {
      console.error(JSON.stringify(result.error, null, 2));
      process.exit(1);
    }
  });

iconCmd
  .command('check-legacy')
  .description('Check for legacy raster icons')
  .action(async () => {
    const result = await iconCheckLegacy();

    if (result.success) {
      console.log(JSON.stringify(result.data, null, 2));
      process.exit(0);
    } else {
      console.error(JSON.stringify(result.error, null, 2));
      process.exit(1);
    }
  });

iconCmd
  .command('confirm-delete-legacy')
  .description('Confirm deletion of legacy icons')
  .requiredOption('-c, --confirm <boolean>', 'Confirm deletion (true|false)')
  .action(async (opts) => {
    const result = await iconConfirmDeleteLegacy({
      confirm: opts.confirm === 'true',
    });

    if (result.success) {
      console.log(JSON.stringify(result.data, null, 2));
      process.exit(0);
    } else {
      console.error(JSON.stringify(result.error, null, 2));
      process.exit(1);
    }
  });

iconCmd
  .command('search <term>')
  .description('Search Iconify for icons')
  .option('-l, --limit <number>', 'Result limit', '10')
  .action(async (term, opts) => {
    const result = await iconSearch({
      term,
      limit: parseInt(opts.limit),
    });

    if (result.success) {
      console.log(JSON.stringify(result.data, null, 2));
      process.exit(0);
    } else {
      console.error(JSON.stringify(result.error, null, 2));
      process.exit(1);
    }
  });

iconCmd
  .command('select <iconId>')
  .description('Select an icon from search results')
  .action(async (iconId) => {
    const result = await iconSelect({ icon_id: iconId });

    if (result.success) {
      console.log(JSON.stringify(result.data, null, 2));
      process.exit(0);
    } else {
      console.error(JSON.stringify(result.error, null, 2));
      process.exit(1);
    }
  });

iconCmd
  .command('generate')
  .description('Generate icon files')
  .option('-b, --background-color <color>', 'Background color (e.g., #2196F3)')
  .option('-s, --scale <number>', 'Icon scale factor', '1.15')
  .option('-f, --foreground-color <color>', 'Foreground color', 'white')
  .action(async (opts) => {
    const result = await iconGenerate({
      background_color: opts.backgroundColor,
      scale: opts.scale ? parseFloat(opts.scale) : undefined,
      foreground_color: opts.foregroundColor,
    });

    if (result.success) {
      console.log(JSON.stringify(result.data, null, 2));
      process.exit(0);
    } else {
      console.error(JSON.stringify(result.error, null, 2));
      process.exit(1);
    }
  });

iconCmd
  .command('verify')
  .description('Verify generated icons with a build')
  .action(async () => {
    const result = await iconVerifyBuild();

    if (result.success) {
      console.log(JSON.stringify(result.data, null, 2));
      process.exit(0);
    } else {
      console.error(JSON.stringify(result.error, null, 2));
      process.exit(1);
    }
  });

iconCmd
  .command('reset')
  .description('Reset icon workflow state')
  .action(async () => {
    const result = await iconResetWorkflow();

    if (result.success) {
      console.log(JSON.stringify(result.data, null, 2));
      process.exit(0);
    } else {
      console.error(JSON.stringify(result.error, null, 2));
      process.exit(1);
    }
  });

iconCmd
  .command('status')
  .description('Get current workflow status')
  .action(async () => {
    const result = await iconGetStatus();

    if (result.success) {
      console.log(JSON.stringify(result.data, null, 2));
      process.exit(0);
    } else {
      console.error(JSON.stringify(result.error, null, 2));
      process.exit(1);
    }
  });

program.parse();
