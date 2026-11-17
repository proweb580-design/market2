import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    globalSetup: ['test/global-setup.ts'],
    // DB test files share one database, so they run one after another.
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
