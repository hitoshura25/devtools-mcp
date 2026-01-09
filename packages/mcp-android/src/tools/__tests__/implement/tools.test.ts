import { describe, it, expect, vi, beforeEach } from 'vitest';

// Create mock functions using vi.hoisted
const { mockStart, mockStep, mockGetStatus, mockListActive, mockAbort } = vi.hoisted(() => ({
  mockStart: vi.fn(),
  mockStep: vi.fn(),
  mockGetStatus: vi.fn(),
  mockListActive: vi.fn(),
  mockAbort: vi.fn(),
}));

// Mock the core module
vi.mock('@hitoshura25/core', async () => {
  const actual = await vi.importActual('@hitoshura25/core');
  return {
    ...actual,
    ImplementOrchestrator: vi.fn().mockImplementation(() => ({
      start: mockStart,
      step: mockStep,
      getStatus: mockGetStatus,
      listActive: mockListActive,
      abort: mockAbort,
    })),
    ReviewerUnavailableError: class ReviewerUnavailableError extends Error {
      constructor(public reviewer: string, public availability: any) {
        super(`Reviewer '${reviewer}' is not available`);
        this.name = 'ReviewerUnavailableError';
      }
    },
    reviewerRegistry: {
      checkAvailability: vi.fn(),
      get: vi.fn(),
    },
  };
});

import { implementStart, implementStep, implementStatus, implementAbort } from '../../implement/tools.js';
import { ReviewerUnavailableError } from '@hitoshura25/core';

describe('Implement Tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('implementStart', () => {
    it('should start workflow successfully', async () => {
      mockStart.mockResolvedValue({
        workflowId: 'test-123',
        action: {
          type: 'create_file',
          path: 'specs/test.md',
          content: 'spec content',
          instruction: 'Create this spec file',
        },
      });

      const result = await implementStart({
        description: 'Add new feature',
        project_path: '.',
      });

      expect(result.success).toBe(true);
      expect(result.data?.status).toBe('initialized');
      expect(result.data?.workflowId).toBe('test-123');
      expect(result.data?.nextTool).toBe('implement_step');
    });

    it('should handle reviewer unavailable error', async () => {
      const error = new ReviewerUnavailableError('gemini', {
        reason: 'Docker not running',
        installInstructions: 'Start Docker',
      });

      mockStart.mockRejectedValue(error);

      const result = await implementStart({
        description: 'Add new feature',
        reviewers: ['gemini'],
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('REVIEWER_UNAVAILABLE');
      expect(result.error?.details).toContain('Docker');
    });

    it('should handle generic errors', async () => {
      mockStart.mockRejectedValue(new Error('Something went wrong'));

      const result = await implementStart({
        description: 'Add new feature',
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('START_FAILED');
    });
  });

  describe('implementStep', () => {
    it('should execute step successfully', async () => {
      mockStep.mockResolvedValue({
        phase: 'spec_created',
        action: {
          type: 'shell',
          command: 'gemini review',
          instruction: 'Run review',
        },
        complete: false,
      });

      const result = await implementStep({
        workflow_id: 'test-123',
        step_result: { success: true },
      });

      expect(result.success).toBe(true);
      expect(result.data?.status).toBe('step_complete');
      expect(result.data?.phase).toBe('spec_created');
      expect(result.data?.nextTool).toBe('implement_step');
    });

    it('should handle workflow completion', async () => {
      mockStep.mockResolvedValue({
        phase: 'complete',
        action: null,
        complete: true,
      });

      const result = await implementStep({
        workflow_id: 'test-123',
        step_result: { success: true },
      });

      expect(result.success).toBe(true);
      expect(result.data?.status).toBe('workflow_complete');
      expect(result.data?.nextTool).toBeNull();
    });

    it('should handle errors', async () => {
      mockStep.mockRejectedValue(new Error('Step failed'));

      const result = await implementStep({
        workflow_id: 'test-123',
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('STEP_FAILED');
    });
  });

  describe('implementStatus', () => {
    it('should get specific workflow status', async () => {
      mockGetStatus.mockResolvedValue({
        workflowId: 'test-123',
        phase: 'implementation_pending',
        description: 'Add new feature',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:10:00Z',
      });

      const result = await implementStatus({
        workflow_id: 'test-123',
      });

      expect(result.success).toBe(true);
      expect(result.data?.workflowId).toBe('test-123');
      expect(result.data?.phase).toBe('implementation_pending');
    });

    it('should handle workflow not found', async () => {
      mockGetStatus.mockResolvedValue(null);

      const result = await implementStatus({
        workflow_id: 'non-existent',
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('WORKFLOW_NOT_FOUND');
    });

    it('should list active workflows', async () => {
      mockListActive.mockResolvedValue(['wf-1', 'wf-2']);

      const result = await implementStatus({});

      expect(result.success).toBe(true);
      expect(result.data?.activeWorkflows).toEqual(['wf-1', 'wf-2']);
    });
  });

  describe('implementAbort', () => {
    it('should abort workflow successfully', async () => {
      mockAbort.mockResolvedValue(undefined);

      const result = await implementAbort({
        workflow_id: 'test-123',
        reason: 'User requested',
      });

      expect(result.success).toBe(true);
      expect(result.data?.status).toBe('aborted');
      expect(result.data?.workflowId).toBe('test-123');
    });

    it('should handle errors', async () => {
      mockAbort.mockRejectedValue(new Error('Abort failed'));

      const result = await implementAbort({
        workflow_id: 'test-123',
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('ABORT_FAILED');
    });
  });
});
