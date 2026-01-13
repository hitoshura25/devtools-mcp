/**
 * OpenRouter reviewer adapter
 * Provides access to AI2 OLMo models via OpenRouter API
 */

import type { ReviewerAdapter, ReviewerAvailability, ReviewContext, ReviewResult } from './types.js';

export interface OpenRouterReviewerOptions {
  endpoint?: string;
  model?: string;
  temperature?: number;
}

export class OpenRouterReviewer implements ReviewerAdapter {
  name = 'openrouter' as const;
  private endpoint: string;
  private model: string;
  private temperature: number;

  constructor(options?: OpenRouterReviewerOptions) {
    this.endpoint = options?.endpoint ?? 'https://openrouter.ai/api/v1';
    this.model = options?.model ?? 'allenai/olmo-3.1-32b-think';
    this.temperature = options?.temperature ?? 0.3;
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
          reviewer: 'openrouter',
          timestamp: new Date().toISOString(),
          feedback: reviewData.feedback || content,
          suggestions: reviewData.suggestions || [],
          concerns: reviewData.concerns || [],
          approved: reviewData.approved ?? false,
        };
      } catch {
        // Response is not JSON, try to find JSON within the text
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const reviewData = JSON.parse(jsonMatch[0]);
          return {
            reviewer: 'openrouter',
            timestamp: new Date().toISOString(),
            feedback: reviewData.feedback || content,
            suggestions: reviewData.suggestions || [],
            concerns: reviewData.concerns || [],
            approved: reviewData.approved ?? false,
          };
        }

        // No JSON found, use text as feedback
        return {
          reviewer: 'openrouter',
          timestamp: new Date().toISOString(),
          feedback: content,
          suggestions: [],
          concerns: [],
          approved: false,
        };
      }
    } catch (error) {
      // Failed to parse response, treat as plain text
      return {
        reviewer: 'openrouter',
        timestamp: new Date().toISOString(),
        feedback: output,
        suggestions: [],
        concerns: [],
        approved: false,
      };
    }
  }
}
