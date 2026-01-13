# Reviewer Backends

This document describes the available AI reviewer backends for the devtools-mcp implementation workflow.

## Overview

The implementation workflow supports multiple AI reviewer backends to validate specifications before implementation. You can configure which reviewers to use and run multiple reviewers simultaneously for better validation.

## Available Backends

### 1. Gemini (Google)

**Description:** Google's Gemini models via CLI or Docker

**Setup:**
- **Local CLI (Recommended for development):**
  ```bash
  npm install -g @google/generative-ai-cli
  gemini auth  # Follow authentication prompts
  ```

- **Docker (Recommended for CI):**
  ```bash
  export GOOGLE_API_KEY=your_api_key
  docker pull us-docker.pkg.dev/gemini-code-dev/gemini-cli/sandbox:0.1.1
  ```

**Configuration:**
```json
{
  "backends": {
    "gemini": {
      "model": "gemini-2.5-flash-lite",
      "useDocker": false
    }
  }
}
```

**Environment Variables:**
- `GEMINI_MODEL` - Override model (default: `gemini-2.5-flash-lite`)
- `GOOGLE_API_KEY` - Required for Docker mode

**Cost:** Free tier available (15 RPM, 1M TPM, 1.5K RPD)

---

### 2. Ollama (Local)

**Description:** Run AI2's OLMo model locally via Ollama

**Setup:**
```bash
# Install Ollama
# macOS: brew install ollama
# Linux: curl -fsSL https://ollama.com/install.sh | sh

# Pull OLMo model
ollama pull olmo-3.1:32b-think

# Start server
ollama serve
```

**Configuration:**
```json
{
  "backends": {
    "ollama": {
      "baseUrl": "http://localhost:11434",
      "model": "olmo-3.1:32b-think"
    }
  }
}
```

**Environment Variables:**
- `OLLAMA_BASE_URL` - Override base URL (default: `http://localhost:11434`)
- `OLLAMA_MODEL` - Override model (default: `olmo-3.1:32b-think`)

**Cost:** Free (local compute only)

**Requirements:**
- 20-30 GB RAM for 32B model
- 20 GB disk space

---

### 3. OpenRouter (API) ⭐ Recommended for CI

**Description:** Access AI2's OLMo models via OpenRouter API

**Setup:**
```bash
# Get API key from https://openrouter.ai/keys
export OPENROUTER_API_KEY=your_api_key
export OPENROUTER_MODEL=allenai/olmo-3.1-32b-think
```

**Configuration:**
```json
{
  "backends": {
    "openrouter": {
      "endpoint": "https://openrouter.ai/api/v1",
      "model": "allenai/olmo-3.1-32b-think",
      "temperature": 0.3
    }
  }
}
```

**Environment Variables:**
- `OPENROUTER_API_KEY` - Required (get from https://openrouter.ai/keys)
- `OPENROUTER_MODEL` - Override model (default: `allenai/olmo-3.1-32b-think`)

**Available AI2/OLMo Models:**
- `allenai/olmo-3.1-32b-think` - Latest reasoning model (recommended)
- `allenai/olmo-3.1-32b-instruct` - Instruction-tuned variant
- `allenai/olmo-3-7b-think` - Smaller reasoning model
- `allenai/olmo-3-7b-instruct` - Lightweight instruction model
- `allenai/olmo-2-32b-instruct` - Previous generation

**Cost:** ~$0.0004 per review (~$0.08/month for 200 reviews)

**Pricing Details:**
- Input: $0.15 per million tokens
- Output: $0.50 per million tokens
- Typical review: 1000 input + 500 output tokens = $0.0004

**Advantages:**
- ✅ Uses actual AI2 OLMo model (same as Ollama)
- ✅ No local setup required
- ✅ Works in CI without RAM constraints
- ✅ 12x cheaper than GitHub Models
- ✅ Perfect for CI/CD environments

---

### 4. GitHub Models (Future)

**Description:** Access models via GitHub's AI inference platform

**Status:** Architecture ready, implementation pending

**Would provide:**
- Automatic `GITHUB_TOKEN` authentication
- Access to 14 models (Phi-4, GPT-4o mini, etc.)
- OpenAI-compatible API

---

## Configuration

### Configuration Priority

1. **Environment Variables** (highest priority)
2. **Config File** (`.devtools/reviewers.config.json`)
3. **Defaults** (embedded in code)

### Option A: OpenRouter Everywhere (Simplest)

**Local + CI:** Same configuration everywhere

```json
{
  "reviewers": ["gemini", "openrouter"],
  "backends": {
    "gemini": {
      "model": "gemini-2.5-flash-lite",
      "useDocker": false
    },
    "openrouter": {
      "model": "allenai/olmo-3.1-32b-think"
    }
  }
}
```

**Environment:**
```bash
export OPENROUTER_API_KEY=your_key
```

**Cost:** ~$0.12/month ($0.04 local + $0.08 CI)

---

### Option B: Free Local + Paid CI ⭐ Recommended

**Local:** Free with Ollama
**CI:** Paid with OpenRouter

**.devtools/reviewers.config.json:**
```json
{
  "reviewers": ["gemini", "ollama"],
  "backends": {
    "gemini": {
      "model": "gemini-2.5-flash-lite",
      "useDocker": false
    },
    "ollama": {
      "baseUrl": "http://localhost:11434",
      "model": "olmo-3.1:32b-think"
    }
  }
}
```

**.github/workflows/ci.yml:**
```yaml
env:
  REVIEWERS: gemini,openrouter  # Override for CI
  GOOGLE_API_KEY: ${{ secrets.GOOGLE_API_KEY }}
  OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
  OPENROUTER_MODEL: allenai/olmo-3.1-32b-think
```

**Cost:** ~$0.08/month (CI only)

**Advantages:**
- ✅ Free local development
- ✅ Minimal CI cost
- ✅ Same OLMo model everywhere

---

## Environment Variable Reference

| Variable | Description | Example |
|----------|-------------|---------|
| `REVIEWERS` | Comma-separated list of reviewers | `gemini,openrouter` |
| `GEMINI_MODEL` | Gemini model override | `gemini-2.5-flash-lite` |
| `GOOGLE_API_KEY` | Gemini Docker API key | `your_key` |
| `OLLAMA_BASE_URL` | Ollama server URL | `http://localhost:11434` |
| `OLLAMA_MODEL` | Ollama model override | `olmo-3.1:32b-think` |
| `OPENROUTER_API_KEY` | OpenRouter API key | `sk-or-...` |
| `OPENROUTER_MODEL` | OpenRouter model override | `allenai/olmo-3.1-32b-think` |

---

## Cost Comparison

| Backend | Model | Cost per Review | Monthly (200 reviews) | Notes |
|---------|-------|----------------|---------------------|--------|
| **Ollama** | OLMo 3.1 32B Think | $0 | $0 | Local compute, 20-30GB RAM required |
| **OpenRouter** | OLMo 3.1 32B Think | $0.0004 | **$0.08** | API-based, no local resources |
| **Gemini** | gemini-2.5-flash-lite | $0 | $0 | Free tier (rate limits apply) |
| GitHub Models | Phi-4 | $0.0005 | $1.00 | Not yet implemented |

**Recommendation:** Option B (Ollama local + OpenRouter CI) for optimal cost/benefit

---

## When to Use Which Backend

### Use Gemini When:
- ✅ You want fast, free reviews
- ✅ You're okay with rate limits
- ✅ You need local CLI or Docker flexibility

### Use Ollama When:
- ✅ You have 20-30GB RAM available
- ✅ You want truly free, offline reviews
- ✅ You want the full AI2 OLMo 32B model
- ✅ You're developing locally

### Use OpenRouter When:
- ✅ Running in CI/CD environments
- ✅ You need actual AI2 OLMo model without local resources
- ✅ You want consistency between local and CI
- ✅ Cost is not a concern (~$0.08/month)

---

## Troubleshooting

### Gemini: "CLI not found"
```bash
npm install -g @google/generative-ai-cli
gemini auth
```

### Ollama: "Connection refused"
```bash
# Start Ollama server
ollama serve

# Check if model is downloaded
ollama list
ollama pull olmo-3.1:32b-think
```

### OpenRouter: "API key not found"
```bash
# Get key from https://openrouter.ai/keys
export OPENROUTER_API_KEY=your_key

# Verify it's set
echo $OPENROUTER_API_KEY
```

### Integration Tests: "Reviewers not available"
```bash
# Check which reviewers are configured
echo $REVIEWERS

# Ensure all configured reviewers are available
# For gemini: check `which gemini` or GOOGLE_API_KEY
# For ollama: check `curl http://localhost:11434/api/tags`
# For openrouter: check $OPENROUTER_API_KEY
```

---

## Adding New Backends

The architecture is pluggable. To add a new backend:

1. Create `packages/core/src/reviewers/your-backend.ts`
2. Implement the `ReviewerAdapter` interface
3. Update `ReviewerType` in `types.ts`
4. Register in `ReviewerRegistry`
5. Update config with backend section
6. Add tests

No changes needed to orchestrator or workflow logic! ✅
