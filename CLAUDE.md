# devtools-mcp Project Instructions

This file contains project-specific instructions for the devtools-mcp monorepo.

---

## 🚨 CRITICAL: Changeset Creation Required

**MANDATORY: Create changesets after making changes to packages**

This project uses [Changesets](https://github.com/changesets/changesets) to manage package versioning and changelogs. A pre-commit hook enforces changeset creation.

### When to Create Changesets

**Create a changeset when you modify:**
- Any code in `packages/` directories
- Dependencies (package.json, pnpm-lock.yaml)
- Build configurations that affect packages
- Any files caught by the pre-commit hook

### How to Create Changesets

**IMPORTANT:** Claude Code cannot run interactive commands. Always create changesets manually by writing markdown files.

#### Manual Changeset Creation (Claude Code Method)

**After making changes:**
1. Review the changes you made
2. Determine if they affect any packages
3. Create a changeset file manually using the Write tool
4. Proceed with commit

#### Format for Package Changes

Create a new file in `.changeset/` directory with a random name (e.g., `random-name-here.md`):

```markdown
---
"@hitoshura25/mcp-android": patch
---

Brief description of the change for the changelog
```

**File format details:**
- **Filename:** Any random name like `happy-cats-jump.md` (avoid conflicts with existing files)
- **Frontmatter:** YAML block listing affected packages and bump type
  - `patch` - Bug fixes (0.1.2 → 0.1.3)
  - `minor` - New features (0.1.0 → 0.2.0)
  - `major` - Breaking changes (1.0.0 → 2.0.0)
- **Description:** Summary for the CHANGELOG

**Example changeset for multiple packages:**
```markdown
---
"@hitoshura25/mcp-android": minor
"@hitoshura25/core": patch
---

Add new icon generation feature and fix core utility bug
```

#### Format for Tooling/Infrastructure Changes

For changes that don't need a release (tooling, workflows, docs), create an **empty changeset**:

```markdown
---
---

Description of the tooling/infrastructure change (no package versions listed)
```

#### Complete Example

**Scenario:** Fixed a bug in `packages/mcp-android/src/tools/icon.ts`

**Step 1:** Create `.changeset/fix-icon-validation.md`:
```markdown
---
"@hitoshura25/mcp-android": patch
---

Fix icon generation validation to properly handle edge cases
```

**Step 2:** Commit:
```bash
git add .
git commit -m "Fix icon generation validation"
```

#### Quick Reference

**Package changes:**
```markdown
# Create .changeset/some-random-name.md using Write tool
---
"@hitoshura25/mcp-android": patch
---
Description here
```

**Tooling/workflow changes:**
```markdown
# Create .changeset/some-random-name.md using Write tool
---
---
Description here
```

#### Reference: Normal Interactive Method

For reference, developers normally use the interactive CLI (which Claude Code cannot use):
```bash
# For package changes
pnpm changeset
# Prompts to select packages, choose version bump, write summary

# For tooling/infrastructure changes
pnpm changeset --empty
```

### Pre-commit Hook Behavior

The pre-commit hook will:
- ✅ **Allow commits** if a changeset exists
- ✅ **Skip check** in CI (GitHub Actions)
- ✅ **Skip check** for documentation-only changes (root README.md, docs/)
- ✅ **Skip check** on main/master branch
- ❌ **Block commits** if meaningful files changed but no changeset found

If blocked, you'll see:
```
❌ No changeset found!

Please create a changeset before committing:
  pnpm changeset

Or create an empty changeset if this change doesn't need a release:
  pnpm changeset --empty
```

---

## Project Structure

This is a monorepo using:
- **pnpm workspaces** for package management
- **Turborepo** for build orchestration
- **Changesets** for versioning and releases
- **GitHub Actions** for CI/CD with NPM trusted publishing

### Key Directories

- `packages/` - Published npm packages
  - `packages/mcp-android/` - Android development MCP server
  - `packages/core/` (future) - Shared utilities
- `.github/workflows/` - CI/CD workflows
  - `ci.yml` - Tests, builds, creates "Version Packages" PR, and publishes to npm
- `.changeset/` - Changeset files
- `scripts/` - Build and verification scripts

### Publishing Workflow

1. Create changeset on feature branch (manually create `.changeset/*.md` file)
2. Merge PR to main
3. CI creates "Version Packages" PR automatically
4. Auto-merge enabled on Version Packages PR
5. Version Packages PR auto-merges when CI passes
6. CI publishes packages to npm automatically

---

## Testing

**Run tests:**
```bash
pnpm test              # All tests
pnpm test:unit         # Unit tests only
pnpm test:integration  # Integration tests (requires Android SDK)
```

**Run linting:**
```bash
pnpm lint
```

**Build:**
```bash
pnpm build
```

---

## NPM Publishing

This project uses **NPM Trusted Publishing with OIDC** for secure, token-less publishing.

- First publish of new packages uses NPM_PUBLISH_TOKEN (fallback)
- Subsequent publishes use OIDC (configured per package on npmjs.com)
- See `docs/NPM_TRUSTED_PUBLISHING_SETUP.md` for details

---

## Additional Notes

- All packages are scoped to `@hitoshura25/`
- Node.js >= 20.0.0 required
- pnpm >= 9.0.0 required
