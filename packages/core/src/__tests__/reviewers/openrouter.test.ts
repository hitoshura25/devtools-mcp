import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { OpenRouterAdapter } from '@hitoshura25/core';
import type { OpenRouterBackendConfig } from '@hitoshura25/core';

describe('OpenRouterAdapter', () => {
  const defaultConfig: OpenRouterBackendConfig = {
    type: 'openrouter',
    model: 'allenai/olmo-3.1-32b-think',
  };

  let reviewer: OpenRouterAdapter;

  beforeEach(() => {
    reviewer = new OpenRouterAdapter('olmo-cloud', defaultConfig);
  });

  describe('parseReviewOutput', () => {
    it('parses OpenAI-format response with JSON content', () => {
      const output = JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                approved: true,
                feedback: 'Good spec',
                suggestions: ['Add edge cases'],
                concerns: [],
              }),
            },
          },
        ],
      });

      const result = reviewer.parseReviewOutput(output);
      expect(result.approved).toBe(true);
      expect(result.feedback).toBe('Good spec');
      expect(result.suggestions).toEqual(['Add edge cases']);
    });

    it('handles plain text response', () => {
      const result = reviewer.parseReviewOutput('Plain text feedback');
      expect(result.approved).toBe(false);
      expect(result.feedback).toBe('Plain text feedback');
    });

    it('extracts JSON from message content', () => {
      const output = JSON.stringify({
        choices: [
          {
            message: {
              content:
                '{"approved": false, "feedback": "Needs work", "suggestions": [], "concerns": ["Missing tests"]}',
            },
          },
        ],
      });

      const result = reviewer.parseReviewOutput(output);
      expect(result.approved).toBe(false);
      expect(result.feedback).toBe('Needs work');
      expect(result.concerns).toEqual(['Missing tests']);
    });

    it('extracts JSON from mixed text content', () => {
      const output = JSON.stringify({
        choices: [
          {
            message: {
              content:
                'Here is my review:\n{"approved": true, "feedback": "Looks good", "suggestions": ["Add tests"], "concerns": []}\nEnd of review.',
            },
          },
        ],
      });

      const result = reviewer.parseReviewOutput(output);
      expect(result.approved).toBe(true);
      expect(result.feedback).toBe('Looks good');
      expect(result.suggestions).toEqual(['Add tests']);
    });

    it('sets reviewer name correctly', () => {
      const result = reviewer.parseReviewOutput('{}');
      expect(result.reviewer).toBe('olmo-cloud');
    });

    it('includes backend type and model in result', () => {
      const result = reviewer.parseReviewOutput('{}');
      expect(result.backendType).toBe('openrouter');
      expect(result.model).toBe('allenai/olmo-3.1-32b-think');
    });

    it('sets timestamp', () => {
      const result = reviewer.parseReviewOutput('{}');
      expect(result.timestamp).toBeTruthy();
      expect(new Date(result.timestamp)).toBeInstanceOf(Date);
    });

    it('handles malformed output gracefully', () => {
      const result = reviewer.parseReviewOutput('Not JSON at all');
      expect(result.approved).toBe(false);
      expect(result.feedback).toBe('Not JSON at all');
      expect(result.suggestions).toEqual([]);
      expect(result.concerns).toEqual([]);
    });
  });

  describe('getReviewCommand', () => {
    it('generates curl command with default settings', () => {
      const spec = 'Test spec';
      const command = reviewer.getReviewCommand(spec, { projectPath: '.' });

      expect(command).toContain('curl');
      expect(command).toContain('https://openrouter.ai/api/v1');
      expect(command).toContain('allenai/olmo-3.1-32b-think');
      expect(command).toContain('Authorization: Bearer $OPENROUTER_API_KEY');
    });

    it('uses custom endpoint', () => {
      const customConfig: OpenRouterBackendConfig = {
        type: 'openrouter',
        model: 'allenai/olmo-3.1-32b-think',
        endpoint: 'https://custom.openrouter.ai/api/v1',
      };
      const customReviewer = new OpenRouterAdapter('custom-router', customConfig);
      const command = customReviewer.getReviewCommand('spec', { projectPath: '.' });

      expect(command).toContain('https://custom.openrouter.ai/api/v1');
    });

    it('uses custom model', () => {
      const customConfig: OpenRouterBackendConfig = {
        type: 'openrouter',
        model: 'allenai/olmo-2-32b-instruct',
      };
      const customReviewer = new OpenRouterAdapter('olmo2-reviewer', customConfig);
      const command = customReviewer.getReviewCommand('spec', { projectPath: '.' });

      expect(command).toContain('allenai/olmo-2-32b-instruct');
    });

    it('uses custom temperature', () => {
      const customConfig: OpenRouterBackendConfig = {
        type: 'openrouter',
        model: 'allenai/olmo-3.1-32b-think',
        temperature: 0.7,
      };
      const customReviewer = new OpenRouterAdapter('warm-reviewer', customConfig);
      const command = customReviewer.getReviewCommand('spec', { projectPath: '.' });

      expect(command).toContain('"temperature": 0.7');
    });

    it('includes spec in the prompt', () => {
      const spec = 'My test specification';
      const command = reviewer.getReviewCommand(spec, { projectPath: '.' });

      expect(command).toContain('My test specification');
    });
  });

  describe('checkAvailability', () => {
    const originalEnv = process.env.OPENROUTER_API_KEY;

    afterEach(() => {
      if (originalEnv) {
        process.env.OPENROUTER_API_KEY = originalEnv;
      } else {
        delete process.env.OPENROUTER_API_KEY;
      }
    });

    it('returns available when API key is set', async () => {
      process.env.OPENROUTER_API_KEY = 'test-key';
      const result = await reviewer.checkAvailability();

      expect(result.available).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('returns unavailable when API key is missing', async () => {
      delete process.env.OPENROUTER_API_KEY;
      const result = await reviewer.checkAvailability();

      expect(result.available).toBe(false);
      expect(result.reason).toContain('OPENROUTER_API_KEY');
      expect(result.installInstructions).toBeTruthy();
    });
  });

  describe('adapter properties', () => {
    it('has correct name property', () => {
      expect(reviewer.name).toBe('olmo-cloud');
    });

    it('has correct backendType property', () => {
      expect(reviewer.backendType).toBe('openrouter');
    });

    it('has correct model property', () => {
      expect(reviewer.model).toBe('allenai/olmo-3.1-32b-think');
    });
  });
});
