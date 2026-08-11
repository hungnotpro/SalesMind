import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Integration tests share a single PostgreSQL database. Running
    // test files in parallel can cause deadlocks on TRUNCATE. Run
    // files sequentially within a single Vitest worker.
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['**/*.test.ts', '**/node_modules/**']
    }
  }
});
