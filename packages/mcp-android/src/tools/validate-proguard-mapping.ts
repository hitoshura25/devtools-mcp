import { ToolResult } from '@hitoshura25/core';
import { existsSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

export interface ValidateMappingParams {
  project_path?: string;
  module?: string;
  build_type?: string;
}

export interface ValidateMappingResult {
  exists: boolean;
  path: string;
  size_bytes: number;
  line_count: number;
  classes_mapped: number;
  methods_mapped: number;
}

export async function validateProguardMapping(
  params: ValidateMappingParams
): Promise<ToolResult<ValidateMappingResult>> {
  const startTime = Date.now();
  const steps: string[] = [];
  const projectPath = params.project_path || '.';
  const module = params.module || 'app';
  const buildType = params.build_type || 'release';

  // 1. Construct mapping file path
  const mappingPath = join(projectPath, module, 'build', 'outputs', 'mapping', buildType, 'mapping.txt');
  steps.push('path_constructed');

  // 2. Check if mapping file exists
  if (!existsSync(mappingPath)) {
    return {
      success: false,
      error: {
        code: 'MAPPING_NOT_FOUND',
        message: `ProGuard mapping file not found at: ${mappingPath}`,
        details: 'The mapping file is required for crash reporting and debugging',
        suggestions: [
          'Ensure minifyEnabled is set to true in build.gradle.kts',
          'Build the project first using validate_release_build',
          'Check that ProGuard/R8 is configured correctly',
        ],
        recoverable: true,
      },
      duration_ms: Date.now() - startTime,
      steps_completed: steps,
    };
  }
  steps.push('file_found');

  // 3. Read and analyze mapping file
  const content = readFileSync(mappingPath, 'utf-8');
  const lines = content.split('\n');
  const size = statSync(mappingPath).size;

  // Count classes (lines that don't start with whitespace and contain ->)
  const classMappings = lines.filter(
    (line) => line.trim().length > 0 && !line.startsWith(' ') && line.includes('->')
  );

  // Count methods (lines that start with whitespace and contain ->)
  const methodMappings = lines.filter(
    (line) => line.trim().length > 0 && line.startsWith(' ') && line.includes('->')
  );

  steps.push('mapping_analyzed');

  // 4. Validate mapping is substantial
  if (size < 1000) {
    return {
      success: false,
      error: {
        code: 'MAPPING_TOO_SMALL',
        message: `Mapping file is suspiciously small (${size} bytes)`,
        details: 'This suggests ProGuard/R8 is not properly minifying the code',
        suggestions: [
          'Check ProGuard rules are not keeping everything',
          'Verify minification is enabled in build configuration',
          'Review proguard-rules.pro file',
        ],
        recoverable: true,
      },
      duration_ms: Date.now() - startTime,
      steps_completed: steps,
    };
  }

  return {
    success: true,
    data: {
      exists: true,
      path: mappingPath,
      size_bytes: size,
      line_count: lines.length,
      classes_mapped: classMappings.length,
      methods_mapped: methodMappings.length,
    },
    duration_ms: Date.now() - startTime,
    steps_completed: steps,
  };
}
