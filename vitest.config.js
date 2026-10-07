import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      exclude: [
        'node_modules/**',
        'tests/**',
        '**/*.test.js',
        '**/*.spec.js',
        '**/*.config.js',
        '**/*.config.mjs',
        'coverage/**',
        // The stdio entrypoint only runs as a child process, which v8 coverage
        // cannot see. tests/vault.test.js starts it over stdio with an SDK client.
        'src/index.js'
      ],
      include: [
        'src/**/*.js'
      ],
      thresholds: {
        branches: 67,
        functions: 67,
        lines: 67,
        statements: 67
      }
    }
  }
});