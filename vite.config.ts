import { defineConfig } from 'vite';

export default defineConfig({
  root: 'web',
  build: { outDir: 'dist', emptyOutDir: true },
  server: {
    host: true,
    proxy: { '/api': 'http://localhost:3000' },
  },
});
