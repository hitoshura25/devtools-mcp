# Reviewer Backends

This document describes the available AI reviewer backends for the devtools-mcp implementation workflow.

## Architecture

The reviewer system separates two concepts:

- **Reviewer Name** - User-defined identifier (e.g., `olmo-local`, `olmo-cloud`, `phi4-github`)
- **Backend Type** - Infrastructure provider (`ollama`, `openrouter`, `github-models`)

This allows you to:
- Configure the same model through different backends
- Give meaningful names to each configuration
- Run multiple reviewers with different backends simultaneously

## Available Backends

### 1. Ollama (Local)

**Description:** Run AI models locally via Ollama

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

**Cost:** Free (local compute only)

**Requirements:**
- 20-30 GB RAM for 32B model
- 20 GB disk space

---

### 2. OpenRouter (API) ⭐ Recommended for CI

**Description:** Access AI models via OpenRouter API

**Setup:**
```bash
# Get API key from https://openrouter.ai/keys
export OPENROUTER_API_KEY=your_api_key
```

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

### 3. GitHub Models

**Description:** Access models via GitHub's AI inference platform

**Setup:**
```bash
# Requires GitHub token with appropriate permissions
export GITHUB_TOKEN=your_github_token
```

**Available Models:**
- `phi-4` - Microsoft's latest small language model
- `gpt-4o-mini` - OpenAI's compact model
- Multiple other models (14+ available)

**Cost:** Paid API, pricing varies by model

**Note:** GitHub Models backend is not yet implemented. Coming soon!

---

## Configuration

### Configuration File

Create `.devtools/reviewers.config.json`:

```json
{
  "activeReviewers": ["olmo-local"],
  "reviewers": {
    "olmo-local": {
      "type": "ollama",
      "model": "olmo-3.1:32b-think",
      "baseUrl": "http://localhost:11434"
    },
    "olmo-cloud": {
      "type": "openrouter",
      "model": "allenai/olmo-3.1-32b-think",
      "endpoint": "https://openrouter.ai/api/v1",
      "temperature": 0.3
    },
    "phi4-github": {
      "type": "github-models",
      "model": "phi-4",
      "endpoint": "https://models.inference.ai.azure.com",
      "temperature": 0.3
    }
  }
}
```

### Configuration Priority

1. **Environment Variables** (highest priority)
2. **Config File** (`.devtools/reviewers.config.json`)
3. **Defaults** (embedded in code)

---

## Recommended Configurations

### Option A: OpenRouter Everywhere (Simplest)

**Local + CI:** Same configuration everywhere

```json
{
  "activeReviewers": ["olmo-cloud"],
  "reviewers": {
    "olmo-cloud": {
      "type": "openrouter",
      "model": "allenai/olmo-3.1-32b-think"
    }
  }
}
```

**Environment:**
```bash
export OPENROUTER_API_KEY=your_key
```

**Cost:** ~$0.08/month (200 reviews)

---

### Option B: Free Local + Paid CI ⭐ Recommended

**Local:** Free with Ollama
**CI:** Paid with OpenRouter

**.devtools/reviewers.config.json:**
```json
{
  "activeReviewers": ["olmo-local"],
  "reviewers": {
    "olmo-local": {
      "type": "ollama",
      "model": "olmo-3.1:32b-think",
      "baseUrl": "http://localhost:11434"
    },
    "olmo-cloud": {
      "type": "openrouter",
      "model": "allenai/olmo-3.1-32b-think"
    }
  }
}
```

**.github/workflows/ci.yml:**
```yaml
env:
  ACTIVE_REVIEWERS: olmo-cloud  # Override for CI
  OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
```

**Cost:** ~$0.08/month (CI only)

**Advantages:**
- ✅ Free local development
- ✅ Minimal CI cost
- ✅ Same OLMo model everywhere

---

### Option C: Multiple Reviewers

Run multiple reviewers for comprehensive validation:

```json
{
  "activeReviewers": ["olmo-local", "olmo-cloud"],
  "reviewers": {
    "olmo-local": {
      "type": "ollama",
      "model": "olmo-3.1:32b-think"
    },
    "olmo-cloud": {
      "type": "openrouter",
      "model": "allenai/olmo-3.1-32b-think"
    }
  }
}
```

---

## Environment Variable Reference

| Variable | Description | Example |
|----------|-------------|---------|
| `ACTIVE_REVIEWERS` | Comma-separated list of reviewer names | `olmo-local,olmo-cloud` |
| `OPENROUTER_API_KEY` | OpenRouter API key | `sk-or-...` |
| `GITHUB_TOKEN` | GitHub token for GitHub Models | `ghp_...` |

---

## Cost Comparison

| Reviewer Config | Backend | Model | Cost per Review | Monthly (200 reviews) |
|-----------------|---------|-------|----------------|---------------------|
| `olmo-local` | Ollama | OLMo 3.1 32B | $0 | $0 |
| `olmo-cloud` | OpenRouter | OLMo 3.1 32B | $0.0004 | **$0.08** |
| `phi4-github` | GitHub Models | Phi-4 | Varies | Varies |

**Recommendation:** Option B (Ollama local + OpenRouter CI) for optimal cost/benefit

---

## When to Use Which Backend

### Use Ollama When:
- ✅ You have 20-30GB RAM available
- ✅ You want truly free, offline reviews
- ✅ You want the full AI2 OLMo 32B model
- ✅ You're developing locally
- ✅ Privacy is important (all processing is local)

### Use OpenRouter When:
- ✅ Running in CI/CD environments
- ✅ You need actual AI2 OLMo model without local resources
- ✅ You want consistency between local and CI
- ✅ Cost is not a concern (~$0.08/month)
- ✅ No local setup required

### Use GitHub Models When:
- ✅ Already using GitHub Actions for CI
- ✅ Want to avoid managing additional API keys
- ✅ Need access to multiple model providers
- ✅ Prefer GitHub-native solutions

---

## Troubleshooting

### Ollama: "Connection refused"
```bash
# Start Ollama server
ollama serve

# Check if model is downloaded
ollama list
ollama pull olmo-3.1:32b-think

# Verify server is running
curl http://localhost:11434/api/tags
```

### OpenRouter: "API key not found"
```bash
# Get key from https://openrouter.ai/keys
export OPENROUTER_API_KEY=your_key

# Verify it's set
echo $OPENROUTER_API_KEY

# Test the API
curl https://openrouter.ai/api/v1/models \
  -H "Authorization: Bearer $OPENROUTER_API_KEY"
```

### GitHub Models: "Authentication failed"
```bash
# Verify token is set
echo $GITHUB_TOKEN

# Check token permissions
# Token needs access to GitHub Models API

# In GitHub Actions, token is automatically available
# No manual setup needed
```

### Integration Tests: "Reviewers not available"
```bash
# Check which reviewers are configured
echo $ACTIVE_REVIEWERS

# Ensure all configured reviewers have their backends available:
# For ollama backends: check `curl http://localhost:11434/api/tags`
# For openrouter backends: check $OPENROUTER_API_KEY is set
# For github-models backends: check $GITHUB_TOKEN is set
```

---

## Adding New Backends

The architecture is pluggable. To add a new backend:

1. Create `packages/core/src/reviewers/your-backend.ts`
2. Implement the `ReviewerAdapter` interface:
   ```typescript
   interface ReviewerAdapter {
     name: ReviewerName;
     backendType: BackendType;
     model: string;
     checkAvailability(): Promise<ReviewerAvailability>;
     getReviewCommand(spec: string, context: ReviewContext): string;
     parseReviewOutput(output: string): ReviewResult;
   }
   ```
3. Add backend type to `BackendType` in `types.ts`
4. Register factory in `backendFactories` in `registry.ts`
5. Add config interface (e.g., `YourBackendConfig`) in `types.ts`
6. Add tests

No changes needed to orchestrator or workflow logic!
