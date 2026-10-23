/**
 * Writes the Act 2 Phase D save fixtures in src/save/__fixtures__/ from the Phase C complete save, through the same
 * deterministic generator as the Act 1 and Phase C ones (seeded random, fixed clock, sorted keys; fixtureDeterminism.ts):
 *
 *   GEN_FIXTURES=1 npx vitest run src/integration/fixtures.genD.test.ts
 *
 * Only writes when asked. A second test (always on) runs the generator twice and compares bytes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootFromSave, type ChapterHarness } from './chapterHarness';
import { ACT2_C_FIXTURES, readAct2CFixture } from '../save/__fixtures__/act2c';
import { ACT2_D_FIXTURES } from '../save/__fixtures__/act2d';
import { saveFixture, seedFixtureRandom } from './fixtureDeterminism';
import { begin, finish, finishThrough, playEndingCamp } from './act2dFixtures';

const env = () => (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const GEN = env().GEN_FIXTURES === '1';
/** `CHECK_FIXTURES=1` compares the generator's output with the committed files instead of writing (minutes long, so gated like the generator). */
const CHECK = !GEN && env().CHECK_FIXTURES === '1';

let h: ChapterHarness | null = null;
beforeEach(() => {
  seedFixtureRandom();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  h?.dispose();
  h = null;
  vi.restoreAllMocks();
});

const WHAT: Record<keyof typeof ACT2_D_FIXTURES, string> = {
  m17Start: 'Act 2 Phase D from act2-phase-c-complete-defeated: M16 completed, M17 not yet offered (Slagg gives it)',
  minesMid: 'Act 2 Phase D: M17, R08 to R10 completed; M18 active with the plaque and the pipes read; the player at the shaft head',
  m22Active: 'Act 2 Phase D: every Phase D quest but M22 completed (D04 too); M22 active with the keep reached and the Council heard',
  d04Complete: 'Act 2 Phase D: every Phase D quest but M22 completed (D04 last); M22 not yet offered; the act has not ended',
  actComplete: 'Act 2 complete: M22 completed after D04; gate a3 set once, the ending card seen, the camp scene run, Wenna at the camp',
};

/** Boots the Phase C complete save and walks it through the Phase D checkpoints, returning each fixture. */
async function generate(): Promise<Record<keyof typeof ACT2_D_FIXTURES, Record<string, unknown>>> {
  const t = await bootFromSave(await readAct2CFixture(ACT2_C_FIXTURES.completeDefeated), { models: false, virtualClock: true });
  h = t;
  const out = {} as Record<keyof typeof ACT2_D_FIXTURES, Record<string, unknown>>;
  await t.runAsync(60);
  finish(t, 'm16');
  out.m17Start = await saveFixture(t);
  finish(t, 'm17');
  for (const q of ['r08', 'r09', 'r10']) finish(t, q);
  begin(t, 'm18', ['brief', 'plaque', 'pipes']);
  await t.teleport(t.anchor('npc-post.slagg.shaft'), 4);
  out.minesMid = await saveFixture(t);
  finishThrough(t, 'ending');
  begin(t, 'm22', ['keep', 'council']);
  out.m22Active = await saveFixture(t);
  t.dispose();
  h = null;

  // D04 complete and M22 not yet offered: the same chain stopped one quest short, from the same Phase C save.
  const u = await bootFromSave(await readAct2CFixture(ACT2_C_FIXTURES.completeDefeated), { models: false, virtualClock: true });
  h = u;
  await u.runAsync(60);
  finishThrough(u, 'ending');
  out.d04Complete = await saveFixture(u);
  finish(u, 'm22');
  u.run(2);
  playEndingCamp(u);
  out.actComplete = await saveFixture(u);
  return out;
}

describe.skipIf(!GEN)('Act 2 Phase D fixtures (GEN_FIXTURES=1 writes them)', () => {
  it('writes the Phase D fixtures', async () => {
    const out = await generate();
    const fsName = 'node:fs';
    const cpName = 'node:child_process';
    const fs = (await import(/* @vite-ignore */ fsName)) as { writeFileSync(p: string, data: string): void };
    const cp = (await import(/* @vite-ignore */ cpName)) as { execSync(cmd: string): { toString(): string } };
    const dir = env().FIXTURES_OUT_DIR ?? 'src/save/__fixtures__';
    const commit = cp.execSync('git rev-parse HEAD').toString().trim();
    for (const k of Object.keys(ACT2_D_FIXTURES) as (keyof typeof ACT2_D_FIXTURES)[]) {
      expect(out[k], k).toBeDefined();
      const name = ACT2_D_FIXTURES[k];
      fs.writeFileSync(`${dir}/${name}.json`, JSON.stringify(out[k], null, 2) + '\n');
      const meta = {
        fixture: `${name}.json`,
        what: WHAT[k],
        generatedBy: 'GEN_FIXTURES=1 npx vitest run src/integration/fixtures.genD.test.ts',
        generatingCommit: commit,
        savedAt: 'fixed: Date.now() held at FIXTURE_SAVED_AT while saving',
        playtimeSeconds: 'rounded to whole seconds',
        source: 'the real save plugin (saveNow("manual")), read back from the fake IndexedDB slot-0',
      };
      fs.writeFileSync(`${dir}/${name}.meta.json`, JSON.stringify(meta, null, 2) + '\n');
    }
  }, 600_000);
});

describe.skipIf(!CHECK)('the committed Phase D fixtures equal what the generator writes now (CHECK_FIXTURES=1)', () => {
  it('is not stale against the Phase C complete fixture or the content', async () => {
    const out = await generate();
    const fsName = 'node:fs';
    const fs = (await import(/* @vite-ignore */ fsName)) as { readFileSync(p: string, enc: string): string };
    for (const k of Object.keys(ACT2_D_FIXTURES) as (keyof typeof ACT2_D_FIXTURES)[]) {
      const committed = JSON.parse(fs.readFileSync(`src/save/__fixtures__/${ACT2_D_FIXTURES[k]}.json`, 'utf8')) as Record<string, unknown>;
      expect(out[k], `${ACT2_D_FIXTURES[k]}.json is stale: regenerate it with GEN_FIXTURES=1`).toEqual(committed);
    }
  }, 600_000);
});

describe('the Phase D generator is deterministic', () => {
  it('two runs of the generator write identical fixtures', async () => {
    const run = async () => {
      vi.restoreAllMocks();
      seedFixtureRandom();
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(console, 'info').mockImplementation(() => {});
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const o = JSON.stringify(await generate());
      h?.dispose();
      h = null;
      return o;
    };
    const first = await run();
    const second = await run();
    expect(second).toBe(first);
  }, 900_000);
});
