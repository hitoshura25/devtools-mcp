# MCP Android Icon Tools Specification

## Overview

Add **icon generation tools** to the existing `@hitoshura25/mcp-android` package with **state-machine enforced** workflow from Iconify's 200k+ icon library.

**Problem Statement:** The existing skill-based approach has 40-60% reliability because agents can skip steps (search term confirmation, legacy icon deletion confirmation). MCP tools with state tracking enforce workflow order.

**Solution:** Add icon tools to existing `mcp-android` that:
1. Track workflow state per feature (icon, future: fastlane)
2. Refuse out-of-order operations
3. Return explicit "awaiting_user_input" statuses
4. Reuse existing shell scripts for actual work

**Why single package:** Android developers want one MCP server for Android workflows. Tools can share context (project path, build state). Less maintenance overhead.

---

## Updated Package Structure

```
packages/mcp-android/
├── src/
│   ├── server.ts                    # MCP server (add icon tools)
│   ├── cli.ts                       # CLI entry (add icon commands)
│   ├── index.ts
│   │
│   ├── state/                       # NEW: Workflow state machines
│   │   ├── icon-workflow.ts         # Icon generation state
│   │   ├── index.ts
│   │   └── (future: fastlane-workflow.ts)
│   │
│   ├── tools/
│   │   ├── index.ts                 # Re-exports all tools
│   │   │
│   │   ├── quality/                 # EXISTING (reorganize)
│   │   │   ├── validate-release-build.ts
│   │   │   ├── verify-apk-signature.ts
│   │   │   ├── validate-proguard-mapping.ts
│   │   │   ├── run-android-tests.ts
│   │   │   ├── setup-release-build.ts
│   │   │   ├── setup-signing-config.ts
│   │   │   └── index.ts
│   │   │
│   │   └── icon/                    # NEW
│   │       ├── preflight.ts
│   │       ├── check-legacy.ts
│   │       ├── confirm-legacy.ts
│   │       ├── search-icons.ts
│   │       ├── select-icon.ts
│   │       ├── generate-icons.ts
│   │       ├── verify-build.ts
│   │       ├── reset-workflow.ts
│   │       ├── get-status.ts
│   │       └── index.ts
│   │
│   ├── scripts/                     # NEW: Shell scripts
│   │   ├── search-icons.sh
│   │   └── generate-app-icons.sh
│   │
│   └── parsers/                     # EXISTING
│       ├── gradle-error-parser.ts
│       ├── test-result-parser.ts
│       └── index.ts
│
├── src/__tests__/
│   ├── state/
│   │   └── icon-workflow.test.ts
│   ├── tools/
│   │   ├── quality/                 # Existing tests
│   │   └── icon/                    # NEW
│   │       ├── preflight.test.ts
│   │       ├── check-legacy.test.ts
│   │       ├── search-icons.test.ts
│   │       └── ...
│   └── integration/
│       ├── quality.integration.test.ts  # Existing
│       └── icon-workflow.integration.test.ts  # NEW
│
├── package.json                     # Update build script
├── tsconfig.json
├── vitest.config.ts
└── README.md                        # Update with icon tools docs
```

---

## State Machine Design

### Icon Workflow States

```typescript
// src/state/icon-workflow.ts

export enum IconWorkflowState {
  INITIAL = 'initial',
  PREFLIGHT_PASSED = 'preflight_passed',
  AWAITING_LEGACY_CONFIRMATION = 'awaiting_legacy_confirmation',
  LEGACY_RESOLVED = 'legacy_resolved',
  SEARCH_COMPLETE = 'search_complete',
  ICON_SELECTED = 'icon_selected',
  GENERATION_COMPLETE = 'generation_complete',
  VERIFIED = 'verified',
}

export interface IconSearchResult {
  id: string;
  collection: string;
  license: string;
  preview_url: string;
}

export interface IconWorkflowContext {
  state: IconWorkflowState;
  projectPath: string | null;
  legacyFiles: string[];
  searchTerm: string | null;
  searchResults: IconSearchResult[];
  selectedIcon: string | null;
  generatedFiles: string[];
}

export const initialIconContext: IconWorkflowContext = {
  state: IconWorkflowState.INITIAL,
  projectPath: null,
  legacyFiles: [],
  searchTerm: null,
  searchResults: [],
  selectedIcon: null,
  generatedFiles: [],
};

// Singleton for server lifetime
let iconContext: IconWorkflowContext = { ...initialIconContext };

export function getIconContext(): IconWorkflowContext {
  return iconContext;
}

export function updateIconContext(updates: Partial<IconWorkflowContext>): void {
  iconContext = { ...iconContext, ...updates };
}

export function resetIconContext(): void {
  iconContext = { ...initialIconContext };
}

// Valid transitions
const validTransitions: Record<IconWorkflowState, string[]> = {
  [IconWorkflowState.INITIAL]: ['icon_preflight_check'],
  [IconWorkflowState.PREFLIGHT_PASSED]: ['icon_check_legacy'],
  [IconWorkflowState.AWAITING_LEGACY_CONFIRMATION]: ['icon_confirm_delete_legacy'],
  [IconWorkflowState.LEGACY_RESOLVED]: ['icon_search'],
  [IconWorkflowState.SEARCH_COMPLETE]: ['icon_search', 'icon_select'],
  [IconWorkflowState.ICON_SELECTED]: ['icon_search', 'icon_generate'],
  [IconWorkflowState.GENERATION_COMPLETE]: ['icon_search', 'icon_verify_build'],
  [IconWorkflowState.VERIFIED]: ['icon_reset_workflow'],
};

export function canTransition(currentState: IconWorkflowState, action: string): boolean {
  return validTransitions[currentState]?.includes(action) ?? false;
}

export function getAvailableActions(state: IconWorkflowState): string[] {
  return validTransitions[state] ?? [];
}
```

### Valid Transitions Diagram

```
INITIAL
  └─→ icon_preflight_check() → PREFLIGHT_PASSED

PREFLIGHT_PASSED
  └─→ icon_check_legacy() → AWAITING_LEGACY_CONFIRMATION (if legacy found)
  └─→ icon_check_legacy() → LEGACY_RESOLVED (if no legacy)

AWAITING_LEGACY_CONFIRMATION
  └─→ icon_confirm_delete_legacy(true/false) → LEGACY_RESOLVED

LEGACY_RESOLVED
  └─→ icon_search(term) → SEARCH_COMPLETE

SEARCH_COMPLETE
  └─→ icon_search(term) → SEARCH_COMPLETE (allow re-search)
  └─→ icon_select(id) → ICON_SELECTED

ICON_SELECTED
  └─→ icon_generate() → GENERATION_COMPLETE
  └─→ icon_search(term) → SEARCH_COMPLETE (allow going back)

GENERATION_COMPLETE
  └─→ icon_verify_build() → VERIFIED
  └─→ icon_search(term) → SEARCH_COMPLETE (allow re-do)

VERIFIED
  └─→ icon_reset_workflow() → INITIAL (start over)
```

---

## MCP Tools Specification

All icon tools are prefixed with `icon_` to distinguish from existing quality tools.

### Tool 1: `icon_preflight_check`

**Purpose:** Verify all dependencies are installed before starting workflow.

**Input Schema:**
```typescript
{
  project_path?: string;  // Default: "."
}
```

**Behavior:**
- Checks: `curl`, `python3`, `rsvg-convert`
- Checks: Project has `minSdk >= 26`
- Updates state: `INITIAL` → `PREFLIGHT_PASSED`

**Response (success):**
```json
{
  "status": "ready",
  "project_path": "/path/to/project",
  "min_sdk": 26,
  "next": "Call icon_check_legacy() to continue"
}
```

**Response (missing deps):**
```json
{
  "status": "missing_dependencies",
  "missing": ["rsvg-convert"],
  "install_commands": {
    "rsvg-convert": {
      "macos": "brew install librsvg",
      "ubuntu": "sudo apt install librsvg2-bin"
    }
  }
}
```

**Response (invalid minSdk):**
```json
{
  "status": "unsupported_project",
  "error": "minSdk must be >= 26 for VectorDrawable icons",
  "current_min_sdk": 21
}
```

---

### Tool 2: `icon_check_legacy`

**Purpose:** Find existing legacy raster icons that should be removed.

**Input Schema:**
```typescript
{
  // No input - uses project_path from context
}
```

**Precondition:** State must be `PREFLIGHT_PASSED`

**Behavior:**
- Scans `mipmap-*dpi` directories for `ic_launcher*.webp` and `ic_launcher*.png`
- If found: State → `AWAITING_LEGACY_CONFIRMATION`
- If not found: State → `LEGACY_RESOLVED`

**Response (legacy found):**
```json
{
  "status": "confirmation_required",
  "legacy_files": [
    "app/src/main/res/mipmap-mdpi/ic_launcher.webp",
    "app/src/main/res/mipmap-hdpi/ic_launcher.webp"
  ],
  "message": "Found 10 legacy icon files. These are not needed for minSdk 26+ (VectorDrawables are used instead).",
  "next": "Call icon_confirm_delete_legacy(true) to delete, or icon_confirm_delete_legacy(false) to keep them"
}
```

**Response (no legacy):**
```json
{
  "status": "no_legacy_icons",
  "next": "Call icon_search(term) to search for icons"
}
```

**Response (wrong state):**
```json
{
  "error": "Invalid state",
  "current_state": "initial",
  "required_state": "preflight_passed",
  "message": "Call icon_preflight_check() first"
}
```

---

### Tool 3: `icon_confirm_delete_legacy`

**Purpose:** User confirmation for legacy icon deletion.

**Input Schema:**
```typescript
{
  confirm: boolean;  // true = delete, false = keep
}
```

**Precondition:** State must be `AWAITING_LEGACY_CONFIRMATION`

**Response:**
```json
{
  "status": "legacy_resolved",
  "action_taken": "deleted",
  "files_affected": 10,
  "next": "Call icon_search(term) to search for icons"
}
```

---

### Tool 4: `icon_search`

**Purpose:** Search Iconify for icons matching a term.

**Input Schema:**
```typescript
{
  term: string;
  limit?: number;  // Default: 10, max: 50
}
```

**Precondition:** State must be `LEGACY_RESOLVED`, `SEARCH_COMPLETE`, `ICON_SELECTED`, or `GENERATION_COMPLETE`

**Response:**
```json
{
  "status": "search_complete",
  "term": "health sync",
  "total_results": 47,
  "showing": 10,
  "results": [
    {
      "id": "mdi:heart-pulse",
      "collection": "Material Design Icons",
      "license": "Apache 2.0",
      "preview_url": "https://icon-sets.iconify.design/mdi/heart-pulse/"
    }
  ],
  "next": "Call icon_select(icon_id) to select an icon, or icon_search(term) to search again"
}
```

---

### Tool 5: `icon_select`

**Purpose:** Select an icon from search results.

**Input Schema:**
```typescript
{
  icon_id: string;  // e.g., "mdi:heart-pulse"
}
```

**Precondition:** State must be `SEARCH_COMPLETE`

**Response:**
```json
{
  "status": "icon_selected",
  "icon_id": "mdi:heart-pulse",
  "preview_url": "https://icon-sets.iconify.design/mdi/heart-pulse/",
  "next": "Call icon_generate() to generate icon files, or icon_search(term) to select a different icon"
}
```

---

### Tool 6: `icon_generate`

**Purpose:** Generate all icon assets.

**Input Schema:**
```typescript
{
  background_color?: string;  // Override auto-detect (e.g., "#2196F3")
  scale?: number;             // Override default 1.15
  foreground_color?: string;  // Override default "white"
}
```

**Precondition:** State must be `ICON_SELECTED`

**Response:**
```json
{
  "status": "generation_complete",
  "icon_id": "mdi:heart-pulse",
  "generated_files": [
    "app/src/main/res/drawable/ic_launcher_foreground.xml",
    "app/src/main/res/drawable/ic_launcher_background.xml",
    "app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml",
    "app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml",
    "fastlane/metadata/android/en-US/images/icon.png"
  ],
  "settings_used": {
    "background_color": "#4CAF50",
    "scale": 1.15,
    "foreground_color": "white"
  },
  "next": "Call icon_verify_build() to verify the build succeeds"
}
```

---

### Tool 7: `icon_verify_build`

**Purpose:** Verify generated icons work with a debug build.

**Input Schema:**
```typescript
{
  // No input
}
```

**Precondition:** State must be `GENERATION_COMPLETE`

**Response (success):**
```json
{
  "status": "verified",
  "build_result": "success",
  "verification": {
    "ic_launcher_foreground.xml": true,
    "ic_launcher_background.xml": true,
    "ic_launcher.xml": true,
    "ic_launcher_round.xml": true,
    "icon.png": true,
    "gradle_build": true
  },
  "next": "Icon generation complete! Call icon_reset_workflow() to start over if needed."
}
```

---

### Tool 8: `icon_reset_workflow`

**Purpose:** Reset icon workflow state to start fresh.

**Input Schema:**
```typescript
{
  // No input
}
```

**Response:**
```json
{
  "status": "reset",
  "next": "Call icon_preflight_check(project_path) to start a new workflow"
}
```

---

### Tool 9: `icon_get_status`

**Purpose:** Get current icon workflow state (for debugging/resumption).

**Input Schema:**
```typescript
{
  // No input
}
```

**Response:**
```json
{
  "state": "search_complete",
  "project_path": "/path/to/project",
  "legacy_files_found": 10,
  "legacy_resolution": "deleted",
  "search_term": "health sync",
  "search_results_count": 10,
  "selected_icon": null,
  "available_actions": ["icon_select", "icon_search"]
}
```

---

## Implementation Details

### 1. Update package.json

Add script copying to build process:

```json
{
  "scripts": {
    "build": "tsc && pnpm copy-scripts",
    "copy-scripts": "mkdir -p dist/scripts && cp src/scripts/*.sh dist/scripts/ && chmod +x dist/scripts/*.sh",
    "test": "vitest run",
    "test:unit": "vitest run --exclude '**/*.integration.test.ts'",
    "test:integration": "vitest run src/__tests__/integration",
    "lint": "eslint src/",
    "clean": "rm -rf dist *.tsbuildinfo"
  }
}
```

### 2. Copy Shell Scripts

Copy from `~/claude-devtools/skills/android-app-icon/scripts/`:
- `search-icons.sh`
- `generate-app-icons.sh`

To: `packages/mcp-android/src/scripts/`

### 3. Script Path Resolution (ESM)

```typescript
// src/tools/icon/search-icons.ts
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { execCommand } from '@hitoshura25/core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCRIPTS_DIR = join(__dirname, '..', '..', 'scripts');

export async function executeSearchScript(term: string, limit: number): Promise<string> {
  const scriptPath = join(SCRIPTS_DIR, 'search-icons.sh');
  const result = await execCommand(`"${scriptPath}" "${term}" ${limit}`, {
    timeout: 30000,
  });
  
  if (result.exitCode !== 0) {
    throw new Error(`Search failed: ${result.stderr}`);
  }
  
  return result.stdout;
}
```

### 4. Update server.ts

Add icon tools to existing server:

```typescript
// src/server.ts (additions)
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

// Add to tools array
const tools: Tool[] = [
  // ... existing quality tools ...
  
  // Icon tools
  {
    name: 'icon_preflight_check',
    description: 'Check dependencies for icon generation (curl, python3, rsvg-convert, minSdk >= 26)',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: {
          type: 'string',
          description: 'Path to Android project root',
          default: '.',
        },
      },
    },
  },
  {
    name: 'icon_check_legacy',
    description: 'Check for legacy raster icons that can be removed (minSdk 26+ uses VectorDrawables)',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'icon_confirm_delete_legacy',
    description: 'Confirm whether to delete legacy raster icons',
    inputSchema: {
      type: 'object',
      properties: {
        confirm: {
          type: 'boolean',
          description: 'true to delete legacy icons, false to keep them',
        },
      },
      required: ['confirm'],
    },
  },
  {
    name: 'icon_search',
    description: 'Search Iconify for icons matching a term',
    inputSchema: {
      type: 'object',
      properties: {
        term: {
          type: 'string',
          description: 'Search term (e.g., "health", "fitness", "medical")',
        },
        limit: {
          type: 'number',
          description: 'Maximum results to return (default: 10, max: 50)',
          default: 10,
        },
      },
      required: ['term'],
    },
  },
  {
    name: 'icon_select',
    description: 'Select an icon from search results',
    inputSchema: {
      type: 'object',
      properties: {
        icon_id: {
          type: 'string',
          description: 'Icon ID (e.g., "mdi:heart-pulse")',
        },
      },
      required: ['icon_id'],
    },
  },
  {
    name: 'icon_generate',
    description: 'Generate Android adaptive icon files from selected icon',
    inputSchema: {
      type: 'object',
      properties: {
        background_color: {
          type: 'string',
          description: 'Background color (auto-detected from colors.xml if not provided)',
        },
        scale: {
          type: 'number',
          description: 'Icon scale factor (default: 1.15)',
          default: 1.15,
        },
        foreground_color: {
          type: 'string',
          description: 'Foreground color (default: white)',
          default: 'white',
        },
      },
    },
  },
  {
    name: 'icon_verify_build',
    description: 'Verify generated icons with a debug build',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'icon_reset_workflow',
    description: 'Reset icon workflow state to start fresh',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'icon_get_status',
    description: 'Get current icon workflow state and available actions',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

// Add to switch statement in CallToolRequestSchema handler
case 'icon_preflight_check': {
  const result = await iconPreflightCheck(args as { project_path?: string });
  return formatMcpResponse(result);
}
case 'icon_check_legacy': {
  const result = await iconCheckLegacy();
  return formatMcpResponse(result);
}
// ... etc for all icon tools
```

### 5. Update CLI

Add icon commands to existing CLI:

```typescript
// src/cli.ts (additions)
import {
  iconPreflightCheck,
  iconSearch,
  // ...
} from './tools/icon/index.js';

// Add icon command group
const iconCmd = program
  .command('icon')
  .description('Icon generation commands');

iconCmd
  .command('preflight')
  .description('Check dependencies for icon generation')
  .option('-p, --project <path>', 'Project path', '.')
  .action(async (options) => {
    const result = await iconPreflightCheck({ project_path: options.project });
    console.log(JSON.stringify(result, null, 2));
  });

iconCmd
  .command('search <term>')
  .description('Search Iconify for icons')
  .option('-l, --limit <n>', 'Result limit', '10')
  .action(async (term, options) => {
    const result = await iconSearch({ term, limit: parseInt(options.limit) });
    console.log(JSON.stringify(result, null, 2));
  });

// ... other icon subcommands
```

Usage becomes:
```bash
mcp-android-cli icon preflight -p ./my-app
mcp-android-cli icon search "health"
mcp-android-cli icon select mdi:heart-pulse
mcp-android-cli icon generate
```

---

## Testing Requirements

### Unit Tests

**`src/__tests__/state/icon-workflow.test.ts`:**
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import {
  IconWorkflowState,
  getIconContext,
  updateIconContext,
  resetIconContext,
  canTransition,
  getAvailableActions,
} from '../../state/icon-workflow.js';

describe('IconWorkflowState', () => {
  beforeEach(() => {
    resetIconContext();
  });

  it('starts in INITIAL state', () => {
    expect(getIconContext().state).toBe(IconWorkflowState.INITIAL);
  });

  it('allows icon_preflight_check from INITIAL', () => {
    expect(canTransition(IconWorkflowState.INITIAL, 'icon_preflight_check')).toBe(true);
  });

  it('blocks icon_check_legacy from INITIAL', () => {
    expect(canTransition(IconWorkflowState.INITIAL, 'icon_check_legacy')).toBe(false);
  });

  it('updates context correctly', () => {
    updateIconContext({ 
      state: IconWorkflowState.PREFLIGHT_PASSED,
      projectPath: '/test/project',
    });
    
    const ctx = getIconContext();
    expect(ctx.state).toBe(IconWorkflowState.PREFLIGHT_PASSED);
    expect(ctx.projectPath).toBe('/test/project');
  });

  it('allows going back to search from ICON_SELECTED', () => {
    expect(canTransition(IconWorkflowState.ICON_SELECTED, 'icon_search')).toBe(true);
  });

  it('returns correct available actions', () => {
    const actions = getAvailableActions(IconWorkflowState.SEARCH_COMPLETE);
    expect(actions).toContain('icon_search');
    expect(actions).toContain('icon_select');
    expect(actions).not.toContain('icon_generate');
  });
});
```

**`src/__tests__/tools/icon/preflight.test.ts`:**
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { iconPreflightCheck } from '../../../tools/icon/preflight.js';
import * as core from '@hitoshura25/core';
import { resetIconContext } from '../../../state/icon-workflow.js';

vi.mock('@hitoshura25/core');

describe('icon_preflight_check', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetIconContext();
  });

  it('returns ready when all dependencies present and minSdk >= 26', async () => {
    // Mock dependency checks
    vi.mocked(core.execCommand)
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'curl 8.0.0', stderr: '', durationMs: 10, timedOut: false })
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'Python 3.11', stderr: '', durationMs: 10, timedOut: false })
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'rsvg-convert 2.56', stderr: '', durationMs: 10, timedOut: false });

    // Mock minSdk detection (grep command)
    vi.mocked(core.execCommand)
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'minSdk = 26', stderr: '', durationMs: 10, timedOut: false });

    const result = await iconPreflightCheck({ project_path: '/test/project' });
    expect(result.status).toBe('ready');
    expect(result.min_sdk).toBe(26);
  });

  it('returns missing_dependencies when rsvg-convert not found', async () => {
    vi.mocked(core.execCommand)
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'curl 8.0.0', stderr: '', durationMs: 10, timedOut: false })
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'Python 3.11', stderr: '', durationMs: 10, timedOut: false })
      .mockResolvedValueOnce({ exitCode: 1, stdout: '', stderr: 'command not found', durationMs: 10, timedOut: false });

    const result = await iconPreflightCheck({ project_path: '/test/project' });
    expect(result.status).toBe('missing_dependencies');
    expect(result.missing).toContain('rsvg-convert');
  });

  it('returns unsupported_project when minSdk < 26', async () => {
    // Mock all deps present
    vi.mocked(core.execCommand)
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'curl 8.0.0', stderr: '', durationMs: 10, timedOut: false })
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'Python 3.11', stderr: '', durationMs: 10, timedOut: false })
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'rsvg-convert 2.56', stderr: '', durationMs: 10, timedOut: false })
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'minSdk = 21', stderr: '', durationMs: 10, timedOut: false });

    const result = await iconPreflightCheck({ project_path: '/test/project' });
    expect(result.status).toBe('unsupported_project');
    expect(result.current_min_sdk).toBe(21);
  });
});
```

### Integration Tests

**`src/__tests__/integration/icon-workflow.integration.test.ts`:**
```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { resetIconContext } from '../../state/icon-workflow.js';
import { iconPreflightCheck } from '../../tools/icon/preflight.js';
import { iconCheckLegacy } from '../../tools/icon/check-legacy.js';

describe('Icon Workflow Integration', () => {
  let testProjectDir: string;

  beforeAll(async () => {
    // Create minimal Android project structure
    testProjectDir = await mkdtemp(join(tmpdir(), 'android-icon-test-'));
    await mkdir(join(testProjectDir, 'app/src/main/res/values'), { recursive: true });
    await mkdir(join(testProjectDir, 'app/src/main/res/mipmap-hdpi'), { recursive: true });
    
    // Create build.gradle.kts with minSdk 26
    await writeFile(
      join(testProjectDir, 'app/build.gradle.kts'),
      `android {
        defaultConfig {
          minSdk = 26
        }
      }`
    );
    
    // Create colors.xml
    await writeFile(
      join(testProjectDir, 'app/src/main/res/values/colors.xml'),
      `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="colorPrimary">#4CAF50</color>
</resources>`
    );
    
    // Create legacy icon to test detection
    await writeFile(
      join(testProjectDir, 'app/src/main/res/mipmap-hdpi/ic_launcher.webp'),
      'fake-webp-content'
    );
  });

  afterAll(async () => {
    await rm(testProjectDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    resetIconContext();
  });

  it('preflight passes with valid project', async () => {
    const result = await iconPreflightCheck({ project_path: testProjectDir });
    
    // This may fail if deps aren't installed - that's OK for CI
    if (result.status === 'missing_dependencies') {
      console.log('Skipping: missing dependencies', result.missing);
      return;
    }
    
    expect(result.status).toBe('ready');
  });

  it('detects legacy icons', async () => {
    // First run preflight
    const preflightResult = await iconPreflightCheck({ project_path: testProjectDir });
    if (preflightResult.status !== 'ready') {
      console.log('Skipping: preflight did not pass');
      return;
    }
    
    // Then check for legacy
    const result = await iconCheckLegacy();
    expect(result.status).toBe('confirmation_required');
    expect(result.legacy_files).toContain(
      expect.stringContaining('ic_launcher.webp')
    );
  });
});
```

---

## Build Verification

**CRITICAL:** Claude Code must verify the build works before considering implementation complete.

### Verification Checklist

```bash
# From monorepo root
cd ~/devtools-mcp

# 1. Install dependencies
pnpm install

# 2. Build all packages (must succeed)
pnpm build
# Expected: No errors, dist/ directories created

# 3. Lint (must pass)
pnpm lint
# Expected: No errors

# 4. Run unit tests (must pass)
pnpm test:unit
# Expected: All tests pass

# 5. Verify scripts are bundled
ls -la packages/mcp-android/dist/scripts/
# Expected: search-icons.sh, generate-app-icons.sh with execute permissions

# 6. Verify new tools are exported
node -e "import('@hitoshura25/mcp-android').then(m => console.log(Object.keys(m).filter(k => k.includes('icon'))))"
# Expected: Lists icon-related exports

# 7. Test CLI icon commands
./packages/mcp-android/dist/cli.js icon --help
# Expected: Shows icon subcommands
```

### Common Build Issues to Avoid

1. **Missing `.js` extensions in imports:**
   ```typescript
   // WRONG
   import { foo } from './tools/index';
   
   // CORRECT (ESM requires extensions)
   import { foo } from './tools/index.js';
   ```

2. **Script path resolution:**
   ```typescript
   // WRONG - won't work in ESM
   const scriptPath = path.join(__dirname, 'scripts', 'search-icons.sh');
   
   // CORRECT - ESM approach
   import { fileURLToPath } from 'url';
   import { dirname, join } from 'path';
   const __filename = fileURLToPath(import.meta.url);
   const __dirname = dirname(__filename);
   const SCRIPTS_DIR = join(__dirname, '..', 'scripts');
   ```

3. **Forgetting to copy scripts in build:**
   - Ensure `copy-scripts` runs after `tsc` in build script
   - Verify scripts have execute permission (`chmod +x`)

4. **State not resetting between tests:**
   - Call `resetIconContext()` in `beforeEach`

---

## npm Publishing (Changesets Workflow)

The monorepo already uses **changesets** for versioning and publishing.

### Publishing This Update

1. **Create changeset for the icon tools addition:**
   ```bash
   pnpm changeset
   ```
   
   Select `@hitoshura25/mcp-android` and choose `minor` (new feature).
   
   Example changeset content:
   ```markdown
   ---
   "@hitoshura25/mcp-android": minor
   ---
   
   Add icon generation tools with state machine enforcement.
   
   New tools:
   - `icon_preflight_check` - Verify dependencies
   - `icon_check_legacy` - Find legacy raster icons
   - `icon_confirm_delete_legacy` - Confirm deletion
   - `icon_search` - Search Iconify
   - `icon_select` - Select icon
   - `icon_generate` - Generate adaptive icons
   - `icon_verify_build` - Verify build
   - `icon_reset_workflow` - Reset state
   - `icon_get_status` - Get workflow status
   
   Features:
   - State machine prevents skipping confirmation steps
   - Iconify integration with 200k+ icons
   - VectorDrawable generation for adaptive icons
   - Play Store icon generation (512x512 PNG)
   ```

2. **Commit and push:**
   ```bash
   git add .
   git commit -m "feat(mcp-android): add icon generation tools"
   git push
   ```

3. **Merge PR** → GitHub Actions handles versioning and publishing

---

## Deliverables Checklist

### New Files
- [ ] `src/state/icon-workflow.ts` - State machine
- [ ] `src/state/index.ts` - Re-export
- [ ] `src/tools/icon/preflight.ts`
- [ ] `src/tools/icon/check-legacy.ts`
- [ ] `src/tools/icon/confirm-legacy.ts`
- [ ] `src/tools/icon/search-icons.ts`
- [ ] `src/tools/icon/select-icon.ts`
- [ ] `src/tools/icon/generate-icons.ts`
- [ ] `src/tools/icon/verify-build.ts`
- [ ] `src/tools/icon/reset-workflow.ts`
- [ ] `src/tools/icon/get-status.ts`
- [ ] `src/tools/icon/index.ts`
- [ ] `src/scripts/search-icons.sh` (copy from claude-devtools)
- [ ] `src/scripts/generate-app-icons.sh` (copy from claude-devtools)
- [ ] `src/__tests__/state/icon-workflow.test.ts`
- [ ] `src/__tests__/tools/icon/preflight.test.ts`
- [ ] `src/__tests__/tools/icon/check-legacy.test.ts`
- [ ] `src/__tests__/tools/icon/search-icons.test.ts`
- [ ] `src/__tests__/integration/icon-workflow.integration.test.ts`

### Modified Files
- [ ] `src/server.ts` - Add icon tools
- [ ] `src/cli.ts` - Add icon commands
- [ ] `src/tools/index.ts` - Re-export icon tools
- [ ] `package.json` - Add copy-scripts to build
- [ ] `README.md` - Document icon tools

### Verification
- [ ] `pnpm build` succeeds
- [ ] `pnpm lint` passes
- [ ] `pnpm test:unit` passes
- [ ] Scripts bundled in `dist/scripts/` with execute permissions
- [ ] CLI `icon` subcommands work

---

## Future: Fastlane Tools

When adding Fastlane deploy/screenshot tools, follow the same pattern:

```typescript
// src/state/fastlane-workflow.ts
export enum FastlaneWorkflowState {
  INITIAL,
  CONFIGURED,
  AWAITING_TRACK_SELECTION,
  // ...
}

// src/tools/fastlane/
// - deploy.ts
// - screenshots.ts
// - etc.
```

Tools would be prefixed with `fastlane_`:
- `fastlane_configure`
- `fastlane_deploy`
- `fastlane_capture_screenshots`
- etc.

Same state machine pattern ensures user confirmations can't be skipped.
