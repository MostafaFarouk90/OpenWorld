import { configDefaults, defineConfig, mergeConfig } from 'vitest/config';
import { CHAIN_FILES } from './vitest.chains';
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
        // the whole-phase chains run on their own (vitest.chains.config.ts, `npm run test:chains`)
        exclude: [...configDefaults.exclude, ...CHAIN_FILES],
        environment: 'node',
        // Run Rapier through Vite so vite-plugin-wasm handles its .wasm import; Node cannot.
        server: { deps: { inline: [/@dimforge\/rapier3d/] } },
        // Each test file runs in its own forked worker. The heaviest boot whole games repeatedly (src/save/act2Migration.test.ts
        // peaks at about 3.4 GB) and outgrow Node's default heap (about 2 GB), which kills the worker: "Worker exited
        // unexpectedly" fails the run while every test reports green, and the file silently never runs.
        poolOptions: { forks: { execArgv: ['--max-old-space-size=6144'] } },
      },
    }),
  ),
);
