/**
 * Configuration loader for reviewer backends
 *
 * FAIL FAST: No default configuration. The .devtools/reviewers.config.json
 * file MUST exist and be valid, otherwise we throw an error.
 *
 * Priority order for overrides:
 * 1. Environment variables (highest) - can override activeReviewers
 * 2. Config file (.devtools/reviewers.config.json) - required
 */

import { readFile } from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
import { join, dirname, resolve } from 'path';
import type {
  ReviewerConfig,
} from './types.js';

/**
 * Find the .devtools directory by searching up from the start path
 * Similar to how git finds .git directory
 */
function findDevtoolsDir(startPath: string): string | null {
  let currentPath = resolve(startPath);

  // Walk up the directory tree until we hit the filesystem root
  while (true) {
    const devtoolsPath = join(currentPath, '.devtools');
    if (existsSync(devtoolsPath)) {
      return currentPath;
    }

    const parentPath = dirname(currentPath);
    if (parentPath === currentPath) {
      // Reached filesystem root
      break;
    }
    currentPath = parentPath;
  }

  return null;
}

/**
 * Load configuration from environment variables
 * Only used to override activeReviewers from the config file
 */
function loadEnvOverrides(): Partial<ReviewerConfig> {
  const overrides: Partial<ReviewerConfig> = {};

  // Load active reviewers list override
  const activeReviewersEnv = process.env.ACTIVE_REVIEWERS;
  if (activeReviewersEnv) {
    overrides.activeReviewers = activeReviewersEnv.split(',').map(r => r.trim());
  }

  return overrides;
}

/**
 * Load configuration from file (async version)
 * Searches up from projectPath to find .devtools directory
 * THROWS if config file is not found or invalid
 */
async function loadFromFile(projectPath: string): Promise<ReviewerConfig> {
  // Find .devtools directory by searching up the tree
  const devtoolsRoot = findDevtoolsDir(projectPath);
  if (!devtoolsRoot) {
    throw new Error(
      `Could not find .devtools directory.\n` +
      `Searched from: ${resolve(projectPath)}\n` +
      `Create .devtools/reviewers.config.json with your reviewer configuration.\n` +
      `See docs/REVIEWERS.md for details.`
    );
  }

  const configPath = join(devtoolsRoot, '.devtools', 'reviewers.config.json');

  if (!existsSync(configPath)) {
    throw new Error(
      `Reviewer config file not found: ${configPath}\n` +
      `Create this file with your reviewer configuration.\n` +
      `See docs/REVIEWERS.md for details.`
    );
  }

  try {
    const content = await readFile(configPath, 'utf-8');
    const fileConfig = JSON.parse(content) as ReviewerConfig;

    // Validate required fields
    if (!fileConfig.activeReviewers || !Array.isArray(fileConfig.activeReviewers)) {
      throw new Error(
        `Invalid config: 'activeReviewers' array is required in ${configPath}`
      );
    }

    if (!fileConfig.reviewers || typeof fileConfig.reviewers !== 'object') {
      throw new Error(
        `Invalid config: 'reviewers' object is required in ${configPath}`
      );
    }

    // Validate all active reviewers have configurations
    for (const reviewerName of fileConfig.activeReviewers) {
      if (!fileConfig.reviewers[reviewerName]) {
        throw new Error(
          `Invalid config: Active reviewer '${reviewerName}' is not defined in reviewers section.\n` +
          `Available reviewers: ${Object.keys(fileConfig.reviewers).join(', ')}`
        );
      }
    }

    return fileConfig;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(
        `Failed to parse reviewer config at ${configPath}: Invalid JSON\n` +
        `${error.message}`
      );
    }
    throw error;
  }
}

/**
 * Load configuration from file (synchronous version)
 * Searches up from projectPath to find .devtools directory
 * THROWS if config file is not found or invalid
 */
function loadFromFileSync(projectPath: string): ReviewerConfig {
  // Find .devtools directory by searching up the tree
  const devtoolsRoot = findDevtoolsDir(projectPath);
  if (!devtoolsRoot) {
    throw new Error(
      `Could not find .devtools directory.\n` +
      `Searched from: ${resolve(projectPath)}\n` +
      `Create .devtools/reviewers.config.json with your reviewer configuration.\n` +
      `See docs/REVIEWERS.md for details.`
    );
  }

  const configPath = join(devtoolsRoot, '.devtools', 'reviewers.config.json');

  if (!existsSync(configPath)) {
    throw new Error(
      `Reviewer config file not found: ${configPath}\n` +
      `Create this file with your reviewer configuration.\n` +
      `See docs/REVIEWERS.md for details.`
    );
  }

  try {
    const content = readFileSync(configPath, 'utf-8');
    const fileConfig = JSON.parse(content) as ReviewerConfig;

    // Validate required fields
    if (!fileConfig.activeReviewers || !Array.isArray(fileConfig.activeReviewers)) {
      throw new Error(
        `Invalid config: 'activeReviewers' array is required in ${configPath}`
      );
    }

    if (!fileConfig.reviewers || typeof fileConfig.reviewers !== 'object') {
      throw new Error(
        `Invalid config: 'reviewers' object is required in ${configPath}`
      );
    }

    // Validate all active reviewers have configurations
    for (const reviewerName of fileConfig.activeReviewers) {
      if (!fileConfig.reviewers[reviewerName]) {
        throw new Error(
          `Invalid config: Active reviewer '${reviewerName}' is not defined in reviewers section.\n` +
          `Available reviewers: ${Object.keys(fileConfig.reviewers).join(', ')}`
        );
      }
    }

    return fileConfig;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(
        `Failed to parse reviewer config at ${configPath}: Invalid JSON\n` +
        `${error.message}`
      );
    }
    throw error;
  }
}

/**
 * Apply environment variable overrides to config
 */
function applyEnvOverrides(config: ReviewerConfig): ReviewerConfig {
  const overrides = loadEnvOverrides();

  if (overrides.activeReviewers) {
    // Validate that all overridden reviewers exist in the config
    for (const reviewerName of overrides.activeReviewers) {
      if (!config.reviewers[reviewerName]) {
        throw new Error(
          `Environment override error: ACTIVE_REVIEWERS contains '${reviewerName}' ` +
          `which is not defined in the config file.\n` +
          `Available reviewers: ${Object.keys(config.reviewers).join(', ')}`
        );
      }
    }
    return {
      ...config,
      activeReviewers: overrides.activeReviewers,
    };
  }

  return config;
}

/**
 * Load reviewer configuration
 *
 * THROWS if:
 * - .devtools directory not found
 * - reviewers.config.json not found
 * - Config is invalid or missing required fields
 * - ACTIVE_REVIEWERS env var references undefined reviewers
 */
export async function loadReviewerConfig(projectPath: string = '.'): Promise<ReviewerConfig> {
  const fileConfig = await loadFromFile(projectPath);
  return applyEnvOverrides(fileConfig);
}

/**
 * Synchronous version for cases where async loading isn't possible
 *
 * THROWS if:
 * - .devtools directory not found
 * - reviewers.config.json not found
 * - Config is invalid or missing required fields
 * - ACTIVE_REVIEWERS env var references undefined reviewers
 */
export function loadReviewerConfigSync(projectPath: string = '.'): ReviewerConfig {
  const fileConfig = loadFromFileSync(projectPath);
  return applyEnvOverrides(fileConfig);
}
