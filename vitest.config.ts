import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'tests/unit/**/*.{test,spec}.{ts,tsx}',
      'src/**/*.{test,spec}.{ts,tsx}',
    ],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/.vercel/**',
      '**/.firebase/**',
      '**/.codex/**',
      '**/.codex-isolated/**',
      '**/.codex-worktrees/**',
      '**/codex-worktrees/**',
      '**/reports/**',
      '**/functions/lib/**',
      'tests/unit/classProgramDraftsService.spec.ts',
      'tests/unit/classProgramPickerFilters.spec.ts',
      'tests/unit/classPrograms.spec.ts',
    ],
    pool: 'threads',
    watch: false,
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});
