import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';

export default defineConfig(({ command }) => ({
  // The built site is served from https://mostafafarouk90.github.io/OpenWorld/; dev keeps serving from /.
  // Runtime asset URLs go through import.meta.env.BASE_URL, which Vite sets from this.
  base: command === 'build' ? '/OpenWorld/' : '/',
  // Rapier ships its WASM as an ES module import, which plain Vite rejects.
  plugins: [wasm()],
  build: {
    // es2022 includes top-level await, which the WASM plugin's generated code relies on.
    target: 'es2022',
  },
  optimizeDeps: {
    // Pre-bundling would strip the .wasm import; let vite-plugin-wasm serve it instead.
    exclude: ['@dimforge/rapier3d'],
  },
  worker: {
    // Terrain worker pool modules are bundled as ES modules.
    format: 'es',
  },
}));
