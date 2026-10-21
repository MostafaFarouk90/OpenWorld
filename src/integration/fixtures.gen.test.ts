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
import { PHASE_A_FIXTURES, FIXTURE_SAVED_AT, readPhaseAFixture } from '../save/__fixtures__/phaseA';
import { ACT1_FIXTURES, readAct1Fixture } from '../save/__fixtures__/act1';
import { bootFromSave } from './chapterHarness';
import { playPhaseB } from './phaseB';
import { fightGrimtooth } from './grimtooth';
import { ACT2_C_FIXTURES } from '../save/__fixtures__/act2c';
import { playPhaseC, PHASE_C_RUN_B } from './phaseC';

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

const ACT1_FIXTURES_WHAT: Record<keyof typeof ACT1_FIXTURES, string> = {
  m06ThroughGate: 'Act 1 run A from phaseA-complete-released-saved: M06 completed by bribe (harness-granted 50 gold), the South Gate open, M07 not started',
  m07ClassChosen: 'Act 1 run B from phaseA-complete-defeated-scorched: M06 by stealth, M07 completed, the Warden chosen, its drill skipped, in the Bastion yard',
  m09CountingHouse: 'Act 1 run A: M09 active with o4 done (the stealth section cleared), inside the Counting-House before the hand-in to Merrin',
  m10Ashmare: 'Act 1 run A: M10 completed, story.m10.ashmare set, on foot',
  d02Underways: 'Act 1 run A: D02 active (o1, o2 done), inside the Underways before the kennels; bread, Calm and the door from Rook',
  endingCard: 'Act 1 run A: D02 completed, story.gate.a2 set, the ending card shown (codex.actEndingSeen) and not dismissed, no camp yet',
  complete: 'Act 1 run A: every Act 1 quest completed, Grimtooth (the real boss) calmed, the ending card and the camp scene done',
};

describe.skipIf(!GEN)('Act 1 fixtures (GEN_FIXTURES=1 writes them)', () => {
  it('run A: through the gate, the Counting-House, the Ashmare, the Underways, the ending card, the end', async () => {
    const t = await bootFromSave(await readPhaseAFixture(PHASE_A_FIXTURES.releasedSaved), { models: true, virtualClock: true });
    h = t;
    const out: Partial<Record<keyof typeof ACT1_FIXTURES, Record<string, unknown>>> = {};
    await playPhaseB(t, {
      route: 'bribe', classId: 'knight', debt: 'forgiven', steward: 'expose', stance: 'steady', grimtooth: 'released',
      after: async (q) => {
        if (q === 'm06') out.m06ThroughGate = await saveFixture(t);
        if (q === 'm10') out.m10Ashmare = await saveFixture(t);
        if (q === 'd02') {
          for (let i = 0; i < 5; i++) {
            t.run(1);
            t.ctx.hud.update(1 / 60);
          }
          ensure(t.ctx.state.getBool('codex.actEndingSeen'), 'the card is showing');
          out.endingCard = await saveFixture(t);
        }
      },
      inCountingHouse: async () => { out.m09CountingHouse = await saveFixture(t); },
      inUnderways: async () => { out.d02Underways = await saveFixture(t); },
    }, fightGrimtooth);
    out.complete = await saveFixture(t);
    for (const k of ['m06ThroughGate', 'm09CountingHouse', 'm10Ashmare', 'd02Underways', 'endingCard', 'complete'] as const) {
      expect(out[k], k).toBeDefined();
      await write(ACT1_FIXTURES[k], out[k]!, ACT1_FIXTURES_WHAT[k]);
    }
  }, 300_000);

  it('run B: the class chosen', async () => {
    const t = await bootFromSave(await readPhaseAFixture(PHASE_A_FIXTURES.defeatedScorched), { models: true, virtualClock: true });
    h = t;
    let chosen: Record<string, unknown> | null = null;
    await playPhaseB(t, {
      route: 'stealth', classId: 'warden', debt: 'collected', steward: 'shield', stance: 'bold', grimtooth: 'defeated',
      after: async (q) => {
        if (q === 'm07') chosen = await saveFixture(t);
      },
    }, fightGrimtooth);
    expect(chosen).not.toBeNull();
    await write(ACT1_FIXTURES.m07ClassChosen, chosen!, ACT1_FIXTURES_WHAT.m07ClassChosen);
  }, 300_000);
});

const ACT2_C_FIXTURES_WHAT: Record<keyof typeof ACT2_C_FIXTURES, string> = {
  m11Start: 'Act 2 run A from act1-complete: Act 1 done, M11 not yet offered (Gaut gives it)',
  m12Start: 'Act 2 run A: M11 completed, the Cinder Road stone lit, M12 not yet offered',
  m12MidWave: 'Act 2 run A: M12 active, its raid in progress (the first raiders standing)',
  m14HushedAnvil: 'Act 2 run A: M14 active, the Hushed Anvil rekindled; murals, keeper and tempering ahead',
  d03Scorchhold: 'Act 2 run A: D03 active, the gate and the courtyard done, the keep papers current',
  completeDefeated: 'Act 2 run A (R05 safe road, R06 cleansed, R07 spared, R11 slain, Redmane defeated): M11 to D03 completed',
  completeSpared: 'Act 2 run B (R05 fox, R06 sealed, R07 culled, R11 spared, Redmane spared): M11 to D03 completed',
};


describe.skipIf(!GEN)('Act 2 Phase C fixtures (GEN_FIXTURES=1 writes them)', () => {
  it('run A: the first branch of every choice, with the checkpoints on the way', async () => {
    const t = await bootFromSave(await readAct1Fixture(ACT1_FIXTURES.complete), { models: true, virtualClock: true });
    h = t;
    const out: Partial<Record<keyof typeof ACT2_C_FIXTURES, Record<string, unknown>>> = {};
    await playPhaseC(t, undefined, {
      hooks: {
        before: async (q) => { if (q === 'm11') out.m11Start = await saveFixture(t); },
        after: async (q) => { if (q === 'm11') out.m12Start = await saveFixture(t); },
        inWave: async (q) => { if (q === 'm12' && !out.m12MidWave) out.m12MidWave = await saveFixture(t); },
        afterObjective: async (q, o) => {
          if (q === 'm14' && o === 'rekindle') out.m14HushedAnvil = await saveFixture(t);
          if (q === 'd03' && o === 'perch') out.d03Scorchhold = await saveFixture(t);
        },
      },
    });
    out.completeDefeated = await saveFixture(t);
    for (const k of Object.keys(ACT2_C_FIXTURES) as (keyof typeof ACT2_C_FIXTURES)[]) {
      if (k === 'completeSpared') continue;
      expect(out[k], k).toBeDefined();
      await write(ACT2_C_FIXTURES[k], out[k]!, ACT2_C_FIXTURES_WHAT[k]);
    }
  }, 600_000);

  it('run B: the second branch of every choice', async () => {
    const t = await bootFromSave(await readAct1Fixture(ACT1_FIXTURES.complete), { models: true, virtualClock: true });
    h = t;
    await playPhaseC(t, undefined, { choices: PHASE_C_RUN_B });
    await write(ACT2_C_FIXTURES.completeSpared, await saveFixture(t), ACT2_C_FIXTURES_WHAT.completeSpared);
  }, 600_000);
});
