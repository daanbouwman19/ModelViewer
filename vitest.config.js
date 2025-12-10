import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  test: {
    globals: true,
    environment: 'happy-dom',
    testTimeout: 10000,
    include: ['tests/**/*.{test,spec}.{js,ts}'],
    exclude: ['node_modules', 'out', 'release', '.vite', 'dist'],
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'json', 'html', 'lcov'],
      all: true,
      include: [
        'src/main/**/*.{js,ts}',
        'src/renderer/**/*.{js,ts}',
        'src/renderer/**/*.vue',
        'src/core/**/*.{js,ts}',
        'src/server/**/*.{js,ts}',
      ],
      exclude: [
        'src/main/main.ts',
        'src/preload/**',
        'src/renderer/renderer.ts',
        'src/renderer/components/icons/**',
        '**/*.{test,spec}.{js,ts}',
      ],
      reportsDirectory: './coverage',
      thresholds: {
        perFile: true,
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer'),
    },
  },
});
