// Act 5's carried base (N12 PR 1): written by `SAVE_PHASE_H_END=1` on L13's Phase H chain (phaseH.run.ts), the live game at
// the end of Act 4 played headless (the act ended once, the card and the Rimfoot camp seen). The meta carries the run's
// level, XP, Scars, favour and the Act 4 choices the Act 5 readers use, plus every Act 4 trail, so Act 5's reports can read
// the whole act's pacing without replaying it.
import type { ChapterHarness } from './chapterHarness';
import type { PhaseCTrail } from './phaseC';
import type { PhaseHResult } from './phaseH.run';
import type { PhaseGEndMeta } from './phaseG.run';
import { saveFixture } from './fixtureDeterminism';
import { knownQuestDefs } from './act3FixtureKey';
import { ACT4_JUMP_IDS } from '../quests/act4Jump';
import { FAVOUR_TRACKS } from '../state/favour';
import { act5BaseName, type Act5BaseMeta } from './act5FixtureKey';

/** The Act 4 choice flags Act 5 reads (plan 2.5): F1 to F8, R11, R16, R19 to R24, D08. */
export const ACT4_CARRIED_CHOICES: readonly string[] = [
  'story.m21.choice', 'story.m31.choice', 'story.m36.delegate.halvard', 'story.m36.delegate.oswin', 'story.m36.delegate.grisel',
  'story.r06.choice', 'story.r10.choice', 'story.r11.choice', 'story.r16.choice', 'story.r19.choice', 'story.r20.choice',
  'story.r21.choice', 'story.r22.choice', 'story.r23.choice', 'story.r24.choice', 'boss.eormen.outcome',
];

export const act5FixtureText = (v: unknown): string => `${JSON.stringify(v, null, 2)}\n`;

async function fsPorts(): Promise<{ write(p: string, d: string): void; dir: string }> {
  const fsName = 'node:fs';
  const urlName = 'node:url';
  const fs = (await import(/* @vite-ignore */ fsName)) as { writeFileSync(p: string, d: string): void; mkdirSync(p: string, o: { recursive: true }): void };
  const { fileURLToPath } = (await import(/* @vite-ignore */ urlName)) as { fileURLToPath(u: URL): string };
  const dir = fileURLToPath(new URL('../save/__fixtures__/act5/', import.meta.url));
  fs.mkdirSync(dir, { recursive: true });
  return { write: (p, d) => fs.writeFileSync(p, d), dir };
}

/** The meta from the live game (pure on its inputs; tested without a boot). */
export function act5BaseMeta(
  run: 'a' | 'b',
  live: { level: number; xp: number; scars: number; favour: (t: string) => number; flag: (k: string) => unknown; hasQuest: (id: string) => boolean },
  r: Pick<PhaseHResult, 'deaths'>,
  trails: Record<string, PhaseCTrail>,
  gMeta: Pick<PhaseGEndMeta, 'trails'>,
): Act5BaseMeta {
  const slim = (t: PhaseCTrail) => ({ talks: t.talks, scripted: t.scripted, order: t.order });
  const all: Record<string, unknown> = {};
  for (const [q, t] of Object.entries(gMeta.trails ?? {})) all[q] = slim(t);
  for (const [q, t] of Object.entries(trails)) all[q] = slim(t);
  return {
    fixture: `${act5BaseName(run)}.json`,
    run,
    chain: `L13 Phase H run ${run.toUpperCase()} on act4-phase-g-end-${run}: the Waste, D08, the Act 4 ending and the Rimfoot camp`,
    level: live.level,
    xp: Math.round(live.xp),
    scars: live.scars,
    deaths: r.deaths,
    favour: Object.fromEntries(FAVOUR_TRACKS.map((t) => [t, live.favour(t)])),
    choices: Object.fromEntries(ACT4_CARRIED_CHOICES.map((k) => {
      const v = live.flag(k);
      return [k, typeof v === 'string' ? v : undefined];
    })),
    act4QuestDefs: knownQuestDefs(live.hasQuest, ACT4_JUMP_IDS),
    trails: all,
    generatedBy: `SAVE_PHASE_H_END=1 npx vitest run src/integration/phaseH.run${run.toUpperCase()}`,
  };
}

/** `SAVE_PHASE_H_END=1`'s hook on phaseH.run.ts: writes `act5-carried-chain-<run>.json` and its meta. */
export async function writeAct5CarriedBase(
  h: ChapterHarness, r: PhaseHResult, trails: Record<string, PhaseCTrail>, gMeta: PhaseGEndMeta,
): Promise<void> {
  // the chain's last moment: the camp scene read, the player by the Rimfoot fire. Saved as it stands (no heal: base only).
  const { write, dir } = await fsPorts();
  const p = h.ctx.services.require('progression') as unknown as { xp: number; level: number };
  const spells = h.ctx.services.get('spells') as { scars: number } | undefined;
  const qs = h.ctx.services.require('quests');
  const save = await saveFixture(h);
  const meta = act5BaseMeta(r.run, {
    level: p.level, xp: p.xp, scars: spells?.scars ?? 0,
    favour: (t) => h.ctx.state.favour(t as never), flag: (k) => h.ctx.state.getFlag(k as never),
    hasQuest: (id) => qs.objectives(id).length > 0,
  }, r, trails, gMeta);
  write(`${dir}${act5BaseName(r.run)}.json`, act5FixtureText(save));
  write(`${dir}${act5BaseName(r.run)}.meta.json`, act5FixtureText(meta));
}
