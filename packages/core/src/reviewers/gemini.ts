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
        // Local CLI found, verify it works
        try {
          await execAsync('echo "test" | gemini', { timeout: 10000 });
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
    // Escape the spec content for shell
    const escapedSpec = spec
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\$/g, '\\$')
      .replace(/`/g, '\\`')
      .replace(/\n/g, '\\n');

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
${escapedSpec}`;

    if (this.useDocker) {
      // Docker-based command
      const escapedPrompt = prompt.replace(/"/g, '\\"').replace(/\$/g, '\\$');
      return `docker run --rm \\
  -e GOOGLE_API_KEY="$GOOGLE_API_KEY" \\
  ${GEMINI_DOCKER_IMAGE} \\
  -p "${escapedPrompt}" \\
  --output-format json`;
    } else {
      // Local CLI command
      return `echo "${prompt}" | gemini`;
    }
  }

  parseReviewOutput(output: string): ReviewResult {
    try {
      const jsonMatch = output.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return {
          reviewer: 'gemini',
          timestamp: new Date().toISOString(),
          feedback: output,
          suggestions: [],
          concerns: [],
          approved: false,
        };
      }

      const parsed = JSON.parse(jsonMatch[0]);
      return {
        reviewer: 'gemini',
        timestamp: new Date().toISOString(),
        feedback: parsed.feedback || output,
        suggestions: parsed.suggestions || [],
        concerns: parsed.concerns || [],
        approved: parsed.approved ?? false,
      };
    } catch {
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
