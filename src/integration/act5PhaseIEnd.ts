// The Phase I end saves (N12 PR 2): written by `SAVE_PHASE_I_END=1` on the Phase I chains (phaseI.run.ts), the live game
// once M52 is done and the Rim card seen. They are the Phase J chain's start, so Phase J is played on what Phase I left
// (level, gold, Scars, favour, the M52 snapshot and outcomes), never on a jump's top-up. The meta carries the run's numbers
// and every trail of Act 4 and Phase I, so the Phase J report reads the whole act's pacing without replaying it.
import type { ChapterHarness } from './chapterHarness';
import type { PhaseCTrail } from './phaseC';
import type { PhaseIResult } from './phaseI.run';
import { saveFixture } from './fixtureDeterminism';
import { knownQuestDefs } from './act3FixtureKey';
import { act5FixtureText } from './act5CarriedBase';
import { act5PhaseIEndName, type Act5BaseMeta, type Act5PhaseIEndMeta } from './act5FixtureKey';
import { ACT5_PHASE_I } from '../quests/act5Jump';
import { FAVOUR_TRACKS } from '../state/favour';
import { M52_GATE_HELD, M52_SPARED_ANY, M52_STOOD, M52_STOOD_ROWS, M52_WAVE4_HELD, M52_WOUNDED } from '../quests/content/act5/rim/m52.quest';
import { R26_CHOICE } from '../quests/content/act5/rim/r26.quest';

/** The Phase I outcome flags Phase J reads (the M52 snapshot is read from the favour flags, not copied here). */
export const PHASE_I_CARRIED_FLAGS: readonly string[] = [
  R26_CHOICE, M52_WOUNDED, M52_WAVE4_HELD, M52_SPARED_ANY, M52_GATE_HELD, ...M52_STOOD_ROWS.map((r) => M52_STOOD(r)),
];

/** The meta from the live game (pure on its inputs; tested without a boot). */
export function phaseIEndMeta(
  r: Pick<PhaseIResult, 'run' | 'preset' | 'deaths'>,
  live: { level: number; xp: number; gold: number; scars: number; favour: (t: string) => number; flag: (k: string) => unknown; hasQuest: (id: string) => boolean },
  trails: Record<string, PhaseCTrail>,
  base: Pick<Act5BaseMeta, 'trails'>,
): Act5PhaseIEndMeta {
  const slim = (t: PhaseCTrail) => ({ talks: t.talks, scripted: t.scripted, order: t.order });
  return {
    fixture: `${act5PhaseIEndName(r.run)}.json`,
    run: r.run,
    preset: r.preset,
    chain: `N12 Phase I run ${r.run.toUpperCase()} (${r.preset}) on act5-carried-chain-${r.run}: M47 to M52 with R26 and R29, the Rim card`,
    level: live.level,
    xp: Math.round(live.xp),
    gold: live.gold,
    scars: live.scars,
    deaths: r.deaths,
    favour: Object.fromEntries(FAVOUR_TRACKS.map((t) => [t, live.favour(t)])),
    choices: Object.fromEntries(PHASE_I_CARRIED_FLAGS.map((k) => {
      const v = live.flag(k);
      return [k, typeof v === 'string' || typeof v === 'boolean' ? v : undefined];
    })),
    phaseIQuestDefs: knownQuestDefs(live.hasQuest, ACT5_PHASE_I),
    trails: Object.fromEntries(Object.entries(trails).map(([q, t]) => [q, slim(t)])),
    act4Trails: base.trails ?? {},
    generatedBy: `SAVE_PHASE_I_END=1 npm run test:chains -- src/integration/phaseI.run${r.run.toUpperCase()}`,
  };
}

async function fsPorts(): Promise<{ write(p: string, d: string): void; dir: string }> {
  const fsName = 'node:fs';
  const urlName = 'node:url';
  const fs = (await import(/* @vite-ignore */ fsName)) as { writeFileSync(p: string, d: string): void };
  const { fileURLToPath } = (await import(/* @vite-ignore */ urlName)) as { fileURLToPath(u: URL): string };
  return { write: (p, d) => fs.writeFileSync(p, d), dir: fileURLToPath(new URL('../save/__fixtures__/act5/', import.meta.url)) };
}

/** `SAVE_PHASE_I_END=1`'s hook on phaseI.run.ts: writes `act5-phase-i-end-<run>.json` and its meta. */
export async function writePhaseIEnd(
  h: ChapterHarness, r: PhaseIResult, trails: Record<string, PhaseCTrail>, base: Pick<Act5BaseMeta, 'trails'>,
): Promise<void> {
  const { write, dir } = await fsPorts();
  const p = h.ctx.services.require('progression') as unknown as { xp: number; level: number };
  const spells = h.ctx.services.get('spells') as { scars: number } | undefined;
  const inv = h.ctx.services.get('inventory') as { gold?: number } | undefined;
  const qs = h.ctx.services.require('quests');
  const save = await saveFixture(h);
  const meta = phaseIEndMeta(r, {
    level: p.level, xp: p.xp, gold: inv?.gold ?? 0, scars: spells?.scars ?? 0,
    favour: (t) => h.ctx.state.favour(t as never), flag: (k) => h.ctx.state.getFlag(k as never),
    hasQuest: (id) => qs.objectives(id).length > 0,
  }, trails, base);
  write(`${dir}${act5PhaseIEndName(r.run)}.json`, act5FixtureText(save));
  write(`${dir}${act5PhaseIEndName(r.run)}.meta.json`, act5FixtureText(meta));
}
