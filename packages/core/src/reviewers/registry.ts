/**
 * Reviewer registry - creates and manages reviewer adapters
 *
 * Uses a factory pattern to create adapters based on backend type.
 * Each configured reviewer gets its own adapter instance.
 */

import { OllamaAdapter } from './ollama.js';
import { OpenRouterAdapter } from './openrouter.js';
import { loadReviewerConfigSync } from './config.js';
import type {
  ReviewerAdapter,
  ReviewerAvailability,
  ReviewerConfig,
  ReviewerName,
  ReviewerBackendConfig,
  BackendType,
  OllamaBackendConfig,
  OpenRouterBackendConfig,
} from './types.js';

/**
 * Factory function type for creating backend adapters
 */
type AdapterFactory = (
  reviewerName: ReviewerName,
  config: ReviewerBackendConfig
) => ReviewerAdapter;

/**
 * Registry of backend adapter factories
 */
const backendFactories: Record<BackendType, AdapterFactory> = {
  ollama: (name, config) => new OllamaAdapter(name, config as OllamaBackendConfig),
  openrouter: (name, config) => new OpenRouterAdapter(name, config as OpenRouterBackendConfig),
  'github-models': (name, _config) => {
    // GitHub Models adapter not implemented yet
    // For now, throw an error if someone tries to use it
    throw new Error(
      `GitHub Models backend is not yet implemented. ` +
        `Reviewer '${name}' cannot be created. ` +
        `Use 'ollama' or 'openrouter' backend instead.`
    );
  },
};

/**
 * Registry for managing reviewer adapters
 * Creates adapters dynamically based on configuration
 */
export class ReviewerRegistry {
  private adapters: Map<ReviewerName, ReviewerAdapter> = new Map();
  private config: ReviewerConfig;

  constructor(config?: ReviewerConfig) {
    // Load configuration (use provided config or load from environment/file)
    this.config = config ?? loadReviewerConfigSync();

    // Initialize adapters for all configured reviewers
    this.initializeAdapters();
  }

  /**
   * Initialize reviewer adapters based on configuration
   */
  private initializeAdapters(): void {
    for (const [reviewerName, backendConfig] of Object.entries(this.config.reviewers)) {
      const factory = backendFactories[backendConfig.type];

      if (!factory) {
        console.warn(
          `Unknown backend type '${backendConfig.type}' for reviewer '${reviewerName}'. Skipping.`
        );
        continue;
      }

      try {
        const adapter = factory(reviewerName, backendConfig);
        this.adapters.set(reviewerName, adapter);
      } catch (error) {
        console.warn(
          `Failed to create adapter for reviewer '${reviewerName}':`,
          error instanceof Error ? error.message : error
        );
      }
    }
  }

  /**
   * Get adapter by reviewer name
   */
  get(reviewerName: ReviewerName): ReviewerAdapter {
    const adapter = this.adapters.get(reviewerName);
    if (!adapter) {
      const available = this.listReviewers();
      throw new Error(
        `Unknown reviewer: '${reviewerName}'. ` +
          `Available reviewers: ${available.length > 0 ? available.join(', ') : '(none configured)'}`
      );
    }
    return adapter;
  }

  /**
   * Get the list of active reviewers (in configured order)
   */
  getActiveReviewers(): ReviewerName[] {
    return this.config.activeReviewers;
  }

  /**
   * List all configured reviewer names
   */
  listReviewers(): ReviewerName[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * Check availability for a specific reviewer
   */
  async checkAvailability(reviewerName: ReviewerName): Promise<ReviewerAvailability> {
    const adapter = this.get(reviewerName);
    return adapter.checkAvailability();
  }

  /**
   * Check availability for all active reviewers
   */
  async checkAllAvailability(): Promise<Record<ReviewerName, ReviewerAvailability>> {
    const results: Record<ReviewerName, ReviewerAvailability> = {};

    for (const name of this.config.activeReviewers) {
      try {
        results[name] = await this.checkAvailability(name);
      } catch (error) {
        results[name] = {
          available: false,
          reason: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }

    return results;
  }

  /**
   * Get the configuration (useful for debugging)
   */
  getConfig(): ReviewerConfig {
    return this.config;
  }
}

/**
 * Lazy-loaded singleton reviewer registry instance
 * Uses default configuration from environment/file
 * Only instantiated when first accessed (avoids failures during module import in tests)
 */
let _reviewerRegistry: ReviewerRegistry | null = null;

export function getReviewerRegistry(): ReviewerRegistry {
  if (!_reviewerRegistry) {
    _reviewerRegistry = new ReviewerRegistry();
  }
  return _reviewerRegistry;
}

/**
 * Reset the singleton (useful for testing)
 */
export function resetReviewerRegistry(): void {
  _reviewerRegistry = null;
}
