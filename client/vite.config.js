import { defineConfig } from 'vite';

// base is '/inkbattle/' for the production build (GitHub Pages project site)
// but '/' during dev so the local server/preview works at the root.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/inkbattle/' : '/',
  server: {
    host: true,
    port: 5173,
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
  },
}));
