/**
 * Writes the Phase A save fixtures in src/save/__fixtures__/ by playing the chapter (src/integration/phaseA.ts) and
 * saving through the REAL save plugin (`save.saveNow('manual')`), then reading what it stored in the fake IndexedDB
 * (`slot-0`). Nothing is hand-written. Only writes when asked:
 *
 *   GEN_FIXTURES=1 npx vitest run src/integration/fixtures.gen.test.ts
 *
 * `savedAt` is fixed by holding `Date.now()` while the save runs; `playtimeSeconds` (ticks x 1/60 s) is rounded to
 * whole seconds. Each fixture gets a sibling `<name>.meta.json` with the generating commit and the command.
 * Thread 10 commits them with its tag; threads 12 and 21 load them in tests (see src/save/phaseAFixtures.test.ts
 * and `bootFromSave` in src/integration/chapterHarness.ts).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootChapter, type ChapterHarness } from './chapterHarness';
import { ensure, playPhaseA, reachPhaseAStart } from './phaseA';
import { PHASE_A_FIXTURES, FIXTURE_SAVED_AT } from '../save/__fixtures__/phaseA';

const GEN = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.GEN_FIXTURES === '1';

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

async function node() {
  const fsName = 'node:fs';
  const cpName = 'node:child_process';
  const fs = (await import(/* @vite-ignore */ fsName)) as { writeFileSync(p: string, data: string): void };
  const cp = (await import(/* @vite-ignore */ cpName)) as { execSync(cmd: string): { toString(): string } };
  return { fs, cp };
}

/** Saves through the real plugin with a fixed clock and returns the stored `slot-0` value. */
async function saveFixture(t: ChapterHarness): Promise<Record<string, unknown>> {
  // Saves are refused in dialogue or cutscene contexts; let the last one close.
  await t.runAsync(5);
  const now = vi.spyOn(Date, 'now').mockReturnValue(FIXTURE_SAVED_AT);
  try {
    const out = await t.ctx.services.require('save').saveNow('manual');
    await t.flush();
    ensure(out.ok, `manual save ok (${JSON.stringify(out)})`);
  } finally {
    now.mockRestore();
  }
  const raw = JSON.parse(JSON.stringify(t.fake.peek('slot-0'))) as Record<string, unknown>;
  ensure(raw && raw.savedAt === FIXTURE_SAVED_AT, 'slot-0 holds the save just written');
  raw.playtimeSeconds = Math.round(raw.playtimeSeconds as number);
  return raw;
}

async function write(name: string, file: Record<string, unknown>, what: string) {
  const { fs, cp } = await node();
  const dir = 'src/save/__fixtures__';
  fs.writeFileSync(`${dir}/${name}.json`, JSON.stringify(file, null, 2) + '\n');
  const commit = cp.execSync('git rev-parse HEAD').toString().trim();
  const meta = {
    fixture: `${name}.json`,
    what,
    generatedBy: 'GEN_FIXTURES=1 npx vitest run src/integration/fixtures.gen.test.ts',
    generatingCommit: commit,
    savedAt: 'fixed: Date.now() held at FIXTURE_SAVED_AT while saving',
    playtimeSeconds: 'rounded to whole seconds',
    source: 'the real save plugin (saveNow("manual")), read back from the fake IndexedDB slot-0',
  };
  fs.writeFileSync(`${dir}/${name}.meta.json`, JSON.stringify(meta, null, 2) + '\n');
}

describe.skipIf(!GEN)('Phase A fixtures (GEN_FIXTURES=1 writes them)', () => {
  it('Prior released, field saved; and the mid-D01 vault save on the way', async () => {
    h = await bootChapter({ models: true, virtualClock: true });
    await reachPhaseAStart(h);
    let vault: Record<string, unknown> | null = null;
    const t = h;
    await playPhaseA(h, {
      field: 'saved',
      prior: 'released',
      inVault: async () => {
        vault = await saveFixture(t);
      },
    });
    const done = await saveFixture(h);
    expect(vault).not.toBeNull();
    await write(PHASE_A_FIXTURES.midD01Vault, vault!, PHASE_A_FIXTURES_WHAT.midD01Vault);
    await write(PHASE_A_FIXTURES.releasedSaved, done, PHASE_A_FIXTURES_WHAT.releasedSaved);
  }, 120_000);

  it('Prior defeated, field scorched', async () => {
    h = await bootChapter({ models: true, virtualClock: true });
    await reachPhaseAStart(h);
    await playPhaseA(h, { field: 'scorched', prior: 'defeated' });
    await write(PHASE_A_FIXTURES.defeatedScorched, await saveFixture(h), PHASE_A_FIXTURES_WHAT.defeatedScorched);
  }, 120_000);
});

const PHASE_A_FIXTURES_WHAT = {
  releasedSaved: 'Phase A complete: M03-M05, R01, R02, D01 completed; Prior released; R01 field saved (Surge); Tobb joined; outside at the vault door',
  defeatedScorched: 'Phase A complete: M03-M05, R01, R02, D01 completed; Prior defeated; R01 field scorched (torch); Tobb joined; outside at the vault door',
  midD01Vault: 'D01 active (o1 done), player inside the chapel vault just past its entry, Tobb joined; M03-M05, R01 (saved), R02 completed',
} as const;
