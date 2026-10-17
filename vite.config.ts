import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2022',
  },
  worker: {
    // Terrain worker pool modules are bundled as ES modules.
    format: 'es',
  },
});
