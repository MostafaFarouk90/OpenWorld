import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

// vite.config exports a function (its base depends on the command); vitest runs as `serve`, so base stays '/'.
export default defineConfig((env) =>
  mergeConfig(
    viteConfig(env),
    defineConfig({
      resolve: {
        alias: [
          // Rapier only declares a "module" entry, which Vite's Node (SSR) resolution ignores.
          { find: /^@dimforge\/rapier3d$/, replacement: '@dimforge/rapier3d/rapier.js' },
        ],
      },
      test: {
        include: ['src/**/*.test.ts'],
        environment: 'node',
        // Run Rapier through Vite so vite-plugin-wasm handles its .wasm import; Node cannot.
        server: { deps: { inline: [/@dimforge\/rapier3d/] } },
      },
    }),
  ),
);
