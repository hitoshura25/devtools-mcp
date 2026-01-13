/**
 * Configuration loader for reviewer backends
 *
 * Priority order:
 * 1. Environment variables (highest)
 * 2. Config file (.devtools/reviewers.config.json)
 * 3. Default values (lowest)
 */

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import type { ReviewerType } from './types.js';

export interface ReviewerBackendConfig {
  // Gemini configuration
  gemini?: {
    model?: string;
    useDocker?: boolean;
  };

  // Ollama configuration
  ollama?: {
    baseUrl?: string;
    model?: string;
  };

  // OpenRouter configuration
  openrouter?: {
    endpoint?: string;
    model?: string;
    temperature?: number;
  };

  // GitHub Models configuration
  'github-models'?: {
    endpoint?: string;
    model?: string;
    temperature?: number;
  };
}

export interface ReviewerConfig {
  // Which reviewers to use (in order)
  reviewers: ReviewerType[];

  // Backend-specific configuration
  backends: ReviewerBackendConfig;
}

interface ConfigFile {
  reviewers?: ReviewerType[];
  backends?: ReviewerBackendConfig;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: ReviewerConfig = {
  reviewers: ['gemini'],
  backends: {
    gemini: {
      model: 'gemini-2.5-flash-lite',
      useDocker: false,
    },
    ollama: {
      baseUrl: 'http://localhost:11434',
      model: 'olmo-3.1:32b-think',
    },
    'github-models': {
      endpoint: 'https://models.inference.ai.azure.com',
      model: 'phi-4',
      temperature: 0.3,
    },
  },
};

/**
 * Load configuration from environment variables
 */
function loadFromEnv(): Partial<ReviewerConfig> {
  const config: Partial<ReviewerConfig> = {
    backends: {},
  };

  // Load reviewer selection
  const reviewersEnv = process.env.REVIEWERS;
  if (reviewersEnv) {
    config.reviewers = reviewersEnv.split(',').map(r => r.trim() as ReviewerType);
  }

  // Load Gemini config
  const geminiModel = process.env.GEMINI_MODEL;
  if (geminiModel) {
    config.backends!.gemini = {
      ...config.backends!.gemini,
      model: geminiModel,
    };
  }

  // Load Ollama config
  const ollamaModel = process.env.OLLAMA_MODEL;
  const ollamaBaseUrl = process.env.OLLAMA_BASE_URL;
  if (ollamaModel || ollamaBaseUrl) {
    config.backends!.ollama = {
      ...config.backends!.ollama,
      ...(ollamaModel && { model: ollamaModel }),
      ...(ollamaBaseUrl && { baseUrl: ollamaBaseUrl }),
    };
  }

  // Load OpenRouter config
  const openrouterModel = process.env.OPENROUTER_MODEL;
  const openrouterEndpoint = process.env.OPENROUTER_ENDPOINT;
  if (openrouterModel || openrouterEndpoint) {
    config.backends!.openrouter = {
      ...config.backends!.openrouter,
      ...(openrouterModel && { model: openrouterModel }),
      ...(openrouterEndpoint && { endpoint: openrouterEndpoint }),
    };
  }

  // Load GitHub Models config
  const githubModelsModel = process.env.GITHUB_MODELS_MODEL;
  const githubModelsEndpoint = process.env.GITHUB_MODELS_ENDPOINT;
  if (githubModelsModel || githubModelsEndpoint) {
    config.backends!['github-models'] = {
      ...config.backends!['github-models'],
      ...(githubModelsModel && { model: githubModelsModel }),
      ...(githubModelsEndpoint && { endpoint: githubModelsEndpoint }),
    };
  }

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
    const fileConfig: ConfigFile = JSON.parse(content);

    return {
      reviewers: fileConfig.reviewers,
      backends: fileConfig.backends,
    };
  } catch (error) {
    console.warn(`Failed to load reviewer config from ${configPath}:`, error);
    return {};
  }
}

/**
 * Deep merge configuration objects
 */
function mergeConfig(...configs: Partial<ReviewerConfig>[]): ReviewerConfig {
  const result: ReviewerConfig = {
    reviewers: DEFAULT_CONFIG.reviewers,
    backends: { ...DEFAULT_CONFIG.backends },
  };

  for (const config of configs) {
    if (config.reviewers) {
      result.reviewers = config.reviewers;
    }

    if (config.backends) {
      // Merge backend configs
      for (const [backend, backendConfig] of Object.entries(config.backends)) {
        result.backends[backend as keyof ReviewerBackendConfig] = {
          ...result.backends[backend as keyof ReviewerBackendConfig],
          ...backendConfig,
        };
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
  const envConfig = loadFromEnv();
  const fileConfig = await loadFromFile(projectPath);

  return mergeConfig(fileConfig, envConfig);
}

/**
 * Synchronous version for cases where async loading isn't possible
 * (only uses env vars and defaults, skips config file)
 */
export function loadReviewerConfigSync(): ReviewerConfig {
  const envConfig = loadFromEnv();
  return mergeConfig(envConfig);
}
