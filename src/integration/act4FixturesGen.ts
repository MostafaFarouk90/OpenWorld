/**
 * The Act 4 fixture generator's test body (act4Fixtures.gen.test.ts and act4Fixtures.gen.base.test.ts):
 *
 *   GEN_FIXTURES=1 npx vitest run src/integration/act4Fixtures.gen.test      the 21 per-id fixtures from the committed base
 *   GEN_FIXTURES=1 BASE=1 npx vitest run src/integration/act4Fixtures.gen.base   the carried base (the Phase F chain, ~40 min)
 *
 * `CHECK_FIXTURES=1` compares the per-id output with the committed files instead; `ONLY=m35,m41` narrows a run.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACT4_JUMP_IDS } from '../quests/act4Jump';
import { ACT4_BASE_NAME, act4FixtureName, readAct4Base, readAct4BaseMeta } from '../save/__fixtures__/act4';
import { seedFixtureRandom } from './fixtureDeterminism';
import { ACT4_EXTRAS, act4ExtraName, generateAct4Base, generateAct4Extra, generateAct4Fixture } from './act4Fixtures';
import { readAct4Fixture } from '../save/__fixtures__/act4';

const env = () => (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const GEN = env().GEN_FIXTURES === '1';
const CHECK = !GEN && env().CHECK_FIXTURES === '1';
const BASE = env().BASE === '1';
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
  return { fs, dir: fileURLToPath(new URL('../save/__fixtures__/act4/', import.meta.url)) };
}
export const fixtureText = (v: unknown): string => `${JSON.stringify(v, null, 2)}\n`;

function quiet(): void {
  seedFixtureRandom();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
}

export function defineAct4BaseGenerator(): void {
  describe.runIf(GEN && BASE)('Act 4 carried base generator (the Phase F run B chain)', () => {
    beforeEach(quiet);
    afterEach(() => vi.restoreAllMocks());
    it('plays Act 3 and saves the base', async () => {
      const { fs, dir } = await fsPorts();
      const out = await generateAct4Base();
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(`${dir}${ACT4_BASE_NAME}.json`, fixtureText(out.save));
      fs.writeFileSync(`${dir}${ACT4_BASE_NAME}.meta.json`, fixtureText(out.meta));
    }, 3_600_000);
  });
}

export function defineAct4FixtureGenerator(): void {
  const cases = ACT4_JUMP_IDS.filter((id) => !ONLY || ONLY.includes(id));
  describe.runIf((GEN && !BASE) || CHECK)('Act 4 fixture generator', () => {
    beforeEach(quiet);
    afterEach(() => vi.restoreAllMocks());
    it.each(cases)('%s', async (id) => {
      const { fs, dir } = await fsPorts();
      const out = await generateAct4Fixture(await readAct4Base(), await readAct4BaseMeta(), id);
      const name = act4FixtureName(id);
      if (GEN) {
        fs.writeFileSync(`${dir}${name}.json`, fixtureText(out.save));
        fs.writeFileSync(`${dir}${name}.meta.json`, fixtureText(out.meta));
      } else {
        expect(fixtureText(out.save), `${name}.json drifted: regenerate`).toBe(fs.readFileSync(`${dir}${name}.json`, 'utf8'));
        expect(fixtureText(out.meta), `${name}.meta.json drifted: regenerate`).toBe(fs.readFileSync(`${dir}${name}.meta.json`, 'utf8'));
      }
    }, 180_000);
  });
}

/** The extras run after the per-id set (they start from it); `ONLY=extra` narrows to them. */
export function defineAct4ExtraGenerator(): void {
  const cases = ACT4_EXTRAS.filter((e) => !ONLY || ONLY.includes('extra') || ONLY.includes(e.name));
  describe.runIf((GEN && !BASE) || CHECK)('Act 4 extra fixtures', () => {
    beforeEach(quiet);
    afterEach(() => vi.restoreAllMocks());
    it.each(cases.map((e) => [e.name, e] as const))('%s', async (_n, extra) => {
      const { fs, dir } = await fsPorts();
      const save = await generateAct4Extra(await readAct4Fixture(extra.from), extra);
      const name = act4ExtraName(extra.name);
      if (GEN) fs.writeFileSync(`${dir}${name}.json`, fixtureText(save));
      else expect(fixtureText(save), `${name}.json drifted: regenerate`).toBe(fs.readFileSync(`${dir}${name}.json`, 'utf8'));
    }, 180_000);
  });
}
