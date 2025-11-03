import { defineConfig } from 'vite';
import { builtinModules } from 'module';
import path from 'path';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      external: [
        'electron',
        'better-sqlite3',
        ...builtinModules.flatMap((m) => [m, `node:${m}`]),
      ],
      output: {
        format: 'cjs',
      },
    },
    sourcemap: true,
    minify: true,
  },
  resolve: {
    browserField: false,
    conditions: ['node'],
    mainFields: ['module', 'jsnext:main', 'jsnext'],
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
