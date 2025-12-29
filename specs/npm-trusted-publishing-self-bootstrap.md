# NPM Trusted Publishing Self-Bootstrapping Implementation Spec

## Overview

This specification defines the implementation for a self-bootstrapping NPM publishing workflow that eliminates the circular dependency in OIDC trusted publishing setup.

**Problem:** Cannot configure OIDC trusted publishing until package exists on npm, but don't want to manually publish before CI can use OIDC.

**Solution:** Intelligent workflow that detects package existence and automatically uses NPM_TOKEN fallback for first publish, then OIDC for all subsequent publishes.

## Requirements

### Functional Requirements

1. **Automatic Package Detection**
   - Workflow must detect if package exists on npm registry
   - Must work for monorepo with multiple packages
   - Must handle scoped packages (@hitoshura25/*)

2. **Intelligent Authentication Fallback**
   - Use OIDC trusted publishing by default (when package exists and OIDC configured)
   - Fallback to NPM_TOKEN for new packages (first publish)
   - Fallback to NPM_TOKEN if OIDC not yet configured

3. **Transparency and Logging**
   - Log which authentication method is used for each package
   - Provide clear feedback when token fallback is used
   - Generate post-publish instructions for OIDC configuration

4. **Security**
   - OIDC remains the preferred method (most secure)
   - NPM_TOKEN only used when necessary
   - All token usage logged for audit trail

### Non-Functional Requirements

1. **Maintainability**
   - Clear separation of concerns
   - Well-documented workflow logic
   - Easy to understand for future maintainers

2. **Reliability**
   - Must handle network failures gracefully
   - Must not fail if package check times out
   - Must preserve existing workflow behavior

## Research Findings

### NPM CLI Behavior

**Key Discovery:** npm CLI (v11.5+) already implements automatic fallback behavior:
1. First tries OIDC authentication (`id-token: write` permission)
2. If OIDC fails or unavailable, falls back to NPM_TOKEN
3. If both fail, publish fails with clear error

**Implication:** We don't need complex logic - just ensure NPM_TOKEN is available as fallback.

### NPM API Limitations

- ❌ No official npm API for programmatically configuring OIDC trusted publishers
- ❌ OIDC configuration must be done manually via npmjs.com web UI
- ✅ Can check package existence via `npm view <package> version`
- ✅ Can verify OIDC configuration by attempting OIDC publish

**Sources:**
- [npm Trusted Publishers Documentation](https://docs.npmjs.com/trusted-publishers/)
- [GitHub Community Discussion](https://github.com/orgs/community/discussions/127011)
- [setup-npm-trusted-publish tool](https://github.com/azu/setup-npm-trusted-publish)

## Implementation Plan

### Phase 1: Modify Release Workflow

**File:** `.github/workflows/release.yml`

**Changes:**

1. **Add package detection step** (before Changesets action):
```yaml
- name: Detect packages and check npm registry
  id: check-packages
  run: |
    echo "Checking which packages will be published..."

    # Get list of packages that will be published
    CHANGESET_STATUS=$(pnpm changeset status --output=json 2>/dev/null || echo '{"releases":[]}')

    # Extract package names
    PACKAGES=$(echo "$CHANGESET_STATUS" | jq -r '.releases[]?.name // empty')

    if [ -z "$PACKAGES" ]; then
      echo "No packages to publish"
      echo "needs_publish=false" >> $GITHUB_OUTPUT
      exit 0
    fi

    echo "needs_publish=true" >> $GITHUB_OUTPUT

    # Check each package on npm
    NEW_PACKAGES=""
    for PKG in $PACKAGES; do
      echo "Checking $PKG..."
      if npm view "$PKG" version &>/dev/null; then
        echo "  ✓ $PKG exists on npm (will use OIDC if configured)"
      else
        echo "  ⚠ $PKG is NEW (will use NPM_TOKEN for first publish)"
        NEW_PACKAGES="$NEW_PACKAGES $PKG"
      fi
    done

    if [ -n "$NEW_PACKAGES" ]; then
      echo "new_packages=$NEW_PACKAGES" >> $GITHUB_OUTPUT
      echo "has_new_packages=true" >> $GITHUB_OUTPUT
    else
      echo "has_new_packages=false" >> $GITHUB_OUTPUT
    fi
```

2. **Conditionally add NPM_TOKEN to publish step:**
```yaml
- name: Publish to npm
  if: steps.check-packages.outputs.needs_publish == 'true'
  uses: changesets/action@v1
  with:
    publish: pnpm release
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    # Add NPM_TOKEN as fallback for new packages or when OIDC not configured
    # npm CLI will try OIDC first, then fall back to NPM_TOKEN if needed
    NPM_TOKEN: ${{ secrets.NPM_PUBLISH_TOKEN }}
```

3. **Add post-publish notification** (for new packages):
```yaml
- name: Notify about OIDC setup
  if: steps.check-packages.outputs.has_new_packages == 'true'
  run: |
    echo "📦 New packages published! Configure OIDC trusted publishing:"
    echo ""
    for PKG in ${{ steps.check-packages.outputs.new_packages }}; do
      echo "  $PKG"
      echo "  → https://www.npmjs.com/package/$PKG/settings"
    done
    echo ""
    echo "See docs/NPM_TRUSTED_PUBLISHING_SETUP.md for instructions"
```

**Benefits:**
- ✅ Fully automated - no manual first publish required
- ✅ Self-bootstrapping - works for new packages
- ✅ Secure by default - OIDC preferred, token is fallback
- ✅ Clear feedback - logs show which auth method used

### Phase 2: Update Documentation

**File:** `docs/NPM_TRUSTED_PUBLISHING_SETUP.md`

**Changes:**

1. **Add "How It Works" section** explaining self-bootstrapping:
```markdown
## How the Self-Bootstrapping Workflow Works

The release workflow automatically handles both new and existing packages:

### For New Packages (First Publish)
1. Workflow detects package doesn't exist on npm
2. Uses NPM_TOKEN for initial publish
3. Logs notification with npm settings URL
4. **Action Required:** Configure OIDC trusted publisher on npmjs.com

### For Existing Packages
1. Workflow detects package exists
2. npm CLI tries OIDC first (if configured)
3. Falls back to NPM_TOKEN if OIDC not configured
4. **Recommended:** Configure OIDC to remove token dependency

### After OIDC Configuration
1. All publishes use OIDC automatically
2. No token needed
3. Provenance automatically generated
4. Enhanced supply chain security
```

2. **Update "Setup Instructions"** to reflect automatic behavior:
```markdown
## Setup Instructions

### Step 1: Publish Package (Automatic)

**No manual action needed!** The workflow automatically handles first publish:

```bash
# On your feature branch, create a changeset:
pnpm changeset

# Commit and merge to main
# → CI creates "Version Packages" PR
# → Merge PR
# → Release workflow automatically publishes (using NPM_TOKEN for new packages)
```

### Step 2: Configure OIDC (One-time per package)

After first publish, configure trusted publisher on npmjs.com...
```

3. **Add troubleshooting section:**
```markdown
## Troubleshooting

### "Package published but using NPM_TOKEN instead of OIDC"

This means OIDC trusted publisher is not configured yet.

**Solution:**
1. Check workflow logs for npm settings URL
2. Configure trusted publisher on npmjs.com
3. Next publish will use OIDC automatically
```

### Phase 3: Enhance Verification Script

**File:** `scripts/verify-npm-trusted-publishing.sh`

**Changes:**

1. **Add package state detection:**
```bash
# Check if package exists on npm
if npm view "$PKG_NAME" &> /dev/null; then
    echo -e "  ${GREEN}✓ Package exists on npm${NC}"

    # Try to detect if OIDC is configured
    # Note: Can't directly check OIDC config, but can infer from package metadata
    echo -e "  ${YELLOW}⚙ Verify OIDC is configured at:${NC}"
    echo -e "     https://www.npmjs.com/package/$PKG_NAME/settings"

    # Check if package has provenance (indicates OIDC was used)
    if npm view "$PKG_NAME" --json 2>/dev/null | jq -e '.provenance' &>/dev/null; then
        echo -e "  ${GREEN}✓ Package has provenance (likely using OIDC)${NC}"
    else
        echo -e "  ${YELLOW}⚠ No provenance detected - configure OIDC for next publish${NC}"
    fi
else
    echo -e "  ${YELLOW}⚠ Package not on npm yet${NC}"
    echo -e "     Will use NPM_TOKEN for first publish automatically"
    echo -e "     Configure OIDC after first publish at:"
    echo -e "     https://www.npmjs.com/package/$PKG_NAME/settings"
fi
```

2. **Add NPM_TOKEN check:**
```bash
echo ""
echo "=== NPM_TOKEN Secret ==="
echo ""

echo -e "${YELLOW}⚠ Verify NPM_PUBLISH_TOKEN secret exists in GitHub:${NC}"
echo "   https://github.com/OWNER/REPO/settings/secrets/actions"
echo ""
echo "This token is used as fallback for:"
echo "  • First publish of new packages"
echo "  • Packages without OIDC configured yet"
echo ""
echo "Once all packages have OIDC configured, this secret can be removed."
```

## Workflow Scenarios

### Scenario 1: Publishing New Package for First Time

**Context:** Package `@hitoshura25/new-mcp-server` has never been published

**Workflow Behavior:**
1. CI runs on main after Version PR merged
2. Detects `@hitoshura25/new-mcp-server` in changeset
3. Checks npm: `npm view @hitoshura25/new-mcp-server version` → 404
4. Logs: `⚠ @hitoshura25/new-mcp-server is NEW (will use NPM_TOKEN for first publish)`
5. Changesets publishes package using NPM_TOKEN
6. Logs post-publish notification with npm settings URL
7. **Manual action:** Maintainer configures OIDC on npmjs.com

### Scenario 2: Publishing Existing Package (OIDC Not Configured)

**Context:** Package exists but OIDC trusted publisher not configured

**Workflow Behavior:**
1. CI runs on main after Version PR merged
2. Detects package in changeset
3. Checks npm: `npm view @hitoshura25/mcp-android version` → 1.0.0
4. Logs: `✓ @hitoshura25/mcp-android exists on npm (will use OIDC if configured)`
5. npm CLI tries OIDC → fails (not configured)
6. npm CLI falls back to NPM_TOKEN → succeeds
7. Logs warning: OIDC not configured
8. **Manual action:** Maintainer should configure OIDC

### Scenario 3: Publishing Existing Package (OIDC Configured)

**Context:** Package exists and OIDC trusted publisher configured

**Workflow Behavior:**
1. CI runs on main after Version PR merged
2. Detects package in changeset
3. Checks npm: `npm view @hitoshura25/mcp-android version` → 1.0.1
4. Logs: `✓ @hitoshura25/mcp-android exists on npm (will use OIDC if configured)`
5. npm CLI uses OIDC → succeeds
6. Package published with provenance
7. No fallback needed
8. ✅ Secure, automated publishing

## Security Considerations

### Token Management

**NPM_PUBLISH_TOKEN Secret:**
- Required for bootstrapping new packages
- Used as fallback when OIDC unavailable
- Can be removed once all packages use OIDC
- Should be scoped as "Automation" token
- Should have publish-only permissions

**OIDC (Preferred):**
- No long-lived credentials
- Workflow-specific tokens
- Automatic provenance
- Enhanced supply chain security

### Audit Trail

All token usage is logged in workflow runs:
- When NPM_TOKEN is used (and why)
- When OIDC is used
- Which packages used which method

## Testing Plan

### Test Case 1: New Package First Publish

**Setup:**
1. Create new package in `packages/test-new-mcp/`
2. Add changeset for initial version
3. Ensure package doesn't exist on npm

**Expected Behavior:**
- Workflow detects package is new
- Uses NPM_TOKEN for publish
- Package successfully published
- Post-publish notification logged
- Manual OIDC configuration needed

**Verification:**
```bash
npm view @hitoshura25/test-new-mcp
# Should show version, no provenance yet
```

### Test Case 2: Existing Package with OIDC

**Setup:**
1. Package exists on npm
2. OIDC trusted publisher configured
3. Add changeset for version bump

**Expected Behavior:**
- Workflow detects package exists
- Uses OIDC for publish
- Package published with provenance
- No NPM_TOKEN used

**Verification:**
```bash
npm view @hitoshura25/mcp-android --json | jq .provenance
# Should show provenance object
```

### Test Case 3: Multiple Packages (Mixed State)

**Setup:**
1. Monorepo with 3 packages:
   - `pkg-a`: new (doesn't exist)
   - `pkg-b`: exists, OIDC not configured
   - `pkg-c`: exists, OIDC configured
2. Add changesets for all three

**Expected Behavior:**
- `pkg-a`: Uses NPM_TOKEN, logs notification
- `pkg-b`: Uses NPM_TOKEN (fallback), logs warning
- `pkg-c`: Uses OIDC, successful
- All packages published successfully

## Implementation Checklist

- [ ] Phase 1: Modify `.github/workflows/release.yml`
  - [ ] Add package detection step
  - [ ] Add NPM_TOKEN to publish environment
  - [ ] Add post-publish notification
  - [ ] Test with dry-run changeset

- [ ] Phase 2: Update documentation
  - [ ] Add "How It Works" section
  - [ ] Update setup instructions
  - [ ] Add troubleshooting guide
  - [ ] Update examples

- [ ] Phase 3: Enhance verification script
  - [ ] Add package state detection
  - [ ] Add provenance checking
  - [ ] Add NPM_TOKEN verification
  - [ ] Test script locally

- [ ] Testing
  - [ ] Test new package scenario (if possible)
  - [ ] Test existing package with OIDC
  - [ ] Verify logging output
  - [ ] Verify documentation accuracy

## Dependencies

### Required Secrets

- `GITHUB_TOKEN` - Provided automatically by GitHub Actions
- `NPM_PUBLISH_TOKEN` - Must be configured as repository secret
  - Type: Automation token
  - Permissions: Publish packages
  - Scope: Read and write to the npm registry

### Required Permissions

Workflow must have:
- `id-token: write` - For OIDC token generation
- `contents: read` - For repository access

### Required Tools

- `jq` - JSON parsing (already used in verification script)
- `pnpm changeset` - Package versioning and publishing
- `npm` CLI v11.5+ - OIDC support (GitHub Actions runners have this)

## Migration Path

### Current State
- Workflows configured for OIDC
- No packages published yet
- NPM_TOKEN not configured

### Migration Steps

1. **Add NPM_TOKEN secret:**
   ```
   GitHub → Repository Settings → Secrets → Actions
   Add: NPM_PUBLISH_TOKEN
   ```

2. **Merge this implementation**
   - No breaking changes
   - Backwards compatible
   - Works for both new and existing packages

3. **First publish:**
   - Workflow will use NPM_TOKEN (packages don't exist)
   - Workflow logs npm settings URLs

4. **Configure OIDC** (per package):
   - Visit npm settings URL from logs
   - Add GitHub Actions trusted publisher
   - Fill in: `hitoshura25/devtools-mcp`, workflow `release.yml`

5. **Verify OIDC working:**
   - Next publish should use OIDC
   - Check for provenance in package metadata
   - Run verification script

6. **Cleanup** (optional):
   - Once all packages use OIDC
   - Remove NPM_PUBLISH_TOKEN secret
   - Update workflow to remove NPM_TOKEN env var

## Future Enhancements

1. **Automated OIDC Verification**
   - Add workflow step that checks if OIDC is configured
   - Could use dry-run publish attempt
   - Report OIDC status in PR comments

2. **Package Provenance Dashboard**
   - Script to check all packages
   - Report which have provenance
   - Show OIDC configuration status

3. **Slack/Discord Notifications**
   - Notify when new package published
   - Remind to configure OIDC
   - Celebrate when OIDC successfully used

## References

- [NPM Trusted Publishers Documentation](https://docs.npmjs.com/trusted-publishers/)
- [GitHub OIDC Documentation](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect)
- [Changesets Documentation](https://github.com/changesets/changesets)
- [npm CLI Documentation](https://docs.npmjs.com/cli/)
