/**
 * Reviewer registry - centralized registry for all reviewer adapters
 */

import { GeminiReviewer } from './gemini.js';
import { OllamaReviewer } from './ollama.js';
import type { ReviewerAdapter, ReviewerType, ReviewerAvailability } from './types.js';

/**
 * Registry for managing reviewer adapters
 */
export class ReviewerRegistry {
  private adapters: Map<ReviewerType, ReviewerAdapter> = new Map();

  constructor() {
    this.adapters.set('gemini', new GeminiReviewer());
    this.adapters.set('olmo', new OllamaReviewer());
  }

  get(type: ReviewerType): ReviewerAdapter {
    const adapter = this.adapters.get(type);
    if (!adapter) {
      throw new Error(`Unknown reviewer type: ${type}`);
    }
    return adapter;
  }

  async checkAvailability(type: ReviewerType): Promise<ReviewerAvailability> {
    const adapter = this.get(type);
    return adapter.checkAvailability();
  }
}

/**
 * Singleton reviewer registry instance
 */
export const reviewerRegistry = new ReviewerRegistry();
