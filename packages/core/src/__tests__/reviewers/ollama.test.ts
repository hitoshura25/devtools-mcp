import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OllamaAdapter } from '@hitoshura25/core';
import type { OllamaBackendConfig } from '@hitoshura25/core';

// Mock child_process exec and execFile
const mockExec = vi.fn();
const mockExecFile = vi.fn();
vi.mock('child_process', () => ({
  exec: (cmd: string, options: unknown, callback: unknown) => mockExec(cmd, options, callback),
  execFile: (cmd: string, args: string[], options: unknown, callback: unknown) => mockExecFile(cmd, args, options, callback),
}));

describe('OllamaAdapter', () => {
  const defaultConfig: OllamaBackendConfig = {
    type: 'ollama',
    model: 'olmo-3.1:32b-think',
  };

  let reviewer: OllamaAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    reviewer = new OllamaAdapter('olmo-local', defaultConfig);
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
      expect(result.reviewer).toBe('olmo-local');
    });

    it('includes backend type and model in result', () => {
      const result = reviewer.parseReviewOutput('{}');
      expect(result.backendType).toBe('ollama');
      expect(result.model).toBe('olmo-3.1:32b-think');
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
      const customConfig: OllamaBackendConfig = {
        type: 'ollama',
        model: 'olmo-3.1:32b-think',
        baseUrl: 'http://custom:8080',
      };
      const customReviewer = new OllamaAdapter('olmo-custom', customConfig);
      const command = customReviewer.getReviewCommand('spec', { projectPath: '.' });

      expect(command).toContain('custom:8080');
    });

    it('uses custom model', () => {
      const customConfig: OllamaBackendConfig = {
        type: 'ollama',
        model: 'custom-model',
      };
      const customReviewer = new OllamaAdapter('custom-reviewer', customConfig);
      const command = customReviewer.getReviewCommand('spec', { projectPath: '.' });

      expect(command).toContain('custom-model');
    });
  });

  describe('adapter properties', () => {
    it('has correct name property', () => {
      expect(reviewer.name).toBe('olmo-local');
    });

    it('has correct backendType property', () => {
      expect(reviewer.backendType).toBe('ollama');
    });

    it('has correct model property', () => {
      expect(reviewer.model).toBe('olmo-3.1:32b-think');
    });
  });
});
