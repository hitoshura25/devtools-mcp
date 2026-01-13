# devtools-mcp

A TypeScript monorepo containing platform-specific MCP servers that provide reliable, enforced quality gates for AI agent development workflows.

## Overview

This project implements the principle that **reliability increases when AI agents make fewer decisions**. By providing single MCP tools that handle entire workflows internally, we achieve ~90-95% reliability vs ~40-60% with documentation-only approaches.

### Packages

- **[@hitoshura25/core](./packages/core)** - Shared utilities for all platform MCP servers (internal)
- **[@hitoshura25/mcp-android](./packages/mcp-android)** - Android development quality gates MCP server (published)

## Quick Start

### Prerequisites

- Node.js >= 20.0.0
- pnpm >= 9.0.0
- Java JDK (for Android tools)
- Android SDK (for Android tools)

### Installation

```bash
# Install pnpm if not already installed
npm install -g pnpm

# Install dependencies
pnpm install

# Build all packages
pnpm build
```

### Development

```bash
# Run tests
pnpm test

# Run unit tests only (no Android SDK required)
pnpm test:unit

# Run integration tests (requires Android SDK)
pnpm test:integration

# Lint code
pnpm lint

# Clean build artifacts
pnpm clean
```

## Reviewer Configuration

The implementation workflow uses AI reviewers to validate specifications. You can configure which reviewers to use and run multiple reviewers simultaneously.

### Quick Start (Default)

The default configuration uses Gemini + Ollama for local development:

```bash
# Install Ollama and download OLMo model
ollama pull olmo-3.1:32b-think
ollama serve

# Install Gemini CLI
npm install -g @google/generative-ai-cli
gemini auth
```

### Recommended Setup: Free Local + Paid CI

For the best cost/benefit, use **Ollama** locally (free) and **OpenRouter** in CI (~$0.08/month):

**Local Development (.devtools/reviewers.config.json):**
```json
{
  "reviewers": ["gemini", "ollama"],
  "backends": {
    "gemini": {
      "model": "gemini-2.5-flash-lite",
      "useDocker": false
    },
    "ollama": {
      "model": "olmo-3.1:32b-think"
    }
  }
}
```

**CI Environment (override with env vars):**
```bash
export REVIEWERS=gemini,openrouter
export OPENROUTER_API_KEY=your_key  # Get from https://openrouter.ai/keys
export OPENROUTER_MODEL=allenai/olmo-3.1-32b-think
```

### Available Backends

| Backend | Cost | Best For | Setup |
|---------|------|----------|-------|
| **Gemini** | Free | Local + CI | `npm install -g @google/generative-ai-cli` |
| **Ollama** | Free | Local only | `ollama pull olmo-3.1:32b-think` |
| **OpenRouter** | ~$0.08/mo | CI environments | Get API key from [openrouter.ai](https://openrouter.ai/keys) |

See [docs/REVIEWERS.md](./docs/REVIEWERS.md) for detailed configuration options, cost comparisons, and troubleshooting.

## Architecture

### Core Principle: Reliability Through Code Execution

From our research:
- Skills/documentation: ~40-60% reliability (agents can skip steps)
- Skills with MCP tool calls: ~60-75% reliability (agents can skip the call)
- **Single MCP tools with internal orchestration: ~90-95% reliability** (one decision point)

**Design principle:** Each MCP tool is self-contained and handles its entire workflow internally. The agent makes ONE decision (call the tool), and everything else executes deterministically.

### Monorepo Structure

```
devtools-mcp/
├── packages/
│   ├── core/                    # Shared utilities (internal)
│   │   ├── src/
│   │   │   ├── executor.ts      # Command execution
│   │   │   ├── discovery.ts     # Project detection
│   │   │   ├── results.ts       # Structured results
│   │   │   ├── errors.ts        # Error parsing
│   │   │   └── progress.ts      # Progress reporting
│   │   └── package.json
│   │
│   └── mcp-android/             # Android MCP server (published)
│       ├── src/
│       │   ├── server.ts        # MCP server entry point
│       │   ├── cli.ts           # CLI entry point
│       │   ├── tools/           # MCP tools implementation
│       │   └── parsers/         # Output parsers
│       └── package.json
│
├── .github/
│   └── workflows/
│       ├── ci.yml               # CI tests
│       └── release.yml          # Automated publishing
│
├── package.json                 # Root workspace config
├── pnpm-workspace.yaml
├── turbo.json
└── tsconfig.base.json
```

## Using MCP Servers

### With Claude Code

Add to your Claude Code configuration:

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

### As CLI Tools

All tools are also available as CLI commands:

```bash
# Install globally
npm install -g @hitoshura25/mcp-android

# Use CLI
mcp-android-cli validate-release-build --project-path .
mcp-android-cli setup-release-build --project-path .
```

## Publishing

This monorepo uses [Changesets](https://github.com/changesets/changesets) for version management and publishing.

### Creating a Changeset

```bash
# Create a changeset (run this when you make changes)
pnpm changeset

# Follow prompts to describe changes
```

### Publishing

```bash
# Bump versions and update changelogs
pnpm changeset version

# Build and publish to npm
pnpm release
```

Alternatively, create a PR and the CI will handle versioning automatically.

## Contributing

1. Create a feature branch
2. Make changes
3. Run tests: `pnpm test`
4. Create a changeset: `pnpm changeset`
5. Submit a PR

## Testing Strategy

### Unit Tests (Always Run in CI)

Unit tests use mocked external commands and don't require Android SDK:

```bash
pnpm test:unit
```

### Integration Tests (Optional in CI)

Integration tests run actual Gradle commands and require Android SDK:

```bash
export ANDROID_SDK_ROOT=/path/to/android/sdk
pnpm test:integration
```

## Future Expansion

Planned platform packages:
- **@hitoshura25/mcp-python** - Python development quality gates
- **@hitoshura25/mcp-node** - Node.js development quality gates

All platform packages will:
1. Share utilities from `@hitoshura25/core`
2. Follow the dual CLI + MCP interface pattern
3. Return structured results with consistent error handling

## License

MIT

## Links

- [MCP Android Package](./packages/mcp-android/README.md)
- [Implementation Specification](./specs/devtools-mcp-implementation-plan.md)