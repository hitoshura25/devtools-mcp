# devtools-mcp Implementation Plan

## Overview

A TypeScript monorepo containing platform-specific MCP servers that provide reliable, enforced quality gates for AI agent development workflows. Starting with Android, with future expansion to Python, TypeScript/Node, and other platforms.

**Repository:** `github.com/anthropic-devtools/devtools-mcp` (or personal namespace)
**npm scope:** `@hitoshura25`
**Initial package:** `@hitoshura25/mcp-android`

## Core Principle: Reliability Through Code Execution

From our discussions, we established that:
- Skills/documentation have ~40-60% reliability (agents can skip steps)
- Skills with MCP tool calls have ~60-75% reliability (agents can skip the call)
- Single MCP tools with internal orchestration have ~90-95% reliability (one decision point)

**Design principle:** Each MCP tool should be self-contained and handle its entire workflow internally. The agent makes ONE decision (call the tool), and everything else executes deterministically.

---

## Repository Structure

```
devtools-mcp/
├── packages/
│   ├── core/                           # Shared logic (internal package)
│   │   ├── src/
│   │   │   ├── executor.ts             # Command execution with timeout/retry
│   │   │   ├── discovery.ts            # Project type detection
│   │   │   ├── results.ts              # Structured result types
│   │   │   ├── errors.ts               # Error parsing and suggestions
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── mcp-android/                    # Android MCP server (published)
│       ├── src/
│       │   ├── server.ts               # MCP server entry point
│       │   ├── cli.ts                  # CLI entry point (dual interface)
│       │   ├── tools/
│       │   │   ├── validate-release-build.ts
│       │   │   ├── verify-apk-signature.ts
│       │   │   ├── validate-proguard-mapping.ts
│       │   │   ├── run-android-tests.ts
│       │   │   ├── setup-release-build.ts
│       │   │   ├── setup-signing-config.ts
│       │   │   └── index.ts
│       │   ├── parsers/
│       │   │   ├── gradle-error-parser.ts
│       │   │   ├── test-result-parser.ts
│       │   │   └── index.ts
│       │   └── index.ts
│       ├── package.json
│       ├── README.md
│       └── tsconfig.json
│
├── .github/
│   └── workflows/
│       ├── ci.yml                      # Test all packages
│       ├── release.yml                 # Publish on version tags
│       └── changeset.yml               # Changeset PR automation
│
├── .changeset/
│   └── config.json
├── package.json                        # Root workspace config
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
└── README.md
```

---

## Package: `@hitoshura25/core` (Internal)

### Purpose
Shared utilities used by all platform-specific MCP servers. Not published to npm (internal workspace dependency).

### Key Components

#### `executor.ts` - Command Execution

```typescript
export interface ExecOptions {
  cwd?: string;
  timeout?: number;        // Default: 300000 (5 min)
  retries?: number;        // Default: 0
  retryDelay?: number;     // Default: 1000
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
): Promise<ExecResult>;

export async function execWithRetry(
  command: string,
  options: ExecOptions & { retries: number }
): Promise<ExecResult>;
```

#### `discovery.ts` - Project Detection

```typescript
export interface ProjectInfo {
  type: ProjectType;
  root: string;
  indicators: string[];    // Files that identified this type
  metadata: Record<string, unknown>;
}

export type ProjectType = 
  | 'android-kotlin'
  | 'android-java'
  | 'python-uv'
  | 'python-pip'
  | 'node-typescript'
  | 'node-javascript'
  | 'unknown';

export async function detectProjectType(path: string): Promise<ProjectInfo>;

// Android-specific detection
export async function detectAndroidProject(path: string): Promise<{
  packageName: string;
  minSdk: number;
  targetSdk: number;
  modules: string[];
  hasKotlin: boolean;
  buildSystem: 'gradle-kotlin' | 'gradle-groovy';
} | null>;
```

#### `results.ts` - Structured Results

```typescript
export interface ToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: ToolError;
  duration_ms: number;
  steps_completed: string[];
}

export interface ToolError {
  code: string;
  message: string;
  details?: string;
  suggestions: string[];
  recoverable: boolean;
}

export function formatMcpResponse(result: ToolResult): McpToolResponse;
```

#### `errors.ts` - Error Parsing

```typescript
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

export function parseGradleError(stderr: string): ParsedError;
export function parseTestFailure(output: string): ParsedError;
```

---

## Package: `@hitoshura25/mcp-android`

### Purpose
MCP server providing reliable Android development quality gates. Enforces build validation, signing verification, and test execution.

### Installation & Usage

```bash
# Global installation
npm install -g @hitoshura25/mcp-android

# Run as MCP server
mcp-android

# Run CLI directly
mcp-android-cli validate-release-build --project-path .
```

### Claude Code Configuration

```json
{
  "mcpServers": {
    "android": {
      "command": "npx",
      "args": ["@hitoshura25/mcp-android"]
    }
  }
}
```

### MCP Tools

#### 1. `validate_release_build`

**Purpose:** Run `./gradlew assembleRelease` and validate outputs exist.

**Why MCP:** Agents skip build commands ~40% of the time. This enforces execution.

```typescript
{
  name: "validate_release_build",
  description: "Build release APK and validate outputs. Returns error if build fails or outputs missing.",
  inputSchema: {
    type: "object",
    properties: {
      project_path: {
        type: "string",
        description: "Path to Android project root",
        default: "."
      },
      module: {
        type: "string",
        description: "Module to build (default: app)",
        default: "app"
      },
      build_type: {
        type: "string",
        enum: ["debug", "release"],
        default: "release"
      }
    }
  }
}
```

**Returns:**
```typescript
interface ValidateBuildResult {
  success: boolean;
  apk_path: string;
  apk_size_mb: number;
  mapping_path?: string;       // Only for release with minification
  mapping_size_bytes?: number;
  build_time_seconds: number;
  warnings: string[];
  errors: ToolError[];
}
```

**Implementation:**
```typescript
async function validateReleaseBuild(params: ValidateBuildParams): Promise<ToolResult<ValidateBuildResult>> {
  const startTime = Date.now();
  const steps: string[] = [];
  
  // 1. Verify project structure
  const projectInfo = await detectAndroidProject(params.project_path);
  if (!projectInfo) {
    return {
      success: false,
      error: {
        code: 'NOT_ANDROID_PROJECT',
        message: 'No Android project found at path',
        suggestions: ['Ensure build.gradle.kts or build.gradle exists']
      }
    };
  }
  steps.push('project_detected');
  
  // 2. Run gradle build (CANNOT BE SKIPPED)
  const buildCmd = `./gradlew assemble${capitalize(params.build_type)}`;
  const buildResult = await execCommand(buildCmd, {
    cwd: params.project_path,
    timeout: 300000  // 5 minutes
  });
  
  if (buildResult.exitCode !== 0) {
    const parsed = parseGradleError(buildResult.stderr);
    return {
      success: false,
      error: {
        code: 'BUILD_FAILED',
        message: parsed.message,
        details: buildResult.stderr.slice(-2000),
        suggestions: parsed.suggestions,
        recoverable: true
      },
      steps_completed: steps
    };
  }
  steps.push('build_succeeded');
  
  // 3. Verify APK exists (CANNOT BE SKIPPED)
  const apkPath = `${params.project_path}/${params.module}/build/outputs/apk/${params.build_type}/${params.module}-${params.build_type}.apk`;
  if (!existsSync(apkPath)) {
    return {
      success: false,
      error: {
        code: 'APK_NOT_FOUND',
        message: `APK not generated at expected path: ${apkPath}`,
        suggestions: ['Check build output for warnings', 'Verify module name is correct']
      },
      steps_completed: steps
    };
  }
  steps.push('apk_verified');
  
  // 4. Check ProGuard mapping for release builds
  let mappingPath: string | undefined;
  let mappingSize: number | undefined;
  
  if (params.build_type === 'release') {
    mappingPath = `${params.project_path}/${params.module}/build/outputs/mapping/release/mapping.txt`;
    if (existsSync(mappingPath)) {
      mappingSize = statSync(mappingPath).size;
      if (mappingSize < 1000) {
        return {
          success: false,
          error: {
            code: 'PROGUARD_INEFFECTIVE',
            message: `ProGuard mapping file is suspiciously small (${mappingSize} bytes)`,
            suggestions: [
              'Verify isMinifyEnabled = true in build.gradle.kts',
              'Check ProGuard rules are not keeping everything'
            ]
          },
          steps_completed: steps
        };
      }
      steps.push('proguard_verified');
    }
  }
  
  // 5. Return success with details
  const apkSize = statSync(apkPath).size / (1024 * 1024);
  
  return {
    success: true,
    data: {
      success: true,
      apk_path: apkPath,
      apk_size_mb: Math.round(apkSize * 100) / 100,
      mapping_path: mappingPath,
      mapping_size_bytes: mappingSize,
      build_time_seconds: Math.round((Date.now() - startTime) / 1000),
      warnings: extractWarnings(buildResult.stdout)
    },
    duration_ms: Date.now() - startTime,
    steps_completed: steps
  };
}
```

---

#### 2. `verify_apk_signature`

**Purpose:** Validate APK is correctly signed using apksigner/jarsigner.

```typescript
{
  name: "verify_apk_signature",
  description: "Verify APK signature is valid. Returns signature details or error.",
  inputSchema: {
    type: "object",
    properties: {
      apk_path: {
        type: "string",
        description: "Path to APK file"
      },
      expected_alias: {
        type: "string",
        description: "Expected keystore alias (optional)"
      }
    },
    required: ["apk_path"]
  }
}
```

**Returns:**
```typescript
interface VerifySignatureResult {
  signed: boolean;
  verified: boolean;
  scheme_versions: number[];  // v1, v2, v3, v4
  signer_info: {
    alias?: string;
    cn: string;
    organization?: string;
    valid_from: string;
    valid_until: string;
  };
}
```

---

#### 3. `validate_proguard_mapping`

**Purpose:** Validate ProGuard/R8 mapping file exists and is substantial.

```typescript
{
  name: "validate_proguard_mapping",
  description: "Validate ProGuard mapping file for crash reporting compatibility.",
  inputSchema: {
    type: "object",
    properties: {
      project_path: { type: "string", default: "." },
      module: { type: "string", default: "app" },
      build_type: { type: "string", default: "release" }
    }
  }
}
```

**Returns:**
```typescript
interface ValidateMappingResult {
  exists: boolean;
  path: string;
  size_bytes: number;
  line_count: number;
  classes_mapped: number;
  methods_mapped: number;
}
```

---

#### 4. `run_android_tests`

**Purpose:** Run Android instrumented tests and return structured results.

```typescript
{
  name: "run_android_tests",
  description: "Run Android instrumented tests. Returns test results with pass/fail details.",
  inputSchema: {
    type: "object",
    properties: {
      project_path: { type: "string", default: "." },
      module: { type: "string", default: "app" },
      build_type: { type: "string", enum: ["debug", "release"], default: "debug" },
      test_filter: { 
        type: "string", 
        description: "Optional test class or method filter"
      }
    }
  }
}
```

**Returns:**
```typescript
interface TestResult {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  duration_seconds: number;
  failures: Array<{
    class_name: string;
    method_name: string;
    message: string;
    stack_trace?: string;
  }>;
}
```

---

#### 5. `setup_release_build` (Orchestrator)

**Purpose:** Complete release build setup with enforced validation.

This is the "one tool to rule them all" pattern - agent calls ONE tool, gets complete setup with validation.

```typescript
{
  name: "setup_release_build",
  description: "Complete Android release build setup: ProGuard, signing, validation. Fails if build doesn't work.",
  inputSchema: {
    type: "object",
    properties: {
      project_path: { type: "string", default: "." },
      package_name: { 
        type: "string", 
        description: "Package name (auto-detected if not provided)"
      },
      keystore_strategy: {
        type: "string",
        enum: ["dual", "single"],
        default: "dual",
        description: "dual: separate prod/dev keystores, single: one keystore"
      },
      skip_validation: {
        type: "boolean",
        default: false,
        description: "Skip build validation (NOT RECOMMENDED)"
      }
    }
  }
}
```

**Implementation (orchestrates everything internally):**
```typescript
async function setupReleaseBuild(params: SetupParams): Promise<ToolResult<SetupResult>> {
  const steps: string[] = [];
  
  // 1. Detect project
  const projectInfo = await detectAndroidProject(params.project_path);
  if (!projectInfo) {
    return { success: false, error: { code: 'NOT_ANDROID', message: '...' } };
  }
  steps.push('project_detected');
  
  // 2. Create ProGuard rules
  await createProguardRules(params.project_path, projectInfo);
  steps.push('proguard_created');
  
  // 3. Generate keystores
  const keystores = await generateKeystores(params.project_path, params.keystore_strategy);
  steps.push('keystores_generated');
  
  // 4. Update build.gradle.kts
  await updateBuildGradle(params.project_path, projectInfo, keystores);
  steps.push('build_config_updated');
  
  // 5. Setup local gradle.properties
  await setupLocalGradleProperties(keystores);
  steps.push('local_config_created');
  
  // 6. VALIDATE BUILD (CANNOT BE SKIPPED unless explicitly requested)
  if (!params.skip_validation) {
    const validation = await validateReleaseBuild({
      project_path: params.project_path,
      build_type: 'release'
    });
    
    if (!validation.success) {
      return {
        success: false,
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Release build setup completed but validation failed',
          details: validation.error?.message,
          suggestions: [
            'Check ProGuard rules for missing keep directives',
            'Verify signing configuration in gradle.properties',
            ...validation.error?.suggestions ?? []
          ],
          recoverable: true
        },
        steps_completed: steps
      };
    }
    steps.push('build_validated');
  }
  
  // 7. Return complete result
  return {
    success: true,
    data: {
      files_created: [
        'app/proguard-rules.pro',
        'keystores/production-release.jks',
        'keystores/local-dev-release.jks'
      ],
      files_modified: [
        'app/build.gradle.kts'
      ],
      validation: params.skip_validation ? 'skipped' : 'passed',
      next_steps: [
        'Test release build: ./gradlew assembleRelease',
        'Setup E2E tests: use run_android_tests tool',
        'Setup Play Store: see documentation'
      ]
    },
    duration_ms: Date.now() - startTime,
    steps_completed: steps
  };
}
```

---

#### 6. `setup_signing_config`

**Purpose:** Generate signing configuration with dual-keystore strategy.

```typescript
{
  name: "setup_signing_config",
  description: "Generate Android signing configuration with keystores.",
  inputSchema: {
    type: "object",
    properties: {
      project_path: { type: "string", default: "." },
      strategy: {
        type: "string",
        enum: ["dual", "single"],
        default: "dual"
      },
      keystore_password: {
        type: "string",
        description: "Password for keystores (generated if not provided)"
      }
    }
  }
}
```

---

### CLI Interface (Dual Interface Pattern)

Each tool is also available via CLI for non-MCP agents:

```bash
# Validate release build
mcp-android-cli validate-release-build --project-path . --build-type release

# Verify APK signature
mcp-android-cli verify-apk-signature --apk-path app/build/outputs/apk/release/app-release.apk

# Run tests
mcp-android-cli run-android-tests --project-path . --build-type debug

# Full setup (orchestrator)
mcp-android-cli setup-release-build --project-path . --keystore-strategy dual
```

**CLI Implementation:**
```typescript
// cli.ts
import { Command } from 'commander';
import { validateReleaseBuild, verifyApkSignature, runAndroidTests, setupReleaseBuild } from './tools';

const program = new Command();

program
  .name('mcp-android-cli')
  .description('Android development quality gates CLI')
  .version('0.1.0');

program
  .command('validate-release-build')
  .description('Build release APK and validate outputs')
  .option('-p, --project-path <path>', 'Project path', '.')
  .option('-m, --module <name>', 'Module name', 'app')
  .option('-t, --build-type <type>', 'Build type', 'release')
  .action(async (opts) => {
    const result = await validateReleaseBuild({
      project_path: opts.projectPath,
      module: opts.module,
      build_type: opts.buildType
    });
    
    if (result.success) {
      console.log(JSON.stringify(result.data, null, 2));
      process.exit(0);
    } else {
      console.error(JSON.stringify(result.error, null, 2));
      process.exit(1);
    }
  });

// ... other commands

program.parse();
```

---

## Package Configuration

### Root `package.json`

```json
{
  "name": "devtools-mcp",
  "private": true,
  "scripts": {
    "build": "turbo run build",
    "test": "turbo run test",
    "lint": "turbo run lint",
    "clean": "turbo run clean",
    "release": "changeset publish"
  },
  "devDependencies": {
    "@changesets/cli": "^2.27.0",
    "turbo": "^2.0.0",
    "typescript": "^5.4.0"
  }
}
```

### `pnpm-workspace.yaml`

```yaml
packages:
  - 'packages/*'
```

### `turbo.json`

```json
{
  "$schema": "https://turbo.build/schema.json",
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "test": {
      "dependsOn": ["build"]
    },
    "lint": {}
  }
}
```

### `packages/mcp-android/package.json`

```json
{
  "name": "@hitoshura25/mcp-android",
  "version": "0.1.0",
  "description": "MCP server for Android development quality gates",
  "type": "module",
  "main": "./dist/index.js",
  "bin": {
    "mcp-android": "./dist/server.js",
    "mcp-android-cli": "./dist/cli.js"
  },
  "files": [
    "dist",
    "README.md"
  ],
  "scripts": {
    "build": "tsc",
    "test": "vitest",
    "lint": "eslint src/"
  },
  "dependencies": {
    "@hitoshura25/core": "workspace:*",
    "@modelcontextprotocol/sdk": "^1.0.0",
    "commander": "^12.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.4.0",
    "vitest": "^1.0.0"
  },
  "keywords": [
    "mcp",
    "android",
    "quality-gates",
    "gradle",
    "ci-cd"
  ],
  "repository": {
    "type": "git",
    "url": "https://github.com/anthropic-devtools/devtools-mcp"
  },
  "publishConfig": {
    "access": "public"
  }
}
```

---

## CI/CD Workflows

### `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: pnpm/action-setup@v2
        with:
          version: 9
      
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      
      - name: Build
        run: pnpm build
      
      - name: Lint
        run: pnpm lint
      
      - name: Test
        run: pnpm test
```

### `.github/workflows/release.yml`

```yaml
name: Release

on:
  push:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: pnpm/action-setup@v2
        with:
          version: 9
      
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
          registry-url: 'https://registry.npmjs.org'
      
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      
      - name: Build
        run: pnpm build
      
      - name: Create Release Pull Request or Publish
        uses: changesets/action@v1
        with:
          publish: pnpm release
          version: pnpm changeset version
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_PUBLISH_TOKEN }}
```

---

## Implementation Phases

### Phase 1: Foundation (Week 1)

1. **Initialize monorepo structure**
   - Create repository
   - Setup pnpm workspace
   - Configure turbo.json
   - Setup TypeScript configs
   - Configure changesets

2. **Implement `@hitoshura25/core`**
   - `executor.ts` - Command execution with timeout
   - `results.ts` - Structured result types
   - `errors.ts` - Gradle error parsing

3. **Implement first MCP tool: `validate_release_build`**
   - Full implementation with error handling
   - Unit tests with mocked gradle execution
   - Integration test scaffold

### Phase 2: Core Android Tools (Week 2)

1. **Implement validation tools**
   - `verify_apk_signature`
   - `validate_proguard_mapping`
   - `run_android_tests`

2. **Implement CLI interface**
   - All tools accessible via CLI
   - JSON output format
   - Exit codes for CI integration

3. **Add discovery utilities to core**
   - `detectAndroidProject`
   - Package name extraction
   - Build configuration parsing

### Phase 3: Orchestrator & Polish (Week 3)

1. **Implement orchestrator tools**
   - `setup_release_build`
   - `setup_signing_config`

2. **Documentation**
   - README with examples
   - Claude Code configuration guide
   - Tool API documentation

3. **CI/CD**
   - GitHub Actions workflows
   - Automated publishing
   - Version management

### Phase 4: Validation & Release (Week 4)

1. **End-to-end testing**
   - Test with real Android project
   - Test with Claude Code
   - Verify reliability claims (~95%)

2. **Initial release**
   - Publish `@hitoshura25/mcp-android@0.1.0`
   - Announce availability

---

## Future Platform Expansion

### `@hitoshura25/mcp-python` (Future)

Tools:
- `validate_python_build`
- `run_pytest`
- `setup_pypi_publishing`
- `run_ruff_lint`

### `@hitoshura25/mcp-node` (Future)

Tools:
- `validate_node_build`
- `run_npm_tests`
- `setup_npm_publishing`
- `run_eslint`

### Shared Patterns

All platform packages will:
1. Import shared utilities from `@hitoshura25/core`
2. Follow the dual CLI + MCP interface pattern
3. Return structured results with the same shape
4. Use the same error categorization system

---

## Success Metrics

1. **Reliability:** Achieve ~95% task completion when agents use MCP tools
2. **Adoption:** Successful setup in 3+ personal projects
3. **Reusability:** Other developers can install and use without modification
4. **Cross-agent:** Works with Claude Code, Cursor, and CLI-based agents

---

## CI Testing Strategy

Based on patterns from `IMPLEMENTATION_SPEC_V2.md`, we use a **layered testing approach** that separates business logic from MCP protocol concerns.

### Testing Philosophy

The key insight: **Separate testable business logic from MCP layer**.

```
┌─────────────────────────────────────────────────────────┐
│                    MCP Layer (Thin)                      │
│  - Parameter parsing                                     │
│  - JSON serialization                                    │
│  - Tool registration                                     │
│  → Test via: Integration tests (optional in CI)          │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│                 Business Logic (Core)                    │
│  - Gradle command execution                              │
│  - File operations                                       │
│  - Error parsing                                         │
│  - Result formatting                                     │
│  → Test via: Unit tests (ALWAYS in CI)                   │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│               External Commands (Mocked)                 │
│  - ./gradlew assembleRelease                             │
│  - keytool                                               │
│  - jarsigner                                             │
│  → Test via: Mocked in unit tests                        │
└─────────────────────────────────────────────────────────┘
```

### Layer 1: Unit Tests (Always Run in CI)

These test business logic with **mocked external commands**. No Android SDK required.

```typescript
// packages/mcp-android/src/tools/__tests__/validate-release-build.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateReleaseBuild } from '../validate-release-build';
import * as executor from '@hitoshura25/core/executor';
import * as fs from 'fs';

// Mock external dependencies
vi.mock('@hitoshura25/core/executor');
vi.mock('fs');

describe('validateReleaseBuild', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should succeed when build passes and APK exists', async () => {
    // Mock successful gradle execution
    vi.mocked(executor.execCommand).mockResolvedValue({
      exitCode: 0,
      stdout: 'BUILD SUCCESSFUL in 45s',
      stderr: '',
      durationMs: 45000,
      timedOut: false
    });

    // Mock file existence checks
    vi.mocked(fs.existsSync).mockImplementation((path) => {
      if (path.includes('app-release.apk')) return true;
      if (path.includes('mapping.txt')) return true;
      return false;
    });

    vi.mocked(fs.statSync).mockImplementation((path) => ({
      size: path.includes('apk') ? 15_000_000 : 50_000
    } as fs.Stats));

    const result = await validateReleaseBuild({
      project_path: '/fake/project',
      build_type: 'release'
    });

    expect(result.success).toBe(true);
    expect(result.data?.apk_size_mb).toBeCloseTo(14.3, 1);
    expect(result.steps_completed).toContain('build_succeeded');
    expect(result.steps_completed).toContain('apk_verified');
  });

  it('should fail with parsed error when build fails', async () => {
    // Mock failed gradle execution
    vi.mocked(executor.execCommand).mockResolvedValue({
      exitCode: 1,
      stdout: '',
      stderr: `
        > Task :app:compileReleaseKotlin FAILED
        e: /src/MainActivity.kt:15:5 Unresolved reference: foo
      `,
      durationMs: 5000,
      timedOut: false
    });

    const result = await validateReleaseBuild({
      project_path: '/fake/project',
      build_type: 'release'
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('BUILD_FAILED');
    expect(result.error?.suggestions).toContain(
      expect.stringMatching(/Unresolved reference/)
    );
  });

  it('should fail when APK not generated', async () => {
    vi.mocked(executor.execCommand).mockResolvedValue({
      exitCode: 0,
      stdout: 'BUILD SUCCESSFUL',
      stderr: '',
      durationMs: 45000,
      timedOut: false
    });

    // APK doesn't exist
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const result = await validateReleaseBuild({
      project_path: '/fake/project',
      build_type: 'release'
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('APK_NOT_FOUND');
  });

  it('should warn when ProGuard mapping is too small', async () => {
    vi.mocked(executor.execCommand).mockResolvedValue({
      exitCode: 0,
      stdout: 'BUILD SUCCESSFUL',
      stderr: '',
      durationMs: 45000,
      timedOut: false
    });

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockImplementation((path) => ({
      size: path.includes('mapping.txt') ? 500 : 15_000_000  // Too small!
    } as fs.Stats));

    const result = await validateReleaseBuild({
      project_path: '/fake/project',
      build_type: 'release'
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('PROGUARD_INEFFECTIVE');
  });
});
```

### Layer 2: Error Parser Tests (Always Run in CI)

Test that we correctly parse Gradle errors into actionable suggestions:

```typescript
// packages/core/src/__tests__/gradle-error-parser.test.ts

import { describe, it, expect } from 'vitest';
import { parseGradleError } from '../errors';

describe('parseGradleError', () => {
  it('should parse compilation errors', () => {
    const stderr = `
      > Task :app:compileReleaseKotlin FAILED
      e: /src/MainActivity.kt:15:5 Unresolved reference: foo
      e: /src/MainActivity.kt:20:10 Type mismatch
    `;

    const parsed = parseGradleError(stderr);

    expect(parsed.type).toBe('compilation');
    expect(parsed.file).toBe('/src/MainActivity.kt');
    expect(parsed.line).toBe(15);
    expect(parsed.suggestions).toContain('Fix compilation errors in MainActivity.kt');
  });

  it('should parse dependency resolution errors', () => {
    const stderr = `
      > Could not resolve com.example:library:1.0.0
      Required by: project :app
    `;

    const parsed = parseGradleError(stderr);

    expect(parsed.type).toBe('dependency');
    expect(parsed.suggestions).toContain('Check if dependency exists in configured repositories');
    expect(parsed.suggestions).toContain('Verify network connectivity');
  });

  it('should parse ProGuard errors', () => {
    const stderr = `
      Warning: com.example.MyClass: can't find referenced class
      Error: R8: Compilation failed
    `;

    const parsed = parseGradleError(stderr);

    expect(parsed.type).toBe('proguard');
    expect(parsed.suggestions).toContain('Add keep rule for com.example.MyClass');
  });

  it('should parse signing errors', () => {
    const stderr = `
      Execution failed for task ':app:signReleaseBundle'.
      > A failure occurred while executing com.android.build.gradle.internal.tasks
      > KeyStore not found at path: keystores/release.jks
    `;

    const parsed = parseGradleError(stderr);

    expect(parsed.type).toBe('signing');
    expect(parsed.suggestions).toContain('Verify keystore path in signing config');
    expect(parsed.suggestions).toContain('Check gradle.properties for signing credentials');
  });
});
```

### Layer 3: Integration Tests (Optional - Require Android SDK)

These tests run **actual Gradle commands** against a **fixture project**. Run locally or in specialized CI jobs.

```typescript
// packages/mcp-android/src/tools/__tests__/integration/validate-release-build.integration.test.ts

import { describe, it, expect, beforeAll } from 'vitest';
import { validateReleaseBuild } from '../../validate-release-build';
import path from 'path';

const FIXTURE_PROJECT = path.join(__dirname, 'fixtures/sample-android-app');

// Skip in CI unless ANDROID_SDK_ROOT is set
const describeIfAndroidSdk = process.env.ANDROID_SDK_ROOT 
  ? describe 
  : describe.skip;

describeIfAndroidSdk('validateReleaseBuild (integration)', () => {
  beforeAll(async () => {
    // Ensure fixture project is set up
    // This might run ./gradlew clean first
  }, 60000);

  it('should build real Android project', async () => {
    const result = await validateReleaseBuild({
      project_path: FIXTURE_PROJECT,
      build_type: 'debug'  // Debug is faster
    });

    expect(result.success).toBe(true);
    expect(result.data?.apk_path).toContain('.apk');
  }, 120000);  // 2 minute timeout
});
```

### CI Workflow Configuration

```yaml
# .github/workflows/ci.yml

name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  # ============================================
  # Unit Tests - Always Run (No Android SDK)
  # ============================================
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: pnpm/action-setup@v2
        with:
          version: 9
      
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      
      - name: Build
        run: pnpm build
      
      - name: Unit Tests
        run: pnpm test:unit
      
      - name: Lint
        run: pnpm lint

  # ============================================
  # Integration Tests - Optional (Requires SDK)
  # ============================================
  integration-tests:
    runs-on: ubuntu-latest
    # Only run on main branch or when explicitly requested
    if: github.ref == 'refs/heads/main' || contains(github.event.pull_request.labels.*.name, 'run-integration')
    
    steps:
      - uses: actions/checkout@v4
      
      - uses: pnpm/action-setup@v2
        with:
          version: 9
      
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      
      - name: Setup Java
        uses: actions/setup-java@v4
        with:
          distribution: 'temurin'
          java-version: '17'
      
      - name: Setup Android SDK
        uses: android-actions/setup-android@v3
      
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      
      - name: Build
        run: pnpm build
      
      - name: Integration Tests
        run: pnpm test:integration
        env:
          ANDROID_SDK_ROOT: ${{ env.ANDROID_HOME }}
```

### Package.json Test Scripts

```json
{
  "scripts": {
    "test": "pnpm test:unit",
    "test:unit": "vitest run --exclude '**/*.integration.test.ts'",
    "test:integration": "vitest run --include '**/*.integration.test.ts'",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  }
}
```

### Test Fixtures

For integration tests, include a minimal Android project fixture:

```
packages/mcp-android/src/tools/__tests__/
├── fixtures/
│   └── sample-android-app/
│       ├── app/
│       │   ├── build.gradle.kts
│       │   └── src/main/
│       │       ├── AndroidManifest.xml
│       │       └── kotlin/com/example/MainActivity.kt
│       ├── build.gradle.kts
│       ├── settings.gradle.kts
│       ├── gradle.properties
│       └── gradle/wrapper/
│           └── gradle-wrapper.properties
├── validate-release-build.test.ts          # Unit tests (mocked)
└── integration/
    └── validate-release-build.integration.test.ts  # Integration (real SDK)
```

### Local Development Testing

```bash
# Run unit tests (fast, no SDK needed)
pnpm test:unit

# Run with watch mode during development
pnpm test:watch

# Run integration tests (requires Android SDK)
export ANDROID_SDK_ROOT=/path/to/android/sdk
pnpm test:integration

# Run specific test file
pnpm vitest run packages/mcp-android/src/tools/__tests__/validate-release-build.test.ts
```

### MCP Protocol Testing (Manual)

For testing the actual MCP server integration:

```bash
# Start MCP Inspector
npx @modelcontextprotocol/inspector npx @hitoshura25/mcp-android

# Opens browser at localhost:5173
# Test tool calls interactively
# Verify JSON serialization
```

### Summary: Testing Strategy

| Test Type | Runs In CI | Requires Android SDK | Speed | Purpose |
|-----------|-----------|---------------------|-------|---------|
| Unit tests | ✅ Always | ❌ No | Fast (~10s) | Business logic, error parsing |
| Integration tests | ⚠️ Optional | ✅ Yes | Slow (~2min) | Real Gradle execution |
| MCP Inspector | ❌ Manual | ❌ No | N/A | Protocol debugging |

**Key principle:** Unit tests with mocked commands give us ~90% confidence. Integration tests provide the remaining ~10% but are expensive to run.

---

## Open Questions (Resolved)

1. ~~**Namespace:** Use `@hitoshura25` (personal) or create org namespace?~~ → **Using `@hitoshura25`**
2. ~~**Core package publishing:** Keep internal-only or publish for extensibility?~~ → **Internal only**
3. ~~**Testing strategy:** Mock gradle execution or require Android SDK in CI?~~ → **Both: Unit tests with mocks (always), Integration tests with SDK (optional)**
4. **Progress reporting:** How to report incremental progress from long-running tools? → **Both: MCP notifications (future-proof) + detailed execution logs (current)**

---

## Progress Reporting Strategy

### The Problem

Long-running MCP tools (like `./gradlew assembleRelease` which takes 1-3 minutes) create a poor user experience:

```
User: /devtools:android-release-setup

Agent: "Setting up Android release builds..."

[2 minutes and 30 seconds of silence]

Agent: "✅ Setup complete!"
```

### Research Findings (December 2024)

**MCP Protocol Support:** The MCP specification (2025-03-26) includes `notifications/progress`:

```json
{
  "jsonrpc": "2.0",
  "method": "notifications/progress",
  "params": {
    "progressToken": "abc123",
    "progress": 50,
    "total": 100,
    "message": "Running ./gradlew assembleRelease..."
  }
}
```

**Claude Code Status:** Multiple GitHub issues confirm Claude Code **receives** but **does not display** progress notifications:
- [Issue #4157](https://github.com/anthropics/claude-code/issues/4157) - Progress notifications not displayed
- [Issue #3174](https://github.com/anthropics/claude-code/issues/3174) - notifications/message not shown in UI
- [Issue #5960](https://github.com/anthropics/claude-code/issues/5960) - Streaming outputs not displayed

### Our Approach: Belt and Suspenders

Implement **both** strategies:

1. **MCP Progress Notifications** - Future-proof for when clients add support
2. **Detailed Execution Logs** - Works today, provides rich post-completion summary

### Implementation

#### 1. Core Types

```typescript
// packages/core/src/progress.ts

export interface ProgressReporter {
  /** Report progress (0.0 to 1.0) with optional message */
  report(progress: number, message: string): Promise<void>;
  
  /** Log a completed step */
  stepCompleted(step: string, details?: Record<string, unknown>): void;
  
  /** Get execution log for final response */
  getExecutionLog(): ExecutionStep[];
}

export interface ExecutionStep {
  step: string;
  started_at: string;      // ISO timestamp
  completed_at: string;    // ISO timestamp
  duration_ms: number;
  status: 'completed' | 'skipped' | 'failed';
  details?: Record<string, unknown>;
  message?: string;
}

export interface ProgressContext {
  progressToken?: string;
  server: McpServer;
}
```

#### 2. Progress Reporter Implementation

```typescript
// packages/core/src/progress.ts

import { Server } from '@modelcontextprotocol/sdk/server/index.js';

export function createProgressReporter(
  context: ProgressContext,
  totalSteps: number
): ProgressReporter {
  const executionLog: ExecutionStep[] = [];
  let currentStepIndex = 0;
  let currentStepStart: Date | null = null;
  let currentStepName: string | null = null;

  return {
    async report(progress: number, message: string): Promise<void> {
      // Always try to send MCP notification (future-proof)
      if (context.progressToken) {
        try {
          await context.server.notification({
            method: 'notifications/progress',
            params: {
              progressToken: context.progressToken,
              progress: Math.round(progress * 100),
              total: 100,
              message
            }
          });
        } catch (error) {
          // Client may not support notifications - that's OK
          // Log to stderr as fallback (some clients show this)
          console.error(`[progress] ${Math.round(progress * 100)}% - ${message}`);
        }
      }
      
      // Track for execution log
      if (currentStepName && currentStepStart) {
        // Update current step
      }
    },

    stepCompleted(step: string, details?: Record<string, unknown>): void {
      const now = new Date();
      
      // Complete previous step if exists
      if (currentStepName && currentStepStart) {
        executionLog.push({
          step: currentStepName,
          started_at: currentStepStart.toISOString(),
          completed_at: now.toISOString(),
          duration_ms: now.getTime() - currentStepStart.getTime(),
          status: 'completed',
          details: details
        });
      }
      
      // Start new step
      currentStepIndex++;
      currentStepName = step;
      currentStepStart = now;
      
      // Send progress notification
      const progress = currentStepIndex / totalSteps;
      this.report(progress, step);
    },

    getExecutionLog(): ExecutionStep[] {
      // Complete final step if still running
      if (currentStepName && currentStepStart) {
        const now = new Date();
        executionLog.push({
          step: currentStepName,
          started_at: currentStepStart.toISOString(),
          completed_at: now.toISOString(),
          duration_ms: now.getTime() - currentStepStart.getTime(),
          status: 'completed'
        });
        currentStepName = null;
        currentStepStart = null;
      }
      return executionLog;
    }
  };
}
```

#### 3. Tool Implementation with Progress

```typescript
// packages/mcp-android/src/tools/setup-release-build.ts

import { createProgressReporter } from '@hitoshura25/core';

export async function setupReleaseBuild(
  params: SetupReleaseBuildParams,
  context: ProgressContext
): Promise<ToolResult<SetupReleaseBuildResult>> {
  const startTime = Date.now();
  
  // Create progress reporter with expected step count
  const progress = createProgressReporter(context, 6);
  
  try {
    // Step 1: Detect project
    progress.stepCompleted('Detecting Android project...');
    const projectInfo = await detectAndroidProject(params.project_path);
    if (!projectInfo) {
      return {
        success: false,
        error: { code: 'NOT_ANDROID_PROJECT', message: '...' },
        execution_log: progress.getExecutionLog()
      };
    }
    
    // Step 2: Generate keystores
    progress.stepCompleted('Generating keystores...', { 
      strategy: params.keystore_strategy 
    });
    const keystores = await generateKeystores(params.project_path, params.keystore_strategy);
    
    // Step 3: Configure ProGuard
    progress.stepCompleted('Configuring ProGuard...');
    await createProguardRules(params.project_path, projectInfo);
    
    // Step 4: Update build configuration
    progress.stepCompleted('Updating build.gradle.kts...');
    await updateBuildGradle(params.project_path, projectInfo, keystores);
    
    // Step 5: Setup local environment
    progress.stepCompleted('Configuring local development environment...');
    await setupLocalGradleProperties(keystores);
    
    // Step 6: Validate build (long-running)
    progress.stepCompleted('Validating build (this may take 1-2 minutes)...');
    const validation = await validateReleaseBuild({
      project_path: params.project_path,
      build_type: 'release'
    });
    
    if (!validation.success) {
      return {
        success: false,
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Build validation failed',
          details: validation.error?.message,
          suggestions: validation.error?.suggestions ?? []
        },
        execution_log: progress.getExecutionLog(),
        duration_ms: Date.now() - startTime
      };
    }
    
    // Success!
    return {
      success: true,
      data: {
        package_name: projectInfo.packageName,
        keystores: {
          production: keystores.production.path,
          local_dev: keystores.localDev.path
        },
        files_created: [
          'app/proguard-rules.pro',
          keystores.production.path,
          keystores.localDev.path
        ],
        validation: {
          build_succeeded: true,
          apk_path: validation.data?.apk_path,
          apk_size_mb: validation.data?.apk_size_mb
        }
      },
      execution_log: progress.getExecutionLog(),
      duration_ms: Date.now() - startTime
    };
    
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'UNEXPECTED_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
        recoverable: false
      },
      execution_log: progress.getExecutionLog(),
      duration_ms: Date.now() - startTime
    };
  }
}
```

#### 4. MCP Server with Progress Token Handling

```typescript
// packages/mcp-android/src/server.ts

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const server = new Server(
  { name: 'android-devtools', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  // Extract progress token from request metadata (if client provides one)
  const progressToken = request.params._meta?.progressToken;
  
  const context: ProgressContext = {
    progressToken,
    server
  };
  
  switch (name) {
    case 'setup_release_build':
      const result = await setupReleaseBuild(args as SetupReleaseBuildParams, context);
      return formatMcpResponse(result);
      
    // ... other tools
  }
});
```

#### 5. Response Format with Execution Log

```typescript
// packages/core/src/results.ts

export interface ToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: ToolError;
  
  /** Detailed log of all steps executed */
  execution_log: ExecutionStep[];
  
  /** Total execution time */
  duration_ms: number;
}

export function formatMcpResponse(result: ToolResult): McpToolResponse {
  // Format execution log as human-readable summary
  const logSummary = result.execution_log
    .map(step => {
      const status = step.status === 'completed' ? '✓' : 
                     step.status === 'skipped' ? '○' : '✗';
      const duration = step.duration_ms < 1000 
        ? `${step.duration_ms}ms`
        : `${(step.duration_ms / 1000).toFixed(1)}s`;
      return `${status} ${step.step} (${duration})`;
    })
    .join('\n');
  
  const totalDuration = result.duration_ms < 1000
    ? `${result.duration_ms}ms`
    : `${(result.duration_ms / 1000).toFixed(1)}s`;

  if (result.success) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          ...result.data,
          execution_summary: {
            steps_completed: result.execution_log.length,
            total_duration: totalDuration,
            log: logSummary
          }
        }, null, 2)
      }]
    };
  } else {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: false,
          error: result.error,
          execution_summary: {
            steps_completed: result.execution_log.filter(s => s.status === 'completed').length,
            total_duration: totalDuration,
            log: logSummary
          }
        }, null, 2)
      }],
      isError: true
    };
  }
}
```

### Example Output

When the tool completes, the agent receives a response like:

```json
{
  "success": true,
  "package_name": "com.example.app",
  "keystores": {
    "production": "keystores/production-release.jks",
    "local_dev": "keystores/local-dev-release.jks"
  },
  "files_created": [
    "app/proguard-rules.pro",
    "keystores/production-release.jks",
    "keystores/local-dev-release.jks"
  ],
  "validation": {
    "build_succeeded": true,
    "apk_path": "app/build/outputs/apk/release/app-release.apk",
    "apk_size_mb": 15.2
  },
  "execution_summary": {
    "steps_completed": 6,
    "total_duration": "127.3s",
    "log": "✓ Detecting Android project... (0.5s)\n✓ Generating keystores... (2.1s)\n✓ Configuring ProGuard... (0.3s)\n✓ Updating build.gradle.kts... (0.4s)\n✓ Configuring local development environment... (0.2s)\n✓ Validating build (this may take 1-2 minutes)... (123.8s)"
  }
}
```

The agent can then present this nicely to the user:

```
✅ Android release build setup complete!

Package: com.example.app
Build validated: 15.2MB APK generated

Execution Summary:
✓ Detecting Android project... (0.5s)
✓ Generating keystores... (2.1s)
✓ Configuring ProGuard... (0.3s)
✓ Updating build.gradle.kts... (0.4s)
✓ Configuring local development environment... (0.2s)
✓ Validating build... (123.8s)

Total time: 2m 7s
```

### Benefits of This Approach

1. **Future-proof:** When Claude Code adds progress notification support, users will immediately see real-time updates
2. **Works today:** Detailed execution logs provide transparency even without live progress
3. **Debugging:** Execution logs help identify which step failed and how long each took
4. **stderr fallback:** Some clients may display stderr output, providing partial progress visibility
5. **Consistent API:** Same progress reporting code works across all tools
