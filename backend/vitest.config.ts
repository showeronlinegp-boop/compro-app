import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    pool: 'forks',
    // Run test files sequentially (maxForks: 1) to prevent cross-file DB pollution.
    // Tests using truncateAll() commit data that could be seen by concurrent forks;
    // sequential execution guarantees clean isolation without per-test process setup.
    poolOptions: {
      forks: {
        maxForks: 1,
      },
    },
    include: ['src/**/*.test.ts'],
    globals: false,
    environment: 'node',
    globalSetup: ['src/test/global-setup.ts'],
  },
});
