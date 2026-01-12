import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
  resolve: {
    alias: {
      '@hitoshura25/core': resolve(__dirname, './src/index.ts'),
    },
  },
});
