/**
 * OpenRouter backend adapter
 * Provides access to various LLM models via OpenRouter API
 */

import type {
  ReviewerAdapter,
  ReviewerAvailability,
  ReviewContext,
  ReviewResult,
  ReviewerName,
  OpenRouterBackendConfig,
} from './types.js';

const DEFAULT_ENDPOINT = 'https://openrouter.ai/api/v1';
const DEFAULT_MODEL = 'allenai/olmo-3.1-32b-think';
const DEFAULT_TEMPERATURE = 0.3;

export class OpenRouterAdapter implements ReviewerAdapter {
  readonly name: ReviewerName;
  readonly backendType = 'openrouter' as const;
  readonly model: string;

  private endpoint: string;
  private temperature: number;

  constructor(reviewerName: ReviewerName, config: OpenRouterBackendConfig) {
    this.name = reviewerName;
    this.model = config.model ?? DEFAULT_MODEL;
    this.endpoint = config.endpoint ?? DEFAULT_ENDPOINT;
    this.temperature = config.temperature ?? DEFAULT_TEMPERATURE;
  }

  async checkAvailability(): Promise<ReviewerAvailability> {
    // Check if OPENROUTER_API_KEY exists
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      return {
        available: false,
        reason: 'OPENROUTER_API_KEY environment variable not found',
        installInstructions:
          'Get an API key from https://openrouter.ai/keys\n' +
          'Then set: export OPENROUTER_API_KEY=your_key_here',
      };
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

    const payload = {
      model: this.model,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: this.temperature,
    };

    // Use heredoc to avoid escaping issues
    return `curl -X POST ${this.endpoint}/chat/completions \\
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d @- <<'OPENROUTER_JSON_EOF'
${JSON.stringify(payload, null, 2)}
OPENROUTER_JSON_EOF`;
  }

  parseReviewOutput(output: string): ReviewResult {
    const baseResult = {
      reviewer: this.name,
      backendType: this.backendType,
      model: this.model,
      timestamp: new Date().toISOString(),
    };

    try {
      // Parse OpenAI-compatible response
      const response = JSON.parse(output);
      const content = response.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error('No content in response');
      }

      // Try to parse the content as JSON (our review format)
      try {
        const reviewData = JSON.parse(content);
        return {
          ...baseResult,
          feedback: reviewData.feedback || content,
          suggestions: reviewData.suggestions || [],
          concerns: reviewData.concerns || [],
          approved: reviewData.approved ?? false,
        };
      } catch {
        // Response is not JSON, try to find JSON within the text
        // Use non-greedy match and limit input length to prevent ReDoS
        const truncatedContent = content.length > 100000 ? content.slice(0, 100000) : content;
        const jsonMatch = truncatedContent.match(/\{[\s\S]*?\}/);
        if (jsonMatch) {
          const reviewData = JSON.parse(jsonMatch[0]);
          return {
            ...baseResult,
            feedback: reviewData.feedback || content,
            suggestions: reviewData.suggestions || [],
            concerns: reviewData.concerns || [],
            approved: reviewData.approved ?? false,
          };
        }

        // No JSON found, use text as feedback
        return {
          ...baseResult,
          feedback: content,
          suggestions: [],
          concerns: [],
          approved: false,
        };
      }
    } catch {
      // Failed to parse response, treat as plain text
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
export const OpenRouterReviewer = OpenRouterAdapter;
