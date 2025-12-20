import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      sourcemap: false,
      rollupOptions: {
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
    plugins: [externalizeDepsPlugin()],
    build: {
      sourcemap: false,
      rollupOptions: {
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
    plugins: [vue(), tailwindcss()],
    root: '.',
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
      watch: {
        usePolling: true,
        interval: 100,
      },
    },
    build: {
      sourcemap: false,
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
