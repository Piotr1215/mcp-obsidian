import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    // Don't pick up test copies inside git worktrees (.claude/worktrees/*) —
    // parallel duplicate runs race on shared temp fixtures and flake.
    exclude: ['**/node_modules/**', '**/.claude/**'],
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
        'coverage/**'
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