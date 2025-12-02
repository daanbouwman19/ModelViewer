import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  test: {
    globals: true,
    environment: 'happy-dom',
    testTimeout: 10000,
    include: ['tests/**/*.test.js'],
    exclude: ['node_modules', 'out', 'release', '.vite', 'dist'],
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'json', 'html', 'lcov'],
      all: true,
      include: [
        'src/main/**/*.js',
        'src/renderer/**/*.js',
        'src/renderer/**/*.vue',
      ],
      exclude: [
        'src/main/main.js',
        'src/preload/**',
        'src/renderer/renderer.js',
        '**/*.test.js',
        '**/*.spec.js',
      ],
      reportsDirectory: './coverage',
      thresholds: {
        global: {
          statements: 80,
          branches: 80,
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
