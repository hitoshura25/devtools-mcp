/**
 * Ollama backend adapter
 * Runs LLM models locally via Ollama service
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import type {
  ReviewerAdapter,
  ReviewerAvailability,
  ReviewContext,
  ReviewResult,
  ReviewerName,
  OllamaBackendConfig,
} from './types.js';

const execAsync = promisify(exec);

const DEFAULT_BASE_URL = 'http://localhost:11434';
const DEFAULT_MODEL = 'olmo-3.1:32b-think';

export class OllamaAdapter implements ReviewerAdapter {
  readonly name: ReviewerName;
  readonly backendType = 'ollama' as const;
  readonly model: string;

  private baseUrl: string;

  constructor(reviewerName: ReviewerName, config: OllamaBackendConfig) {
    this.name = reviewerName;
    this.model = config.model ?? DEFAULT_MODEL;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
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
          reason: `Ollama is not running at ${this.baseUrl}`,
          installInstructions:
            'Install Ollama: https://ollama.ai/download\n' + 'Then run: ollama serve',
        };
      }
    } catch {
      return {
        available: false,
        reason: `Ollama is not running at ${this.baseUrl}`,
        installInstructions:
          'Install Ollama: https://ollama.ai/download\n' + 'Then run: ollama serve',
      };
    }

    // Check if the configured model is available
    try {
      const { stdout } = await execAsync(`curl -s ${this.baseUrl}/api/tags`, { timeout: 5000 });

      const tags = JSON.parse(stdout);
      const modelName = this.model.split(':')[0]; // Get base model name
      const hasModel = tags.models?.some(
        (m: { name: string }) => m.name.includes(modelName) || m.name === this.model
      );

      if (!hasModel) {
        return {
          available: false,
          reason: `Model '${this.model}' not found in Ollama`,
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
    const baseResult = {
      reviewer: this.name,
      backendType: this.backendType,
      model: this.model,
      timestamp: new Date().toISOString(),
    };

    try {
      const response = JSON.parse(output);
      const content = response.choices?.[0]?.message?.content || output;

      // Use non-greedy match and limit input length to prevent ReDoS
      const truncatedContent = content.length > 100000 ? content.slice(0, 100000) : content;
      const jsonMatch = truncatedContent.match(/\{[\s\S]*?\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          ...baseResult,
          feedback: parsed.feedback || content,
          suggestions: parsed.suggestions || [],
          concerns: parsed.concerns || [],
          approved: parsed.approved ?? false,
        };
      }

      return {
        ...baseResult,
        feedback: content,
        suggestions: [],
        concerns: [],
        approved: false,
      };
    } catch {
      return {
        ...baseResult,
        feedback: output,
        suggestions: [],
        concerns: [],
        approved: false,
      };
    }
  }
}

// Backward compatibility alias
export const OllamaReviewer = OllamaAdapter;
