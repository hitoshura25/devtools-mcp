#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { formatMcpResponse, ProgressContext } from '@hitoshura25/core';
import {
  validateReleaseBuild,
  ValidateBuildParams,
  verifyApkSignature,
  VerifySignatureParams,
  validateProguardMapping,
  ValidateMappingParams,
  runAndroidTests,
  RunTestsParams,
  setupSigningConfig,
  SetupSigningParams,
  setupReleaseBuild,
  SetupReleaseBuildParams,
} from './tools/index.js';
import {
  iconPreflightCheck,
  PreflightCheckParams,
  iconCheckLegacy,
  iconConfirmDeleteLegacy,
  ConfirmDeleteLegacyParams,
  iconSearch,
  SearchIconsParams,
  iconSelect,
  SelectIconParams,
  iconGenerate,
  GenerateIconsParams,
  iconVerifyBuild,
  iconResetWorkflow,
  iconGetStatus,
} from './tools/icon/index.js';
import {
  implementStart,
  ImplementStartInput,
  implementStep,
  ImplementStepInput,
  implementStatus,
  ImplementStatusInput,
  implementAbort,
  ImplementAbortInput,
} from './tools/implement/index.js';

const server = new Server(
  {
    name: 'android-devtools',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define MCP tools
const tools: Tool[] = [
  {
    name: 'validate_release_build',
    description:
      'Build release APK and validate outputs. Returns error if build fails or outputs missing.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: {
          type: 'string',
          description: 'Path to Android project root',
          default: '.',
        },
        module: {
          type: 'string',
          description: 'Module to build (default: app)',
          default: 'app',
        },
        build_type: {
          type: 'string',
          enum: ['debug', 'release'],
          description: 'Build type',
          default: 'release',
        },
      },
    },
  },
  {
    name: 'verify_apk_signature',
    description: 'Verify APK signature is valid. Returns signature details or error.',
    inputSchema: {
      type: 'object',
      properties: {
        apk_path: {
          type: 'string',
          description: 'Path to APK file',
        },
        expected_alias: {
          type: 'string',
          description: 'Expected keystore alias (optional)',
        },
      },
      required: ['apk_path'],
    },
  },
  {
    name: 'validate_proguard_mapping',
    description: 'Validate ProGuard mapping file for crash reporting compatibility.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: {
          type: 'string',
          description: 'Path to Android project root',
          default: '.',
        },
        module: {
          type: 'string',
          description: 'Module name',
          default: 'app',
        },
        build_type: {
          type: 'string',
          description: 'Build type',
          default: 'release',
        },
      },
    },
  },
  {
    name: 'run_android_tests',
    description:
      'Run Android instrumented tests. Returns test results with pass/fail details.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: {
          type: 'string',
          description: 'Path to Android project root',
          default: '.',
        },
        module: {
          type: 'string',
          description: 'Module name',
          default: 'app',
        },
        build_type: {
          type: 'string',
          enum: ['debug', 'release'],
          description: 'Build type',
          default: 'debug',
        },
        test_filter: {
          type: 'string',
          description: 'Optional test class or method filter',
        },
      },
    },
  },
  {
    name: 'setup_signing_config',
    description: 'Generate Android signing configuration with keystores.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: {
          type: 'string',
          description: 'Path to Android project root',
          default: '.',
        },
        strategy: {
          type: 'string',
          enum: ['dual', 'single'],
          description: 'Keystore strategy: dual (separate prod/dev) or single',
          default: 'dual',
        },
        keystore_password: {
          type: 'string',
          description: 'Password for keystores (generated if not provided)',
        },
      },
    },
  },
  {
    name: 'setup_release_build',
    description:
      'Complete Android release build setup: ProGuard, signing, validation. Fails if build does not work.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: {
          type: 'string',
          description: 'Path to Android project root',
          default: '.',
        },
        package_name: {
          type: 'string',
          description: 'Package name (auto-detected if not provided)',
        },
        keystore_strategy: {
          type: 'string',
          enum: ['dual', 'single'],
          description: 'dual: separate prod/dev keystores, single: one keystore',
          default: 'dual',
        },
        skip_validation: {
          type: 'boolean',
          description: 'Skip build validation (NOT RECOMMENDED)',
          default: false,
        },
      },
    },
  },
  // Icon generation tools
  {
    name: 'icon_preflight_check',
    description:
      'Check dependencies for icon generation (curl, python3, rsvg-convert, minSdk >= 26)',
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
    description:
      'Check for legacy raster icons that can be removed (minSdk 26+ uses VectorDrawables)',
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

  // Implement workflow tools
  {
    name: 'implement_start',
    description: 'Start a new feature implementation workflow with AI review',
    inputSchema: {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          description: 'Description of the feature to implement',
        },
        project_path: {
          type: 'string',
          description: 'Path to Android project root (default: ".")',
          default: '.',
        },
        reviewers: {
          type: 'array',
          items: { enum: ['gemini', 'olmo'] },
          description: 'AI reviewers to use (default: ["gemini"])',
          default: ['gemini'],
        },
      },
      required: ['description'],
    },
  },
  {
    name: 'implement_step',
    description: 'Execute the next step in an implementation workflow',
    inputSchema: {
      type: 'object',
      properties: {
        workflow_id: {
          type: 'string',
          description: 'The workflow ID from implement_start',
        },
        step_result: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            output: { type: 'string' },
            files_created: { type: 'array', items: { type: 'string' } },
            files_modified: { type: 'array', items: { type: 'string' } },
          },
        },
      },
      required: ['workflow_id'],
    },
  },
  {
    name: 'implement_status',
    description: 'Get status of implementation workflows',
    inputSchema: {
      type: 'object',
      properties: {
        workflow_id: {
          type: 'string',
          description: 'Specific workflow ID (omit to list all active)',
        },
      },
    },
  },
  {
    name: 'implement_abort',
    description: 'Abort an implementation workflow',
    inputSchema: {
      type: 'object',
      properties: {
        workflow_id: { type: 'string' },
        reason: { type: 'string' },
      },
      required: ['workflow_id'],
    },
  },
];

// List tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

// Define type for MCP request parameters with metadata
type McpRequestParams = {
  name: string;
  arguments?: unknown;
  _meta?: { progressToken?: string };
};

// Call tool handler
// eslint-disable-next-line @typescript-eslint/no-explicit-any
server.setRequestHandler(CallToolRequestSchema, async (request): Promise<any> => {
  const { name, arguments: args } = request.params;

  // Extract progress token from request metadata (if client provides one)
  const progressToken = (request.params as McpRequestParams)._meta?.progressToken;

  const context: ProgressContext = {
    progressToken,
    server,
  };

  try {
    switch (name) {
      case 'validate_release_build': {
        const result = await validateReleaseBuild(args as unknown as ValidateBuildParams);
        return formatMcpResponse(result);
      }

      case 'verify_apk_signature': {
        const result = await verifyApkSignature(args as unknown as VerifySignatureParams);
        return formatMcpResponse(result);
      }

      case 'validate_proguard_mapping': {
        const result = await validateProguardMapping(args as unknown as ValidateMappingParams);
        return formatMcpResponse(result);
      }

      case 'run_android_tests': {
        const result = await runAndroidTests(args as unknown as RunTestsParams);
        return formatMcpResponse(result);
      }

      case 'setup_signing_config': {
        const result = await setupSigningConfig(args as unknown as SetupSigningParams);
        return formatMcpResponse(result);
      }

      case 'setup_release_build': {
        const result = await setupReleaseBuild(args as unknown as SetupReleaseBuildParams, context);
        return formatMcpResponse(result);
      }

      // Icon tools
      case 'icon_preflight_check': {
        const result = await iconPreflightCheck(args as unknown as PreflightCheckParams);
        return formatMcpResponse(result);
      }

      case 'icon_check_legacy': {
        const result = await iconCheckLegacy();
        return formatMcpResponse(result);
      }

      case 'icon_confirm_delete_legacy': {
        const result = await iconConfirmDeleteLegacy(args as unknown as ConfirmDeleteLegacyParams);
        return formatMcpResponse(result);
      }

      case 'icon_search': {
        const result = await iconSearch(args as unknown as SearchIconsParams);
        return formatMcpResponse(result);
      }

      case 'icon_select': {
        const result = await iconSelect(args as unknown as SelectIconParams);
        return formatMcpResponse(result);
      }

      case 'icon_generate': {
        const result = await iconGenerate(args as unknown as GenerateIconsParams);
        return formatMcpResponse(result);
      }

      case 'icon_verify_build': {
        const result = await iconVerifyBuild();
        return formatMcpResponse(result);
      }

      case 'icon_reset_workflow': {
        const result = await iconResetWorkflow();
        return formatMcpResponse(result);
      }

      case 'icon_get_status': {
        const result = await iconGetStatus();
        return formatMcpResponse(result);
      }

      // Implement workflow tools
      case 'implement_start': {
        const result = await implementStart(args as unknown as ImplementStartInput);
        return formatMcpResponse(result);
      }

      case 'implement_step': {
        const result = await implementStep(args as unknown as ImplementStepInput);
        return formatMcpResponse(result);
      }

      case 'implement_status': {
        const result = await implementStatus(args as unknown as ImplementStatusInput);
        return formatMcpResponse(result);
      }

      case 'implement_abort': {
        const result = await implementAbort(args as unknown as ImplementAbortInput);
        return formatMcpResponse(result);
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: false,
              error: {
                code: 'TOOL_ERROR',
                message: error instanceof Error ? error.message : 'Unknown error',
                suggestions: ['Check tool parameters', 'Review error details'],
                recoverable: false,
              },
            },
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Android DevTools MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
