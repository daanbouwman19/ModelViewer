import { defineConfig } from 'electron-vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import { visualizer } from 'rollup-plugin-visualizer';
import { resolve } from 'path';

export default defineConfig({
  main: {
    build: {
      sourcemap: 'hidden',
      rollupOptions: {
        external: [/^electron(\/.*)?$/, 'better-sqlite3'],
        input: {
          index: resolve(__dirname, 'src/main/main.ts'),
          // database-worker must be a separate entry because Node.js Worker requires a file path
          'database-worker': resolve(__dirname, 'src/main/database-worker.ts'),
          'scan-worker': resolve(__dirname, 'src/core/scan-worker.ts'),
        },
      },
    },
  },
  preload: {
    build: {
      sourcemap: 'hidden',
      rollupOptions: {
        external: [/^electron(\/.*)?$/],
        input: {
          preload: resolve(__dirname, 'src/preload/preload.ts'),
        },
        output: {
          format: 'cjs',
        },
      },
    },
  },
  renderer: {
    plugins: [
      vue(),
      tailwindcss(),
      visualizer({
        filename: './out/renderer/stats.html',
        open: false,
      }),
    ],
    root: '.',
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
      watch: {
        usePolling: !!process.env.USE_POLLING,
        interval: 100,
      },
    },
    build: {
      sourcemap: 'hidden',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'index.html'),
        },
      },
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer'),
      },
    },
  },
});
