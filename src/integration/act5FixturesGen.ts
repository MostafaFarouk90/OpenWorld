/**
 * The Act 5 fixture generator's test body (act5Fixtures.gen.test.ts), N12 PR 1:
 *
 *   GEN_FIXTURES=1 npx vitest run src/integration/act5Fixtures.gen     the 17 per-id fixtures and the extras from base A
 *
 * The carried bases come from `SAVE_PHASE_H_END=1` on L13's phaseH.runA/B (act5CarriedBase.ts). `CHECK_FIXTURES=1`
 * compares the output with the committed files instead; `ONLY=m47,m52` or `ONLY=extra` narrows a run.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACT5_JUMP_IDS } from '../quests/act5Jump';
import { readAct5Base, readAct5BaseMeta, readAct5Fixture } from '../save/__fixtures__/act5';
import { seedFixtureRandom } from './fixtureDeterminism';
import { ACT5_EXTRAS, generateAct5Extra, generateAct5Fixture } from './act5Fixtures';
import { ACT5_FIXTURE_BASE_RUN, act5ExtraName, act5FixtureName } from './act5FixtureKey';
import { act5FixtureText } from './act5CarriedBase';

const env = () => (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const GEN = env().GEN_FIXTURES === '1';
const CHECK = !GEN && env().CHECK_FIXTURES === '1';
const ONLY = env().ONLY?.split(',').filter(Boolean) ?? null;

interface Fs { writeFileSync(p: string, data: string): void; readFileSync(p: string, enc: 'utf8'): string }
async function fsPorts(): Promise<{ fs: Fs; dir: string }> {
  const fsName = 'node:fs';
  const urlName = 'node:url';
  const fs = (await import(/* @vite-ignore */ fsName)) as Fs;
  const { fileURLToPath } = (await import(/* @vite-ignore */ urlName)) as { fileURLToPath(u: URL): string };
  return { fs, dir: fileURLToPath(new URL('../save/__fixtures__/act5/', import.meta.url)) };
}

function quiet(): void {
  seedFixtureRandom();
  for (const k of ['warn', 'info', 'error', 'log'] as const) vi.spyOn(console, k).mockImplementation(() => {});
}

export function defineAct5FixtureGenerator(): void {
  const cases = ACT5_JUMP_IDS.filter((id) => !ONLY || ONLY.includes(id));
  describe.runIf(GEN || CHECK)('Act 5 fixture generator', () => {
    beforeEach(quiet);
    afterEach(() => vi.restoreAllMocks());
    it.each(cases)('%s', async (id) => {
      const { fs, dir } = await fsPorts();
      const out = await generateAct5Fixture(await readAct5Base(ACT5_FIXTURE_BASE_RUN), await readAct5BaseMeta(ACT5_FIXTURE_BASE_RUN), id);
      const name = act5FixtureName(id);
      if (GEN) {
        fs.writeFileSync(`${dir}${name}.json`, act5FixtureText(out.save));
        fs.writeFileSync(`${dir}${name}.meta.json`, act5FixtureText(out.meta));
      } else {
        expect(act5FixtureText(out.save), `${name}.json drifted: regenerate`).toBe(fs.readFileSync(`${dir}${name}.json`, 'utf8'));
        expect(act5FixtureText(out.meta), `${name}.meta.json drifted: regenerate`).toBe(fs.readFileSync(`${dir}${name}.meta.json`, 'utf8'));
      }
    }, 180_000);
  });
}

/** The extras run after the per-id set (they start from it). */
export function defineAct5ExtraGenerator(): void {
  const cases = ACT5_EXTRAS.filter((e) => !ONLY || ONLY.includes('extra') || ONLY.includes(e.name));
  describe.runIf(GEN || CHECK)('Act 5 extra fixtures', () => {
    beforeEach(quiet);
    afterEach(() => vi.restoreAllMocks());
    it.each(cases.map((e) => [e.name, e] as const))('%s', async (_n, extra) => {
      const { fs, dir } = await fsPorts();
      const save = await generateAct5Extra(await readAct5Fixture(extra.from), extra);
      const name = act5ExtraName(extra.name);
      if (GEN) fs.writeFileSync(`${dir}${name}.json`, act5FixtureText(save));
      else expect(act5FixtureText(save), `${name}.json drifted: regenerate`).toBe(fs.readFileSync(`${dir}${name}.json`, 'utf8'));
    }, 180_000);
  });
}
