import { defineConfig } from 'vite';

export default defineConfig({
  publicDir: false,
  optimizeDeps: { entries: ['index.html'] },
  build: { outDir: 'artifacts/build/web' },
});
