/**
 * Act 3 `?act3=` save fixtures (K16): one per Act 3 quest id and block order, in `./act3/`, written by the real save plugin
 * right after K0's jump settles on a fresh game (src/integration/act3Fixtures.ts; regenerate with
 * `GEN_FIXTURES=1 npx vitest run src/integration/act3Fixtures.gen`). The meta beside each names what was injected
 * and the quest defs the generating build knew, which is how `?act3=` tells a fixture that a quest thread has since
 * outdated (it then falls back to flag injection; src/integration/act3FixtureKey.ts).
 */
import type { Act3Order } from '../../quests/act3Jump';
import { act3FixtureName, type Act3FixtureMeta } from '../../integration/act3FixtureKey';

export { act3FixtureName, type Act3FixtureMeta };

async function readJson(rel: string): Promise<Record<string, unknown>> {
  const fsName = 'node:fs';
  const urlName = 'node:url';
  const { readFileSync } = (await import(/* @vite-ignore */ fsName)) as { readFileSync(p: string, enc: 'utf8'): string };
  const { fileURLToPath } = (await import(/* @vite-ignore */ urlName)) as { fileURLToPath(u: URL): string };
  return JSON.parse(readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')) as Record<string, unknown>;
}

/** Reads a fixture file (node only: tests). Returns a fresh object each call. */
export const readAct3Fixture = (order: Act3Order, id: string): Promise<Record<string, unknown>> =>
  readJson(`./act3/${act3FixtureName(order, id)}.json`);
export const readAct3FixtureMeta = async (order: Act3Order, id: string): Promise<Act3FixtureMeta> =>
  (await readJson(`./act3/${act3FixtureName(order, id)}.meta.json`)) as unknown as Act3FixtureMeta;
