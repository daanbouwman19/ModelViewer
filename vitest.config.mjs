import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
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
          statements: 60,
          branches: 45,
          functions: 60,
          lines: 60,
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
