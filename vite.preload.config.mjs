import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      external: ['electron'],
    },
    sourcemap: true,
    minify: process.env.NODE_ENV === 'production',
    brotliSize: false,
    chunkSizeWarningLimit: 2048,
  },
});
