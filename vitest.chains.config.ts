// Only the `chains` group (vitest.chains.ts): `npm run test:chains`, or with `--shard=<n>/<m>` as the CI `chains` job runs it.
import { configDefaults, defineConfig, mergeConfig } from 'vitest/config';
import base from './vitest.config';
import { CHAIN_FILES } from './vitest.chains';

export default defineConfig(async (env) => {
  const cfg = await (base as unknown as (e: typeof env) => Promise<Record<string, any>> | Record<string, any>)(env);
  const merged = mergeConfig(cfg, {});
  merged.test = { ...merged.test, include: [...CHAIN_FILES], exclude: [...configDefaults.exclude] };
  return merged;
});
