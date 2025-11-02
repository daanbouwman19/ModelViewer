import { defineConfig } from 'vite';
import { builtinModules } from 'module';
import path from 'path';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      // Only external Node.js built-in modules and native modules
      // All local files will be bundled
      external: [
        'electron',
        'better-sqlite3',
        ...builtinModules.flatMap(m => [m, `node:${m}`])
      ],
      output: {
        format: 'cjs',
      },
    },
    sourcemap: true,
    minify: false, // Don't minify for easier debugging
  },
  resolve: {
    // Some libs that can run in both Web and Node.js, we need to tell Vite to build them in Node.js.
    browserField: false,
    conditions: ['node'],
    mainFields: ['module', 'jsnext:main', 'jsnext'],
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
