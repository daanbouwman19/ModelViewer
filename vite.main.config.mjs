import { defineConfig } from 'vite';
import { builtinModules } from 'module';
import path from 'path';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      external: [
        'electron',
        'sqlite3',
        ...builtinModules.flatMap((m) => [m, `node:${m}`]),
      ],
      output: {
        format: 'cjs',
      },
    },
    sourcemap: true,
    minify: process.env.NODE_ENV === 'production',
    brotliSize: false,
    chunkSizeWarningLimit: 2048,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
