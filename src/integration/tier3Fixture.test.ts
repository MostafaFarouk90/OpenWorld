/**
 * Tier 3 skills (Act 2, A11) against saves. The Act 1 class-chosen fixture must load with no tier 3 granted, and
 * `act2-tier3-warden-learned` (written here by the real save plugin from that save with the Warden's Hewer chain learned
 * through tier 3) must load with the learned list intact. Regenerate it with
 * `GEN_FIXTURES=1 npx vitest run src/integration/tier3Fixture.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootFromSave, type ChapterHarness } from './chapterHarness';
import { readAct1Fixture, ACT1_FIXTURES } from '../save/__fixtures__/act1';
import { FIXTURE_SAVED_AT } from '../save/__fixtures__/phaseA';
import { getSkill } from '../progression/skills';

const GEN = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.GEN_FIXTURES === '1';
const NAME = 'act2-tier3-warden-learned';
const CHAIN = ['warden.cleavingSwing', 'warden.deepWound', 'warden.whirlingHew'];

let h: ChapterHarness | null = null;
beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => {
  h?.dispose();
  h = null;
  vi.restoreAllMocks();
});

const prog = (t: ChapterHarness) => t.ctx.services.require('progression') as unknown as {
  learned(id: string): boolean;
  learnedIds?: string[];
  skillPoints: number;
  grantSkillPoint(n: number, why: string): void;
  learn(id: string): { ok: boolean };
  classId: string | null;
};

async function readNamed(): Promise<Record<string, unknown>> {
  const fsName = 'node:fs';
  const urlName = 'node:url';
  const { readFileSync } = (await import(/* @vite-ignore */ fsName)) as { readFileSync(p: string, enc: 'utf8'): string };
  const { fileURLToPath } = (await import(/* @vite-ignore */ urlName)) as { fileURLToPath(u: URL): string };
  return JSON.parse(readFileSync(fileURLToPath(new URL(`../save/__fixtures__/${NAME}.json`, import.meta.url)), 'utf8')) as Record<string, unknown>;
}

describe('tier 3 and saves', () => {
  it('an Act 1 class-chosen save loads without any tier 3 skill', async () => {
    const t = await bootFromSave(await readAct1Fixture(ACT1_FIXTURES.m07ClassChosen), { models: true, virtualClock: true });
    h = t;
    expect(t.loaded).toBe(true);
    const p = prog(t);
    expect(p.classId).toBe('warden');
    for (const id of ['warden.whirlingHew', 'warden.gritTeeth', 'warden.bloodChant']) expect(p.learned(id)).toBe(false);
    expect(getSkill('warden.whirlingHew')!.availableWhen).toBe(true);
  }, 120_000);

  it.skipIf(!GEN)('writes the tier 3 fixture', async () => {
    const t = await bootFromSave(await readAct1Fixture(ACT1_FIXTURES.m07ClassChosen), { models: true, virtualClock: true });
    h = t;
    const p = prog(t);
    p.grantSkillPoint(6, 'test');
    for (const id of CHAIN) expect(p.learn(id).ok).toBe(true);
    await t.runAsync(5);
    const now = vi.spyOn(Date, 'now').mockReturnValue(FIXTURE_SAVED_AT);
    try {
      const out = await t.ctx.services.require('save').saveNow('manual');
      await t.flush();
      expect(out.ok).toBe(true);
    } finally {
      now.mockRestore();
    }
    const raw = JSON.parse(JSON.stringify(t.fake.peek('slot-0'))) as Record<string, unknown>;
    raw.playtimeSeconds = Math.round(raw.playtimeSeconds as number);
    const fsName = 'node:fs';
    const cpName = 'node:child_process';
    const fs = (await import(/* @vite-ignore */ fsName)) as { writeFileSync(p: string, d: string): void };
    const cp = (await import(/* @vite-ignore */ cpName)) as { execSync(c: string): { toString(): string } };
    fs.writeFileSync(`src/save/__fixtures__/${NAME}.json`, JSON.stringify(raw, null, 2) + '\n');
    fs.writeFileSync(
      `src/save/__fixtures__/${NAME}.meta.json`,
      JSON.stringify(
        {
          fixture: `${NAME}.json`,
          what: 'act1-m07-class-chosen with the Warden Hewer chain learned through tier 3 (cleavingSwing, deepWound, whirlingHew)',
          generatedBy: 'GEN_FIXTURES=1 npx vitest run src/integration/tier3Fixture.test.ts',
          generatingCommit: cp.execSync('git rev-parse HEAD').toString().trim(),
          savedAt: 'fixed: Date.now() held at FIXTURE_SAVED_AT while saving',
          playtimeSeconds: 'rounded to whole seconds',
          source: 'the real save plugin (saveNow("manual")), read back from the fake IndexedDB slot-0',
        },
        null,
        2,
      ) + '\n',
    );
  }, 120_000);

  it('the tier 3 fixture loads with the learned list intact', async () => {
    const t = await bootFromSave(await readNamed(), { models: true, virtualClock: true });
    h = t;
    expect(t.loaded).toBe(true);
    const p = prog(t);
    for (const id of CHAIN) expect(p.learned(id)).toBe(true);
    expect(p.learned('warden.bloodChant')).toBe(false);
  }, 120_000);
});
