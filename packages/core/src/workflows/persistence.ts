/**
 * File-based workflow state persistence
 */

import { mkdir, readFile, writeFile, rename, readdir, unlink } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import type { WorkflowStorage } from './types.js';

/**
 * File-based workflow storage implementation
 * Stores workflows in ~/.devtools/workflows/{workflowType}/
 */
export class FileWorkflowStorage<T> implements WorkflowStorage<T> {
  private baseDir: string;
  private activeDir: string;
  private completedDir: string;

  constructor(workflowType: string) {
    this.baseDir = join(homedir(), '.devtools', 'workflows', workflowType);
    this.activeDir = join(this.baseDir, 'active');
    this.completedDir = join(this.baseDir, 'completed');
  }

  async initialize(): Promise<void> {
    await mkdir(this.activeDir, { recursive: true });
    await mkdir(this.completedDir, { recursive: true });
  }

  async save(workflowId: string, context: T): Promise<void> {
    await this.initialize();
    const filePath = join(this.activeDir, `${workflowId}.json`);
    await writeFile(filePath, JSON.stringify(context, null, 2), 'utf-8');
  }

  async load(workflowId: string): Promise<T | null> {
    try {
      const filePath = join(this.activeDir, `${workflowId}.json`);
      const content = await readFile(filePath, 'utf-8');
      return JSON.parse(content) as T;
    } catch {
      return null;
    }
  }

  async list(): Promise<string[]> {
    try {
      await this.initialize();
      const files = await readdir(this.activeDir);
      return files.filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', ''));
    } catch {
      return [];
    }
  }

  async archive(workflowId: string): Promise<void> {
    const sourcePath = join(this.activeDir, `${workflowId}.json`);
    const date = new Date().toISOString().split('T')[0];
    const destPath = join(this.completedDir, `${date}_${workflowId}.json`);
    await rename(sourcePath, destPath);
  }

  async delete(workflowId: string): Promise<void> {
    const filePath = join(this.activeDir, `${workflowId}.json`);
    await unlink(filePath);
  }
}
