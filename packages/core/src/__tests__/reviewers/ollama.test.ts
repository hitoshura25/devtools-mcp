import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OllamaReviewer } from '@hitoshura25/core';

// Mock child_process exec
const mockExec = vi.fn();
vi.mock('child_process', () => ({
  exec: (cmd: string, options: unknown, callback: unknown) => mockExec(cmd, options, callback),
}));

describe('OllamaReviewer', () => {
  let reviewer: OllamaReviewer;

  beforeEach(() => {
    vi.clearAllMocks();
    reviewer = new OllamaReviewer();
  });

  describe('parseReviewOutput', () => {
    it('parses OpenAI-format response', () => {
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
              content: '{"approved": false, "feedback": "Needs work", "suggestions": [], "concerns": ["Missing tests"]}',
            },
          },
        ],
      });

      const result = reviewer.parseReviewOutput(output);
      expect(result.approved).toBe(false);
      expect(result.feedback).toBe('Needs work');
      expect(result.concerns).toEqual(['Missing tests']);
    });

    it('sets reviewer name correctly', () => {
      const result = reviewer.parseReviewOutput('{}');
      expect(result.reviewer).toBe('olmo');
    });
  });

  describe('getReviewCommand', () => {
    it('generates curl command', () => {
      const spec = 'Test spec';
      const command = reviewer.getReviewCommand(spec, { projectPath: '.' });

      expect(command).toContain('curl');
      expect(command).toContain('localhost:11434');
      expect(command).toContain('olmo-3.1:32b-think');
    });

    it('uses custom base URL', () => {
      const customReviewer = new OllamaReviewer({ baseUrl: 'http://custom:8080' });
      const command = customReviewer.getReviewCommand('spec', { projectPath: '.' });

      expect(command).toContain('custom:8080');
    });

    it('uses custom model', () => {
      const customReviewer = new OllamaReviewer({ model: 'custom-model' });
      const command = customReviewer.getReviewCommand('spec', { projectPath: '.' });

      expect(command).toContain('custom-model');
    });
  });
});
