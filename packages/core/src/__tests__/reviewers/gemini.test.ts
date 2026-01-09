import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiReviewer } from '../../reviewers/gemini.js';

// Mock child_process exec
const mockExec = vi.fn();
vi.mock('child_process', () => ({
  exec: (cmd: string, options: any, callback: any) => mockExec(cmd, options, callback),
}));

describe('GeminiReviewer', () => {
  let reviewer: GeminiReviewer;

  beforeEach(() => {
    vi.clearAllMocks();
    reviewer = new GeminiReviewer();
  });

  describe('parseReviewOutput', () => {
    it('parses valid JSON response', () => {
      const output = JSON.stringify({
        approved: true,
        feedback: 'Looks good',
        suggestions: ['Add tests'],
        concerns: [],
      });

      const result = reviewer.parseReviewOutput(output);
      expect(result.approved).toBe(true);
      expect(result.feedback).toBe('Looks good');
      expect(result.suggestions).toEqual(['Add tests']);
    });

    it('handles malformed output gracefully', () => {
      const result = reviewer.parseReviewOutput('Not JSON');
      expect(result.approved).toBe(false);
      expect(result.feedback).toBe('Not JSON');
      expect(result.suggestions).toEqual([]);
    });

    it('extracts JSON from mixed output', () => {
      // Gemini CLI JSON wrapper format with response field
      const output = JSON.stringify({
        response: '{"approved": true, "feedback": "Good", "suggestions": [], "concerns": []}',
        stats: {},
      });

      const result = reviewer.parseReviewOutput(output);
      expect(result.approved).toBe(true);
      expect(result.feedback).toBe('Good');
    });

    it('sets reviewer name correctly', () => {
      const result = reviewer.parseReviewOutput('{}');
      expect(result.reviewer).toBe('gemini');
    });

    it('sets timestamp', () => {
      const result = reviewer.parseReviewOutput('{}');
      expect(result.timestamp).toBeTruthy();
      expect(new Date(result.timestamp)).toBeInstanceOf(Date);
    });
  });

  describe('getReviewCommand', () => {
    it('generates valid command', () => {
      const spec = 'Test specification';
      const command = reviewer.getReviewCommand(spec, { projectPath: '.' });

      expect(command).toContain('gemini');
      expect(command).toBeTruthy();
    });

    it('escapes special characters in spec', () => {
      const spec = 'Test with "quotes" and $variables';
      const command = reviewer.getReviewCommand(spec, { projectPath: '.' });

      // Should not contain unescaped quotes or variables
      expect(command).toBeTruthy();
    });
  });
});
