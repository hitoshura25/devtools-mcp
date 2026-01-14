/**
 * Configuration loader for reviewer backends
 *
 * Priority order:
 * 1. Environment variables (highest)
 * 2. Config file (.devtools/reviewers.config.json)
 * 3. Default values (lowest)
 */

import { readFile } from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type {
  ReviewerConfig,
  ReviewerBackendConfig,
} from './types.js';

/**
 * Default configuration
 * Uses Ollama with OLMo model for local development (free)
 */
const DEFAULT_CONFIG: ReviewerConfig = {
  activeReviewers: ['olmo-local'],
  reviewers: {
    'olmo-local': {
      type: 'ollama',
      model: 'olmo-3.1:32b-think',
      baseUrl: 'http://localhost:11434',
    },
  },
};

/**
 * Load configuration from environment variables
 */
function loadFromEnv(): Partial<ReviewerConfig> {
  const config: Partial<ReviewerConfig> = {};

  // Load active reviewers list
  const activeReviewersEnv = process.env.ACTIVE_REVIEWERS;
  if (activeReviewersEnv) {
    config.activeReviewers = activeReviewersEnv.split(',').map(r => r.trim());
  }

  // Individual reviewer configs can be set via environment variables
  // Format: REVIEWER_<NAME>_TYPE, REVIEWER_<NAME>_MODEL, etc.
  // This is mainly for CI flexibility

  // Quick override for common CI patterns:
  // If OPENROUTER_API_KEY is set and ACTIVE_REVIEWERS includes a reviewer
  // that uses openrouter, the API key will be used automatically

  return config;
}

/**
 * Load configuration from file
 */
async function loadFromFile(projectPath: string): Promise<Partial<ReviewerConfig>> {
  const configPath = join(projectPath, '.devtools', 'reviewers.config.json');

  if (!existsSync(configPath)) {
    return {};
  }

  try {
    const content = await readFile(configPath, 'utf-8');
    const fileConfig = JSON.parse(content) as Partial<ReviewerConfig>;

    // Validate the config has the new format
    if (fileConfig.activeReviewers && fileConfig.reviewers) {
      return fileConfig;
    }

    // If old format detected, warn and return empty
    if ('backends' in fileConfig) {
      console.warn(
        `⚠️  Old reviewer config format detected in ${configPath}.\n` +
        `   Please update to the new format. See docs/REVIEWERS.md for details.`
      );
      return {};
    }

    return fileConfig;
  } catch (error) {
    console.warn(`Failed to load reviewer config from ${configPath}:`, error);
    return {};
  }
}

/**
 * Load configuration from file (synchronous version)
 */
function loadFromFileSync(projectPath: string): Partial<ReviewerConfig> {
  const configPath = join(projectPath, '.devtools', 'reviewers.config.json');

  if (!existsSync(configPath)) {
    return {};
  }

  try {
    const content = readFileSync(configPath, 'utf-8');
    const fileConfig = JSON.parse(content) as Partial<ReviewerConfig>;

    // Validate the config has the new format
    if (fileConfig.activeReviewers && fileConfig.reviewers) {
      return fileConfig;
    }

    // If old format detected, warn and return empty
    if ('backends' in fileConfig) {
      console.warn(
        `⚠️  Old reviewer config format detected in ${configPath}.\n` +
        `   Please update to the new format. See docs/REVIEWERS.md for details.`
      );
      return {};
    }

    return fileConfig;
  } catch (error) {
    console.warn(`Failed to load reviewer config from ${configPath}:`, error);
    return {};
  }
}

/**
 * Merge configuration objects
 * Later configs override earlier ones
 */
function mergeConfig(...configs: Partial<ReviewerConfig>[]): ReviewerConfig {
  const result: ReviewerConfig = {
    activeReviewers: [...DEFAULT_CONFIG.activeReviewers],
    reviewers: { ...DEFAULT_CONFIG.reviewers },
  };

  for (const config of configs) {
    if (config.activeReviewers) {
      result.activeReviewers = config.activeReviewers;
    }

    if (config.reviewers) {
      // Merge reviewer configs - new entries override existing
      for (const [reviewerName, reviewerConfig] of Object.entries(config.reviewers)) {
        result.reviewers[reviewerName] = {
          ...result.reviewers[reviewerName],
          ...reviewerConfig,
        } as ReviewerBackendConfig;
      }
    }
  }

  return result;
}

/**
 * Load reviewer configuration from all sources
 *
 * Priority order:
 * 1. Environment variables (highest priority)
 * 2. Config file
 * 3. Defaults (lowest priority)
 */
export async function loadReviewerConfig(projectPath: string = '.'): Promise<ReviewerConfig> {
  const fileConfig = await loadFromFile(projectPath);
  const envConfig = loadFromEnv();

  return mergeConfig(fileConfig, envConfig);
}

/**
 * Synchronous version for cases where async loading isn't possible
 */
export function loadReviewerConfigSync(projectPath: string = '.'): ReviewerConfig {
  const fileConfig = loadFromFileSync(projectPath);
  const envConfig = loadFromEnv();

  return mergeConfig(fileConfig, envConfig);
}

/**
 * Get default configuration (useful for testing)
 */
export function getDefaultConfig(): ReviewerConfig {
  return { ...DEFAULT_CONFIG };
}
