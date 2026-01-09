/**
 * Android-specific language configuration for implement workflow
 */

import type { LanguageConfig } from '@hitoshura25/core';

export const androidConfig: LanguageConfig = {
  name: 'Android',
  commands: {
    lint: './gradlew lint',
    build: './gradlew assembleDebug',
    test: './gradlew testDebugUnitTest',
  },
  testFilePatterns: ['**/src/test/**/*Test.kt', '**/src/androidTest/**/*Test.kt'],
  sourceFilePatterns: ['**/src/main/**/*.kt', '**/src/main/**/*.java'],
  specsDir: 'specs/',
};
