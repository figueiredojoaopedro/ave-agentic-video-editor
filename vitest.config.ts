import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'packages/*/test/**/*.test.ts',
      'apps/*/backend/test/**/*.test.ts',
      'apps/*/frontend/test/**/*.test.ts',
      'apps/*/frontend/test/**/*.test.tsx',
    ],
    environment: 'node',
  },
});
