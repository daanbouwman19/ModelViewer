import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.test.js', '**/*.spec.js'],
    exclude: ['node_modules', 'out', 'release', '.vite', 'dist'],
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'json', 'html', 'lcov'],
      all: true,
      include: [
        'src/main/database-worker-functions.js',
        'src/main/constants.js',
        'src/main/media-scanner.js',
        'src/renderer/composables/useSlideshow.js',
        'src/renderer/composables/useAppState.js',
      ],
      reportsDirectory: './coverage',
      thresholds: {
        global: {
          statements: 80,
          branches: 50,
          functions: 80,
          lines: 80,
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer'),
    },
  },
});
