/**
 * Reviewer adapter types and interfaces
 *
 * Architecture:
 * - BackendType: The infrastructure provider (ollama, openrouter, github-models)
 * - ReviewerName: User-defined name for a configured reviewer (e.g., "olmo-local")
 * - Each reviewer config specifies which backend to use and model settings
 */

/**
 * Backend type - the infrastructure provider
 * This is a fixed set of supported backends
 */
export type BackendType = 'ollama' | 'openrouter' | 'github-models';

/**
 * Reviewer name - user-defined string identifying a configured reviewer
 * Examples: "olmo-local", "olmo-cloud", "phi4-github"
 */
export type ReviewerName = string;

/**
 * Base configuration for all backends
 */
export interface BaseBackendConfig {
  /** Which backend type this reviewer uses */
  type: BackendType;
  /** The model identifier (format depends on backend) */
  model: string;
}

/**
 * Ollama-specific backend configuration
 */
export interface OllamaBackendConfig extends BaseBackendConfig {
  type: 'ollama';
  /** Ollama API base URL (default: http://localhost:11434) */
  baseUrl?: string;
}

/**
 * OpenRouter-specific backend configuration
 */
export interface OpenRouterBackendConfig extends BaseBackendConfig {
  type: 'openrouter';
  /** OpenRouter API endpoint (default: https://openrouter.ai/api/v1) */
  endpoint?: string;
  /** Temperature for generation (default: 0.3) */
  temperature?: number;
}

/**
 * GitHub Models-specific backend configuration
 */
export interface GitHubModelsBackendConfig extends BaseBackendConfig {
  type: 'github-models';
  /** GitHub Models API endpoint (default: https://models.inference.ai.azure.com) */
  endpoint?: string;
  /** Temperature for generation (default: 0.3) */
  temperature?: number;
}

/**
 * Union of all backend configurations
 */
export type ReviewerBackendConfig =
  | OllamaBackendConfig
  | OpenRouterBackendConfig
  | GitHubModelsBackendConfig;

/**
 * Main reviewer configuration
 */
export interface ReviewerConfig {
  /**
   * Ordered list of reviewer names to use
   * Each name must have a corresponding entry in 'reviewers' map
   */
  activeReviewers: ReviewerName[];

  /**
   * Map of reviewer name -> backend configuration
   * The key is the reviewer name, value specifies how to access it
   */
  reviewers: Record<ReviewerName, ReviewerBackendConfig>;
}

/**
 * Reviewer availability status
 */
export interface ReviewerAvailability {
  available: boolean;
  reason?: string;
  installInstructions?: string;
}

/**
 * Context for review requests
 */
export interface ReviewContext {
  projectPath: string;
  projectType?: string;
  additionalContext?: string;
}

/**
 * Review result from AI reviewer
 */
export interface ReviewResult {
  /** The reviewer name (user-defined, e.g., "olmo-local") */
  reviewer: ReviewerName;
  /** The backend type used (e.g., "ollama") */
  backendType: BackendType;
  /** The model used (e.g., "olmo-3.1:32b-think") */
  model: string;
  /** ISO timestamp of when the review was completed */
  timestamp: string;
  /** Main feedback text from the reviewer */
  feedback: string;
  /** List of suggestions for improvement */
  suggestions: string[];
  /** List of concerns or issues identified */
  concerns: string[];
  /** Whether the reviewer approved the spec */
  approved: boolean;
}

/**
 * Reviewer adapter interface
 */
export interface ReviewerAdapter {
  /** The reviewer name (user-defined) */
  name: ReviewerName;

  /** The backend type being used */
  backendType: BackendType;

  /** The model being used */
  model: string;

  /**
   * Check if the reviewer is available (service running, API key set, etc.)
   */
  checkAvailability(): Promise<ReviewerAvailability>;

  /**
   * Generate the shell command for the agent to execute.
   * The MCP tool returns this command; Claude Code runs it.
   */
  getReviewCommand(spec: string, context: ReviewContext): string;

  /**
   * Parse the output from the review command into structured feedback.
   */
  parseReviewOutput(output: string): ReviewResult;
}
