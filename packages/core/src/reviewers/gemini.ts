/**
 * Gemini CLI reviewer adapter
 * Supports both local CLI and Docker-based Gemini CLI
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import type { ReviewerAdapter, ReviewerAvailability, ReviewContext, ReviewResult } from './types.js';

const execAsync = promisify(exec);

const GEMINI_DOCKER_IMAGE = 'us-docker.pkg.dev/gemini-code-dev/gemini-cli/sandbox:0.1.1';

export class GeminiReviewer implements ReviewerAdapter {
  name = 'gemini' as const;
  private useDocker = false;

  async checkAvailability(): Promise<ReviewerAvailability> {
    // Check for local CLI first
    try {
      const { stdout } = await execAsync('which gemini', { timeout: 5000 });
      if (stdout.trim()) {
        // Local CLI found, verify it works with a simple test
        try {
          await execAsync('gemini "test" --model gemini-2.5-flash-lite', { timeout: 15000 });
          this.useDocker = false;
          return { available: true };
        } catch {
          // Local CLI exists but not working, try Docker
        }
      }
    } catch {
      // Local CLI not found, try Docker
    }

    // Check Docker is running
    try {
      await execAsync('docker info', { timeout: 10000 });
    } catch {
      return {
        available: false,
        reason: 'Neither local Gemini CLI nor Docker is available',
        installInstructions:
          'Install Gemini CLI: npm install -g @google/generative-ai-cli\n' +
          'Or start Docker Desktop and run: docker pull ' +
          GEMINI_DOCKER_IMAGE,
      };
    }

    // Check Docker image exists or can be pulled
    try {
      await execAsync(`docker image inspect ${GEMINI_DOCKER_IMAGE}`, { timeout: 10000 });
      this.useDocker = true;
      return { available: true };
    } catch {
      // Try to pull
      try {
        await execAsync(`docker pull ${GEMINI_DOCKER_IMAGE}`, { timeout: 120000 });
        this.useDocker = true;
        return { available: true };
      } catch {
        return {
          available: false,
          reason: 'Cannot pull Gemini CLI Docker image',
          installInstructions: `Run: docker pull ${GEMINI_DOCKER_IMAGE}`,
        };
      }
    }
  }

  getReviewCommand(spec: string, _context: ReviewContext): string {
    const prompt = `You are reviewing an implementation specification. Analyze it for:
1. Completeness - Are all requirements clearly defined?
2. Feasibility - Is this technically achievable?
3. Edge cases - What scenarios might be missed?
4. Security - Any security concerns?
5. Testing - What tests should be written?

Respond in JSON format:
{
  "approved": boolean,
  "feedback": "overall assessment",
  "suggestions": ["suggestion 1", "suggestion 2"],
  "concerns": ["concern 1", "concern 2"],
  "recommended_tests": ["test case 1", "test case 2"]
}

SPECIFICATION:
${spec}`;

    if (this.useDocker) {
      // Docker-based command with heredoc to avoid escaping issues
      return `docker run --rm -i \\
  -e GOOGLE_API_KEY="$GOOGLE_API_KEY" \\
  ${GEMINI_DOCKER_IMAGE} \\
  --model gemini-2.5-flash-lite \\
  -o json 2>/dev/null <<'GEMINI_PROMPT_EOF'
${prompt}
GEMINI_PROMPT_EOF`;
    } else {
      // Local CLI command with heredoc to avoid escaping issues
      // Redirect stderr to suppress non-fatal extension warnings
      return `gemini --model gemini-2.5-flash-lite -o json 2>/dev/null <<'GEMINI_PROMPT_EOF'
${prompt}
GEMINI_PROMPT_EOF`;
    }
  }

  parseReviewOutput(output: string): ReviewResult {
    try {
      // First, parse the Gemini CLI JSON wrapper
      const cliOutput = JSON.parse(output);
      const responseText = cliOutput.response || output;

      // Try to parse the response as JSON (our review format)
      try {
        const reviewData = JSON.parse(responseText);
        return {
          reviewer: 'gemini',
          timestamp: new Date().toISOString(),
          feedback: reviewData.feedback || responseText,
          suggestions: reviewData.suggestions || [],
          concerns: reviewData.concerns || [],
          approved: reviewData.approved ?? false,
        };
      } catch {
        // Response is not JSON, try to find JSON within the text
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const reviewData = JSON.parse(jsonMatch[0]);
          return {
            reviewer: 'gemini',
            timestamp: new Date().toISOString(),
            feedback: reviewData.feedback || responseText,
            suggestions: reviewData.suggestions || [],
            concerns: reviewData.concerns || [],
            approved: reviewData.approved ?? false,
          };
        }

        // No JSON found, use text as feedback
        return {
          reviewer: 'gemini',
          timestamp: new Date().toISOString(),
          feedback: responseText,
          suggestions: [],
          concerns: [],
          approved: false,
        };
      }
    } catch {
      // Failed to parse CLI output, treat as plain text
      return {
        reviewer: 'gemini',
        timestamp: new Date().toISOString(),
        feedback: output,
        suggestions: [],
        concerns: [],
        approved: false,
      };
    }
  }
}
