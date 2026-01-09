/**
 * Ollama reviewer adapter (OLMo model)
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import type { ReviewerAdapter, ReviewerAvailability, ReviewContext, ReviewResult } from './types.js';

const execAsync = promisify(exec);

const OLLAMA_BASE_URL = 'http://localhost:11434';
const OLMO_MODEL = 'olmo-3.1:32b-think';

export class OllamaReviewer implements ReviewerAdapter {
  name = 'olmo' as const;

  private baseUrl: string;
  private model: string;

  constructor(options?: { baseUrl?: string; model?: string }) {
    this.baseUrl = options?.baseUrl ?? OLLAMA_BASE_URL;
    this.model = options?.model ?? OLMO_MODEL;
  }

  async checkAvailability(): Promise<ReviewerAvailability> {
    // Check if Ollama is running
    try {
      const { stdout } = await execAsync(
        `curl -s -o /dev/null -w "%{http_code}" ${this.baseUrl}/api/tags`,
        { timeout: 5000 }
      );

      if (stdout.trim() !== '200') {
        return {
          available: false,
          reason: 'Ollama is not running',
          installInstructions:
            'Install Ollama: https://ollama.ai/download\n' + 'Then run: ollama serve',
        };
      }
    } catch {
      return {
        available: false,
        reason: 'Ollama is not running',
        installInstructions:
          'Install Ollama: https://ollama.ai/download\n' + 'Then run: ollama serve',
      };
    }

    // Check if OLMo model is available
    try {
      const { stdout } = await execAsync(`curl -s ${this.baseUrl}/api/tags`, { timeout: 5000 });

      const tags = JSON.parse(stdout);
      const hasOlmo = tags.models?.some(
        (m: { name: string }) => m.name.includes('olmo') || m.name.includes(this.model)
      );

      if (!hasOlmo) {
        return {
          available: false,
          reason: `OLMo model not found`,
          installInstructions: `Run: ollama pull ${this.model}`,
        };
      }
    } catch {
      // Couldn't parse, but service is up - try anyway
    }

    return { available: true };
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

    // Use heredoc to avoid shell escaping issues with backticks and special characters
    // JSON.stringify handles proper JSON escaping of the prompt content
    const jsonPayload = JSON.stringify({
      model: this.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
    });

    // Use heredoc with curl -d @- to read JSON from stdin
    return `curl -s ${this.baseUrl}/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -d @- <<'OLLAMA_JSON_EOF'
${jsonPayload}
OLLAMA_JSON_EOF`;
  }

  parseReviewOutput(output: string): ReviewResult {
    try {
      const response = JSON.parse(output);
      const content = response.choices?.[0]?.message?.content || output;

      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          reviewer: 'olmo',
          timestamp: new Date().toISOString(),
          feedback: parsed.feedback || content,
          suggestions: parsed.suggestions || [],
          concerns: parsed.concerns || [],
          approved: parsed.approved ?? false,
        };
      }

      return {
        reviewer: 'olmo',
        timestamp: new Date().toISOString(),
        feedback: content,
        suggestions: [],
        concerns: [],
        approved: false,
      };
    } catch {
      return {
        reviewer: 'olmo',
        timestamp: new Date().toISOString(),
        feedback: output,
        suggestions: [],
        concerns: [],
        approved: false,
      };
    }
  }
}
