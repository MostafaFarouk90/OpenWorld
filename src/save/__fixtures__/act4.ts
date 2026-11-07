/**
 * Act 4 `?act4=` save fixtures (L13), in `./act4/`: the carried base (the end of the shipped Phase F run B chain, the whole
 * of Act 3 played headless) and one save per Act 4 quest id made from it by the `?act4=` jump's Act 4 step (inject
 * `ACT4_PREREQS[id]`, XP topped to ACT4_START_XP, the player placed). Regenerate the per-id set with
 * `GEN_FIXTURES=1 npx vitest run src/integration/act4Fixtures.gen`; the base with `GEN_FIXTURES=1 BASE=1` on the same files
 * (about 40 minutes). The meta beside each says what was injected and which quest defs the generating build knew.
 */
import { ACT4_BASE_NAME, act4FixtureName, type Act4BaseMeta, type Act4FixtureMeta } from '../../integration/act4FixtureKey';

export { ACT4_BASE_NAME, act4FixtureName, type Act4BaseMeta, type Act4FixtureMeta };

async function readJson(rel: string): Promise<Record<string, unknown>> {
  const fsName = 'node:fs';
  const urlName = 'node:url';
  const { readFileSync } = (await import(/* @vite-ignore */ fsName)) as { readFileSync(p: string, enc: 'utf8'): string };
  const { fileURLToPath } = (await import(/* @vite-ignore */ urlName)) as { fileURLToPath(u: URL): string };
  return JSON.parse(readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')) as Record<string, unknown>;
}

/** Reads a fixture file (node only: tests). Returns a fresh object each call. */
export const readAct4Fixture = (id: string): Promise<Record<string, unknown>> => readJson(`./act4/${act4FixtureName(id)}.json`);
export const readAct4FixtureMeta = async (id: string): Promise<Act4FixtureMeta> =>
  (await readJson(`./act4/${act4FixtureName(id)}.meta.json`)) as unknown as Act4FixtureMeta;
export const readAct4Base = (): Promise<Record<string, unknown>> => readJson(`./act4/${ACT4_BASE_NAME}.json`);
export const readAct4BaseMeta = async (): Promise<Act4BaseMeta> =>
  (await readJson(`./act4/${ACT4_BASE_NAME}.meta.json`)) as unknown as Act4BaseMeta;

/** The Phase G chain's end saves (run A and run B, `SAVE_PHASE_G_END=1` on phaseG.runA/B): Phase H's chain starts from them. */
export const phaseGEndName = (run: 'a' | 'b'): string => `act4-phase-g-end-${run}`;
export const readPhaseGEnd = (run: 'a' | 'b'): Promise<Record<string, unknown>> => readJson(`./act4/${phaseGEndName(run)}.json`);
export const readPhaseGEndMeta = async (run: 'a' | 'b'): Promise<import('../../integration/phaseG.run').PhaseGEndMeta> =>
  (await readJson(`./act4/${phaseGEndName(run)}.meta.json`)) as never;
