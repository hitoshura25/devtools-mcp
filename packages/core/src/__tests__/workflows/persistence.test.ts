import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FileWorkflowStorage } from '@hitoshura25/core';
import { rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('FileWorkflowStorage', () => {
  let storage: FileWorkflowStorage<{ test: string }>;
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `workflow-test-${Date.now()}`);
    storage = new FileWorkflowStorage('test');
    // Override paths for testing
    // @ts-expect-error - accessing private for test
    storage.baseDir = testDir;
    // @ts-expect-error - accessing private for test
    storage.activeDir = join(testDir, 'active');
    // @ts-expect-error - accessing private for test
    storage.completedDir = join(testDir, 'completed');
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('saves and loads workflow', async () => {
    await storage.save('test-123', { test: 'value' });
    const loaded = await storage.load('test-123');
    expect(loaded).toEqual({ test: 'value' });
  });

  it('returns null for non-existent workflow', async () => {
    const loaded = await storage.load('non-existent');
    expect(loaded).toBeNull();
  });

  it('lists active workflows', async () => {
    await storage.save('wf-1', { test: '1' });
    await storage.save('wf-2', { test: '2' });

    const list = await storage.list();
    expect(list).toContain('wf-1');
    expect(list).toContain('wf-2');
  });

  it('archives workflow', async () => {
    await storage.save('wf-archive', { test: 'archive' });
    await storage.archive('wf-archive');

    // Should no longer be in active list
    const list = await storage.list();
    expect(list).not.toContain('wf-archive');

    // Should not be loadable from active
    const loaded = await storage.load('wf-archive');
    expect(loaded).toBeNull();
  });

  it('deletes workflow', async () => {
    await storage.save('wf-delete', { test: 'delete' });
    await storage.delete('wf-delete');

    const loaded = await storage.load('wf-delete');
    expect(loaded).toBeNull();
  });
});
