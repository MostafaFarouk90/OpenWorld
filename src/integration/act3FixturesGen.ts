/**
 * The Act 3 fixture generator's test body, one file per block order (act3Fixtures.gen.greyfen.test.ts and
 * act3Fixtures.gen.spine.test.ts): 21 fresh boots per worker, since one worker running all 42 runs out of heap.
 *
 *   GEN_FIXTURES=1 npx vitest run src/integration/act3Fixtures.gen
 *
 * writes the 42 fixtures (21 quest ids x 2 block orders) into src/save/__fixtures__/act3/; `CHECK_FIXTURES=1` compares
 * the generator's output with the committed files instead (minutes long, so gated like the generator); `ONLY=greyfen:m23`
 * narrows a run. The always-on byte comparison of a sample is act3Fixtures.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACT3_JUMP_IDS, type Act3Order } from '../quests/act3Jump';
import { act3FixtureName } from '../save/__fixtures__/act3';
import { seedFixtureRandom } from './fixtureDeterminism';
import { generateAct3Fixture } from './act3Fixtures';

const env = () => (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const GEN = env().GEN_FIXTURES === '1';
const CHECK = !GEN && env().CHECK_FIXTURES === '1';
/** `ONLY=greyfen:m23,spine:m28` narrows a run (a quick regeneration of the fixtures a quest thread touched). */
const ONLY = env().ONLY?.split(',').filter(Boolean) ?? null;




interface Fs {
  mkdirSync(p: string, o: { recursive: true }): void;
  writeFileSync(p: string, data: string): void;
  readFileSync(p: string, enc: 'utf8'): string;
}
async function fsPorts(): Promise<{ fs: Fs; dir: string }> {
  const fsName = 'node:fs';
  const urlName = 'node:url';
  const fs = (await import(/* @vite-ignore */ fsName)) as Fs;
  const { fileURLToPath } = (await import(/* @vite-ignore */ urlName)) as { fileURLToPath(u: URL): string };
  return { fs, dir: fileURLToPath(new URL('../save/__fixtures__/act3/', import.meta.url)) };
}
const text = (v: unknown) => `${JSON.stringify(v, null, 2)}\n`;

export function defineAct3FixtureGenerator(order: Act3Order): void {
  const cases = ACT3_JUMP_IDS.filter((id) => !ONLY || ONLY.includes(`${order}:${id}`));
  describe.runIf(GEN || CHECK)(`Act 3 fixture generator (${order} first)`, () => {
    beforeEach(() => {
      seedFixtureRandom();
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(console, 'info').mockImplementation(() => {});
      vi.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(() => vi.restoreAllMocks());

    it.each(cases)('%s', async (id) => {
      const { fs, dir } = await fsPorts();
      const out = await generateAct3Fixture(id, order);
      const name = act3FixtureName(order, id);
      if (GEN) {
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(`${dir}${name}.json`, text(out.save));
        fs.writeFileSync(`${dir}${name}.meta.json`, text(out.meta));
      } else {
        expect(text(out.save), `${name}.json drifted: regenerate`).toBe(fs.readFileSync(`${dir}${name}.json`, 'utf8'));
        expect(text(out.meta), `${name}.meta.json drifted: regenerate`).toBe(fs.readFileSync(`${dir}${name}.meta.json`, 'utf8'));
      }
    }, 180_000);
  });
}
