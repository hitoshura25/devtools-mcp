/**
 * Input sanitization utilities to prevent command injection attacks
 */

/**
 * Validates that a string contains only safe characters for shell arguments.
 * Allows alphanumeric, dots, dashes, underscores, forward slashes, and colons.
 */
export function isValidShellArg(value: string): boolean {
  // Allow empty strings
  if (value === '') return true;
  // Only allow safe characters
  return /^[a-zA-Z0-9._\-/:@]+$/.test(value);
}

/**
 * Validates a file path for shell command usage.
 * Allows alphanumeric, dots, dashes, underscores, forward slashes.
 */
export function isValidPath(path: string): boolean {
  if (path === '' || path === '.') return true;
  // Only allow safe path characters (no backticks, $, ;, |, etc.)
  return /^[a-zA-Z0-9._\-/]+$/.test(path);
}

/**
 * Validates a color string (hex color or color name).
 */
export function isValidColor(color: string): boolean {
  if (color === '') return true;
  // Hex color: #RGB, #RRGGBB, #RRGGBBAA
  if (/^#[0-9a-fA-F]{3,8}$/.test(color)) return true;
  // Named colors (alphanumeric only)
  if (/^[a-zA-Z]+$/.test(color)) return true;
  return false;
}

/**
 * Validates a search term for shell command usage.
 * Allows alphanumeric, spaces, dashes, and underscores.
 */
export function isValidSearchTerm(term: string): boolean {
  if (term === '') return false;
  // Only allow safe search characters
  return /^[a-zA-Z0-9 _-]+$/.test(term);
}

/**
 * Validates a Gradle module name.
 * Allows alphanumeric, dashes, underscores.
 */
export function isValidModuleName(module: string): boolean {
  if (module === '') return false;
  return /^[a-zA-Z0-9_-]+$/.test(module);
}

/**
 * Validates a build type (debug or release).
 */
export function isValidBuildType(buildType: string): boolean {
  return buildType === 'debug' || buildType === 'release';
}

/**
 * Validates a test filter pattern.
 * Allows alphanumeric, dots, asterisks, dashes, underscores.
 */
export function isValidTestFilter(filter: string): boolean {
  if (filter === '') return true;
  return /^[a-zA-Z0-9._*-]+$/.test(filter);
}

/**
 * Validates a keystore alias.
 * Allows alphanumeric, dashes, underscores.
 */
export function isValidKeystoreAlias(alias: string): boolean {
  if (alias === '') return false;
  return /^[a-zA-Z0-9_-]+$/.test(alias);
}

/**
 * Sanitizes a shell argument by validating and throwing if invalid.
 * @throws Error if the value contains unsafe characters
 */
export function sanitizeShellArg(value: string, argName: string): string {
  if (!isValidShellArg(value)) {
    throw new Error(
      `Invalid ${argName}: contains unsafe characters. Only alphanumeric, dots, dashes, underscores, forward slashes, and colons are allowed.`
    );
  }
  return value;
}

/**
 * Sanitizes a path by validating and throwing if invalid.
 * @throws Error if the path contains unsafe characters
 */
export function sanitizePath(path: string, argName: string = 'path'): string {
  if (!isValidPath(path)) {
    throw new Error(
      `Invalid ${argName}: contains unsafe characters. Only alphanumeric, dots, dashes, underscores, and forward slashes are allowed.`
    );
  }
  return path;
}
