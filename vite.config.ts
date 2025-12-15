import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

export default defineConfig(({ mode }) => {
  const isServer = mode === 'server';

  if (isServer) {
    // Server build configuration
    return {
      build: {
        outDir: 'dist/server',
        ssr: true,
        lib: {
          entry: {
            index: resolve(__dirname, 'src/server/server.ts'),
            worker: resolve(__dirname, 'src/core/database-worker.ts'),
          },
          formats: ['es'],
        },
        rollupOptions: {
          output: {
            entryFileNames: '[name].js',
          },
          external: [
            /^node:/,
            'better-sqlite3',
            'express',
            'cors',
            'ffmpeg-static',
            'dotenv',
          ],
        },
        minify: false,
      },
    };
  }

  // Frontend build configuration
  return {
    plugins: [vue(), tailwindcss()],
    root: '.',
    server: {
      clearScreen: false,
      host: '0.0.0.0',
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:3000',
          changeOrigin: true,
        },
      },
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer'),
      },
    },
    build: {
      outDir: 'dist/client',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'index.html'),
        },
      },
    },
  };
});
