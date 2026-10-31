/**
 * Phase E (the Greyfen block), played on a game booted from an Act 3 fixture. The objective player is phaseEDriver.ts:
 * dialogue by key presses, props and notes by F at the real interactables (through the interior doors), enemies and quest
 * groups killed as the player through the damage service, the ferry ridden by its service, the waystone held, the
 * water-song struck on its beat. Moving between objectives is by teleport (as Phases A to D); the pacing travel comes from
 * the route anchors, not from the run. Dives are swum along the route polylines with the breath watched (`diveAlong`).
 * What has no cheap headless driver is recorded in `trail.scripted`, so the e2e tests name every shortcut.
 *
 * Run A plays the Greyfen first (from `act3-greyfen-m23`); run B plays it second (from `act3-spine-m23`, the lower
 * Dragonspine injected first, so the Greyfen locks at the higher Warmth). The measured rows are the Greyfen quest thread's
 * `Act3PaceRow` table with the nodes each run actually read, and the 52% gate runs on them.
 */
import { bootFromSave, type ChapterHarness } from './chapterHarness';
import { ensure } from './phaseA';
import type { PhaseCTrail } from './phaseC';
import { trailNodes } from './timing';
import { act3PacingReport, estimateAct3Row, phaseEGate, type Act3PacingReport, type Act3PaceRow } from './act3Timing';
import { ACT3_GREYFEN, type Act3Order } from '../quests/act3Jump';
import { readAct3Fixture, readAct3FixtureMeta } from '../save/__fixtures__/act3';
import { act3FixtureFresh, fixtureDefIds, knownQuestDefs } from './act3FixtureKey';
type Vec3Like = { x: number; y: number; z: number };

export type PhaseEQuest = (typeof ACT3_GREYFEN)[number];
/** Plan 2.1's table order: M27 waits for M26 and R14 (Q12), D05 for M27. */
export const PHASE_E_ORDER: readonly PhaseEQuest[] = ACT3_GREYFEN;

/** Who offers each quest (plan 2.1); the headless chain starts each quest by talking to them (K12's dialogue). */
export const PHASE_E_GIVERS: Record<PhaseEQuest, string> = {
  m23: 'leofa', m24: 'dudda', r12: 'dudda', m25: 'gytha', r14: 'leofa', r13: 'gytha', m26: 'gytha', m27: 'leofa', d05: 'gytha',
};

/** The fixture each run starts from: the Greyfen first, or second after the lower Dragonspine. */
export const PHASE_E_START: Record<'a' | 'b', { order: Act3Order; id: PhaseEQuest }> = {
  a: { order: 'greyfen', id: 'm23' },
  b: { order: 'spine', id: 'm23' },
};

/** Boots a run's start fixture headless (with models, no renderer) and lets the load settle. */
export async function bootPhaseE(run: 'a' | 'b'): Promise<ChapterHarness & { loaded: boolean }> {
  const { order, id } = PHASE_E_START[run];
  // Models on: the hunter packs (R14, M26, M27) are humanoids, which a game without the asset loader cannot spawn.
  const h = await bootFromSave(await readAct3Fixture(order, id), { models: true, virtualClock: true });
  ensure(h.loaded, `Phase E run ${run}: the fixture act3-${order}-${id} loaded`);
  // The chain never runs on a fixture `?act3=` would refuse as stale (review M2).
  const meta = await readAct3FixtureMeta(order, id);
  const qs = h.ctx.services.require('quests');
  const known = knownQuestDefs((q) => qs.objectives(q).length > 0, fixtureDefIds(id, order));
  ensure(act3FixtureFresh(meta, known), `Phase E run ${run}: act3-${order}-${id} is stale for this build; regenerate the fixtures`);
  return h;
}

/** Metres per step when swimming a dive route. */
export const WATER_STEP_M = 2;

interface WaterLegLog {
  /** the water states the player was seen in, in order, without repeats */
  states: string[];
  metres: number;
}

export interface DiveLog extends WaterLegLog {
  /** the least breath left at any step (seconds) */
  minBreath: number;
}

/**
 * Follows a dive route's polyline from its entry, `stepM` at a time, ticking the swim time each step takes at the swim
 * speed, so the breath drains as it would and refills at each air pocket. Fails if the breath ever runs out.
 */
export async function diveAlong(
  h: ChapterHarness, points: readonly Vec3Like[], swimMps: number, stepM = WATER_STEP_M,
): Promise<DiveLog> {
  const water = h.ctx.services.get('water');
  ensure(water, 'the water service');
  const log: DiveLog = { states: [], metres: 0, minBreath: Infinity };
  const ticksPerStep = Math.max(1, Math.round((stepM / swimMps) * 60));
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    for (let s = Math.min(stepM, len); ; s = Math.min(s + stepM, len)) {
      const t = len > 0 ? s / len : 1;
      const to = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
      h.ctx.player.teleport(to, h.ctx.cameraRig?.yaw ?? 0);
      await h.runAsync(ticksPerStep);
      const f = h.ctx.player.feet;
      ensure(Math.hypot(f.x - to.x, f.z - to.z) < 1, `dive: did not reach (${to.x.toFixed(1)}, ${to.y.toFixed(1)}, ${to.z.toFixed(1)}) on leg ${i} (feet ${f.x.toFixed(1)}, ${f.y.toFixed(1)}, ${f.z.toFixed(1)}; water ${water.state})`);
      if (log.states.at(-1) !== water.state) log.states.push(water.state);
      log.minBreath = Math.min(log.minBreath, water.breath);
      ensure(water.breath > 0, `dive: breath ran out ${s.toFixed(1)} m into leg ${i}`);
      if (s >= len) break;
    }
    log.metres += len;
  }
  return log;
}

/**
 * The Phase E pacing report on the rows the Greyfen thread ships, with the nodes each quest's run read. Positions come from
 * `at`: the Greyfen thread's own resolver (`paceAt`), which knows which interior's frame an anchor is in, so a leg is
 * measured within one space and door legs cost nothing.
 */
export function measurePhaseE(
  rows: readonly Act3PaceRow[], trails: Readonly<Record<string, PhaseCTrail>>, at: (anchor: string) => { x: number; z: number },
): { report: Act3PacingReport; gate: ReturnType<typeof phaseEGate> } {
  const measured = rows.map((row) => {
    const trail = trails[row.quest];
    ensure(trail, `a trail for ${row.quest}`);
    return estimateAct3Row(row, at, trailNodes(trail));
  });
  const report = act3PacingReport(measured);
  return { report, gate: phaseEGate(report, PHASE_E_ORDER) };
}
