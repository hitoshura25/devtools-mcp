/**
 * Reviewer registry - centralized registry for all reviewer adapters
 */

import { GeminiReviewer } from './gemini.js';
import { OllamaReviewer } from './ollama.js';
import { OpenRouterReviewer } from './openrouter.js';
import { loadReviewerConfigSync, type ReviewerConfig } from './config.js';
import type { ReviewerAdapter, ReviewerType, ReviewerAvailability } from './types.js';

/**
 * Registry for managing reviewer adapters
 * Loads configuration and initializes adapters with configured models
 */
export class ReviewerRegistry {
  private adapters: Map<ReviewerType, ReviewerAdapter> = new Map();
  private config: ReviewerConfig;

  constructor(config?: ReviewerConfig) {
    // Load configuration (use provided config or load from environment/file)
    this.config = config ?? loadReviewerConfigSync();

    // Initialize adapters with configuration
    this.initializeAdapters();
  }

  /**
   * Initialize reviewer adapters based on configuration
   */
  private initializeAdapters(): void {
    // Always initialize Gemini and Ollama for backward compatibility
    const geminiConfig = this.config.backends.gemini;
    const ollamaConfig = this.config.backends.ollama;

    this.adapters.set('gemini', new GeminiReviewer({
      model: geminiConfig?.model,
      useDocker: geminiConfig?.useDocker,
    }));

    this.adapters.set('olmo', new OllamaReviewer({
      baseUrl: ollamaConfig?.baseUrl,
      model: ollamaConfig?.model,
    }));

    // OpenRouter adapter (AI2 OLMo via API)
    const openrouterConfig = this.config.backends.openrouter;
    this.adapters.set('openrouter', new OpenRouterReviewer({
      endpoint: openrouterConfig?.endpoint,
      model: openrouterConfig?.model,
      temperature: openrouterConfig?.temperature,
    }));

    // GitHub Models adapter will be registered here once created
    // this.adapters.set('github-models', new GitHubModelsReviewer(this.config.backends['github-models']));
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
