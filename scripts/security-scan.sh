#!/bin/bash
set -e

# Run CodeQL Security Scanning Locally
# This script runs the same security analysis that GitHub runs on PRs

echo "=== CodeQL Security Scan ==="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DB_PATH="codeql-db"
OUTPUT_FILE="codeql-results.sarif"
QUERY_PACK="codeql/javascript-queries"

# Check if codeql is installed
if ! command -v codeql &> /dev/null; then
    echo -e "${RED}CodeQL CLI not found${NC}"
    echo ""
    echo "Installation instructions:"
    echo "1. Download the CodeQL bundle from:"
    echo "   https://github.com/github/codeql-action/releases"
    echo ""
    echo "2. Extract and add to PATH:"
    echo "   tar -xzf codeql-bundle-*.tar.gz"
    echo "   export PATH=\"\$PATH:\$(pwd)/codeql\""
    echo ""
    echo "3. Or install via Homebrew (macOS):"
    echo "   brew install codeql"
    echo ""
    echo "For detailed instructions, see:"
    echo "https://docs.github.com/en/code-security/codeql-cli/getting-started-with-the-codeql-cli/setting-up-the-codeql-cli"
    exit 1
fi

CODEQL_VERSION=$(codeql --version 2>&1 | head -n1)
echo -e "${GREEN}CodeQL CLI found: $CODEQL_VERSION${NC}"
echo ""

# Check if jq is available for result parsing
HAS_JQ=0
if command -v jq &> /dev/null; then
    HAS_JQ=1
fi

# Step 0: Ensure query pack is available
echo -e "${BLUE}Step 0: Checking query pack...${NC}"
if ! codeql pack ls "$QUERY_PACK" &> /dev/null; then
    echo "Downloading $QUERY_PACK..."
    codeql pack download "$QUERY_PACK" 2>&1 | while read -r line; do
        echo "  $line"
    done
else
    echo "Query pack already installed"
fi
echo ""

# Step 1: Create/update CodeQL database
echo -e "${BLUE}Step 1: Creating CodeQL database...${NC}"
echo "Language: javascript-typescript"
echo "Source: ."
echo ""

codeql database create "$DB_PATH" \
    --language=javascript-typescript \
    --source-root . \
    --overwrite \
    2>&1 | while read -r line; do
        # Show progress without overwhelming output
        if echo "$line" | grep -q "Initializing\|Extracting\|Finalizing\|Successfully"; then
            echo "  $line"
        fi
    done

echo ""
echo -e "${GREEN}Database created at: $DB_PATH${NC}"
echo ""

# Step 2: Run security analysis
echo -e "${BLUE}Step 2: Running security analysis...${NC}"
echo "Query pack: $QUERY_PACK"
echo ""

# Run analysis (output directly to show progress)
codeql database analyze "$DB_PATH" \
    "$QUERY_PACK" \
    --format=sarif-latest \
    --output="$OUTPUT_FILE" \
    --threads=0 \
    2>&1 | grep -E "Running|Evaluating|Shutting|queries|results" || true

echo ""
echo -e "${GREEN}Results saved to: $OUTPUT_FILE${NC}"
echo ""

# Step 3: Parse and display results
echo -e "${BLUE}Step 3: Analyzing results...${NC}"
echo ""

if [ ! -f "$OUTPUT_FILE" ]; then
    echo -e "${RED}Results file not found: $OUTPUT_FILE${NC}"
    exit 1
fi

if [ $HAS_JQ -eq 1 ]; then
    # Count total findings
    TOTAL_FINDINGS=$(jq '[.runs[].results[]] | length' "$OUTPUT_FILE")

    if [ "$TOTAL_FINDINGS" -eq 0 ]; then
        echo -e "${GREEN}No security issues found!${NC}"
        echo ""
        echo "Your code passed all CodeQL security checks."
    else
        echo -e "${YELLOW}Found $TOTAL_FINDINGS issue(s):${NC}"
        echo ""

        # Group by severity/level
        echo "=== Findings by Severity ==="
        jq -r '.runs[].results[] | "\(.level // "warning")"' "$OUTPUT_FILE" | sort | uniq -c | while read -r count level; do
            case "$level" in
                error)
                    echo -e "  ${RED}$level: $count${NC}"
                    ;;
                warning)
                    echo -e "  ${YELLOW}$level: $count${NC}"
                    ;;
                *)
                    echo -e "  $level: $count"
                    ;;
            esac
        done
        echo ""

        # Show detailed findings
        echo "=== Detailed Findings ==="
        echo ""

        jq -r '.runs[].results[] |
            "[\(.level // "warning" | ascii_upcase)] \(.ruleId)\n" +
            "  Message: \(.message.text)\n" +
            "  Location: \(.locations[0].physicalLocation.artifactLocation.uri):\(.locations[0].physicalLocation.region.startLine // "?")\n"
        ' "$OUTPUT_FILE"

        echo ""
        echo -e "${YELLOW}Review the findings above and fix any security issues.${NC}"
        echo "For more details, inspect the SARIF file: $OUTPUT_FILE"

        # Exit with non-zero to indicate findings
        exit 1
    fi
else
    # Without jq, just show basic info
    echo -e "${YELLOW}Note: Install jq for detailed result parsing${NC}"
    echo "  brew install jq (macOS)"
    echo "  apt-get install jq (Linux)"
    echo ""
    echo "Results saved to: $OUTPUT_FILE"
    echo "Open this SARIF file in VS Code with the SARIF Viewer extension,"
    echo "or upload to GitHub for visualization."
fi

echo ""
echo "=== Done ==="
