import { defineConfig } from 'vite';

export default defineConfig({
  // The base URL for the repository on GitHub Pages
  base: '/torneio-ilog/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  }
});
