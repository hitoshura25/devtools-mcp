#!/bin/bash
set -e

# Verify NPM Trusted Publishing Setup
# This script checks that all packages are ready for trusted publishing

echo "=== NPM Trusted Publishing Setup Verification ==="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    echo -e "${RED}✗ jq is not installed${NC}"
    echo "  Install: brew install jq (macOS) or apt-get install jq (Linux)"
    exit 1
fi

echo -e "${GREEN}✓ jq is installed${NC}"

# Check npm CLI version
NPM_VERSION=$(npm --version)
REQUIRED_VERSION="11.5.0"

if [ "$(printf '%s\n' "$REQUIRED_VERSION" "$NPM_VERSION" | sort -V | head -n1)" = "$REQUIRED_VERSION" ]; then
    echo -e "${GREEN}✓ npm version $NPM_VERSION (>= $REQUIRED_VERSION)${NC}"
else
    echo -e "${RED}✗ npm version $NPM_VERSION is too old (need >= $REQUIRED_VERSION)${NC}"
    echo "  Upgrade: npm install -g npm@latest"
    exit 1
fi

echo ""
echo "Checking package configurations..."
echo ""

# Find all package.json files in packages/*/
PACKAGES_DIR="packages"
HAS_ERROR=0

for PKG_DIR in "$PACKAGES_DIR"/*; do
    if [ -f "$PKG_DIR/package.json" ]; then
        PKG_JSON="$PKG_DIR/package.json"
        PKG_NAME=$(jq -r '.name' "$PKG_JSON")

        # Skip if package is private
        IS_PRIVATE=$(jq -r '.private // false' "$PKG_JSON")
        if [ "$IS_PRIVATE" = "true" ]; then
            echo -e "${YELLOW}⊘ $PKG_NAME (private - skipped)${NC}"
            continue
        fi

        echo "Checking: $PKG_NAME"

        # Check repository field
        REPO=$(jq -r '.repository.url // empty' "$PKG_JSON")
        if [ -z "$REPO" ]; then
            echo -e "  ${RED}✗ Missing repository field${NC}"
            HAS_ERROR=1
        else
            echo -e "  ${GREEN}✓ Repository: $REPO${NC}"
        fi

        # Check publishConfig.access
        ACCESS=$(jq -r '.publishConfig.access // empty' "$PKG_JSON")
        if [ "$ACCESS" != "public" ]; then
            echo -e "  ${RED}✗ publishConfig.access not set to 'public'${NC}"
            HAS_ERROR=1
        else
            echo -e "  ${GREEN}✓ Public access configured${NC}"
        fi

        # Check if package exists on npm
        if npm view "$PKG_NAME" &> /dev/null; then
            echo -e "  ${GREEN}✓ Package exists on npm${NC}"

            # Check if package has provenance (indicates OIDC was used)
            if npm view "$PKG_NAME" --json 2>/dev/null | jq -e '.provenance' &>/dev/null; then
                echo -e "  ${GREEN}✓ Package has provenance (OIDC configured and working!)${NC}"
            else
                echo -e "  ${YELLOW}⚠ No provenance detected${NC}"
                echo -e "     This means OIDC is not configured yet"
            fi

            # Generate npm settings URL
            NPM_URL="https://www.npmjs.com/package/$PKG_NAME/settings"
            echo -e "  ${YELLOW}⚙ Configure/verify trusted publisher at:${NC}"
            echo -e "     $NPM_URL"
        else
            echo -e "  ${YELLOW}⚠ Package not on npm yet${NC}"
            echo -e "     Will use NPM_TOKEN for first publish automatically"
            echo -e "     After first publish, configure OIDC at:"
            echo -e "     https://www.npmjs.com/package/$PKG_NAME/settings"
        fi

        echo ""
    fi
done

echo ""
echo "=== Workflow Configuration ==="
echo ""

# Check if release.yml has OIDC permissions
WORKFLOW_FILE=".github/workflows/release.yml"
if [ -f "$WORKFLOW_FILE" ]; then
    if grep -q "id-token: write" "$WORKFLOW_FILE"; then
        echo -e "${GREEN}✓ release.yml has id-token: write permission${NC}"
    else
        echo -e "${RED}✗ release.yml missing id-token: write permission${NC}"
        HAS_ERROR=1
    fi

    if grep -q "NPM_TOKEN:" "$WORKFLOW_FILE"; then
        # Check if it's documented as fallback
        if grep -q "NPM_TOKEN provides fallback" "$WORKFLOW_FILE"; then
            echo -e "${GREEN}✓ release.yml configured with NPM_TOKEN fallback${NC}"
        else
            echo -e "${YELLOW}⚠ release.yml references NPM_TOKEN${NC}"
            echo "  This is expected for self-bootstrapping workflow"
        fi
    else
        echo -e "${GREEN}✓ release.yml not using NPM_TOKEN (OIDC only)${NC}"
    fi
else
    echo -e "${RED}✗ $WORKFLOW_FILE not found${NC}"
    HAS_ERROR=1
fi

echo ""
echo "=== NPM_PUBLISH_TOKEN Secret ==="
echo ""

echo -e "${YELLOW}⚠ Verify NPM_PUBLISH_TOKEN secret exists in GitHub:${NC}"
echo "   https://github.com/hitoshura25/devtools-mcp/settings/secrets/actions"
echo ""
echo "This token is used as fallback for:"
echo "  • First publish of new packages"
echo "  • Packages without OIDC configured yet"
echo ""
echo "Once all packages have OIDC configured, this secret can be removed."
echo ""

echo ""
echo "=== Summary ==="
echo ""

if [ $HAS_ERROR -eq 0 ]; then
    echo -e "${GREEN}✓ All checks passed!${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Ensure NPM_PUBLISH_TOKEN secret is configured in GitHub"
    echo "2. Publish packages (automatic via workflow)"
    echo "3. For each package, configure trusted publisher on npmjs.com"
    echo "4. See docs/NPM_TRUSTED_PUBLISHING_SETUP.md for detailed instructions"
    exit 0
else
    echo -e "${RED}✗ Some checks failed${NC}"
    echo ""
    echo "Fix the issues above before configuring trusted publishing"
    exit 1
fi
