/**
 * Act 5 `?act5=` save fixtures (N12 PR 1), in `./act5/`: the two carried bases (the end of L13's Phase H chain, run A and
 * run B: the whole of Act 4 played headless, the act ended, the camp at the Rimfoot fire) and one save per Act 5 quest id
 * made from base A by the `?act5=` jump's Act 5 step (inject `ACT5_PREREQS[id]`, the Rim Gate and Phase J flags, XP topped
 * to ACT5_START_XP, the player placed). The favour presets are applied on load, not stored.
 *
 *   SAVE_PHASE_H_END=1 npx vitest run src/integration/phaseH.runA src/integration/phaseH.runB   the bases (~10 min each)
 *   GEN_FIXTURES=1 npx vitest run src/integration/act5Fixtures.gen                          the 17 per-id and the extras
 */
import {
  act5BaseName, act5ExtraName, act5FixtureName, type Act5BaseMeta, type Act5FixtureMeta, type Act5Run,
} from '../../integration/act5FixtureKey';

export { act5BaseName, act5ExtraName, act5FixtureName, type Act5BaseMeta, type Act5FixtureMeta, type Act5Run };

async function readJson(rel: string): Promise<Record<string, unknown>> {
  const fsName = 'node:fs';
  const urlName = 'node:url';
  const { readFileSync } = (await import(/* @vite-ignore */ fsName)) as { readFileSync(p: string, enc: 'utf8'): string };
  const { fileURLToPath } = (await import(/* @vite-ignore */ urlName)) as { fileURLToPath(u: URL): string };
  return JSON.parse(readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')) as Record<string, unknown>;
}

/** Node only (tests). Each call returns a fresh object. */
export const readAct5Fixture = (id: string): Promise<Record<string, unknown>> => readJson(`./act5/${act5FixtureName(id)}.json`);
export const readAct5FixtureMeta = async (id: string): Promise<Act5FixtureMeta> =>
  (await readJson(`./act5/${act5FixtureName(id)}.meta.json`)) as unknown as Act5FixtureMeta;
export const readAct5Extra = (name: string): Promise<Record<string, unknown>> => readJson(`./act5/${act5ExtraName(name)}.json`);
export const readAct5Base = (run: Act5Run): Promise<Record<string, unknown>> => readJson(`./act5/${act5BaseName(run)}.json`);
export const readAct5BaseMeta = async (run: Act5Run): Promise<Act5BaseMeta> =>
  (await readJson(`./act5/${act5BaseName(run)}.meta.json`)) as unknown as Act5BaseMeta;
