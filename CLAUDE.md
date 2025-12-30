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

**For changes that need a release:**
```bash
pnpm changeset
# Follow the prompts to:
# 1. Select which packages changed
# 2. Choose version bump type (major/minor/patch)
# 3. Write a summary of the changes
```

**For changes that don't need a release** (docs, tooling, workflows):
```bash
pnpm changeset --empty
```

### Pre-commit Hook Behavior

The pre-commit hook will:
- ✅ **Allow commits** if a changeset exists
- ✅ **Skip check** for documentation-only changes (README.md, docs/)
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

### Workflow for Claude Code

**After making changes:**
1. Review the changes you made
2. Determine if they affect any packages
3. Run `pnpm changeset` (or `pnpm changeset --empty`)
4. Proceed with commit

**Example:**
```bash
# After modifying packages/mcp-android/src/tools/icon.ts
pnpm changeset
# Select: @hitoshura25/mcp-android
# Type: patch (bug fix) or minor (new feature)
# Summary: "Add icon generation validation"

# Now commit
git add .
git commit -m "Add icon generation validation"
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
  - `ci.yml` - Tests, builds, creates "Version Packages" PR
  - `release.yml` - Publishes to npm after CI passes
- `.changeset/` - Changeset files
- `scripts/` - Build and verification scripts

### Publishing Workflow

1. Create changeset on feature branch: `pnpm changeset`
2. Merge PR to main
3. CI creates "Version Packages" PR automatically
4. Review and merge Version Packages PR
5. Release workflow publishes to npm automatically

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
