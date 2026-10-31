/**
 * Phase E (the Greyfen block), played on a game booted from an Act 3 fixture with the Phase C driver (`phaseC.ts`):
 * dialogue by key presses, interactables and carries by F at the real anchors, enemies killed as the player through the
 * damage service. Act 3 adds three ways to move, and the chain moves through each for real rather than teleporting
 * across it: wading (short steps on the ground through the water, so the water service slows the player), diving (the
 * route's polyline from air pocket to air pocket, with the breath watched) and the ferry (the ferry service's own ride).
 * What has no cheap headless driver is recorded in `trail.scripted`, so the e2e tests name every shortcut.
 *
 * Run A plays the Greyfen first (from `act3-greyfen-m23`); run B plays it second (from `act3-spine-m23`, the lower
 * Dragonspine injected first, so the Greyfen locks at the higher Warmth). The measured rows come from the Greyfen quest
 * thread's `Act3PaceRow` table with the nodes each run actually read, and the 52% gate runs on them.
 */
import type * as THREE from 'three';
import { bootFromSave, type ChapterHarness } from './chapterHarness';
import { ensure, heal } from './phaseA';
import type { PhaseCTrail } from './phaseC';
import { trailNodes } from './timing';
import { act3PacingReport, estimateAct3Row, phaseEGate, type Act3PacingReport, type Act3PaceRow } from './act3Timing';
import { ACT3_GREYFEN, type Act3Order } from '../quests/act3Jump';
import { readAct3Fixture } from '../save/__fixtures__/act3';
type Vec3Like = { x: number; y: number; z: number };

export type PhaseEQuest = (typeof ACT3_GREYFEN)[number];
/** Plan 2.1's table order: M27 waits for M26 and R14 (Q12), D05 for M27. */
export const PHASE_E_ORDER: readonly PhaseEQuest[] = ACT3_GREYFEN;

/** Who offers each quest (plan 2.1); checked against the Greyfen quest thread's dialogue when its branch is stacked. */
export const PHASE_E_GIVERS: Record<PhaseEQuest, string> = {
  m23: 'leofa', m24: 'dudda', r12: 'dudda', m25: 'gytha', r14: 'leofa', r13: 'gytha', m26: 'gytha', m27: 'leofa', d05: 'gytha',
};

/** The fixture each run starts from: the Greyfen first, or second after the lower Dragonspine. */
export const PHASE_E_START: Record<'a' | 'b', { order: Act3Order; id: PhaseEQuest }> = {
  a: { order: 'greyfen', id: 'm23' },
  b: { order: 'spine', id: 'm23' },
};

/** Boots a run's start fixture headless (no models) and lets the load settle. */
export async function bootPhaseE(run: 'a' | 'b'): Promise<ChapterHarness & { loaded: boolean }> {
  const { order, id } = PHASE_E_START[run];
  const h = await bootFromSave(await readAct3Fixture(order, id), { models: false, virtualClock: true });
  ensure(h.loaded, `Phase E run ${run}: the fixture act3-${order}-${id} loaded`);
  return h;
}

/** Metres per step when moving through water: short enough that the water service sees the player in every volume crossed. */
export const WATER_STEP_M = 2;

export interface WaterLegLog {
  /** the water states the player was seen in, in order, without repeats */
  states: string[];
  metres: number;
}

/** Steps the player on the ground through `points` (wading), `stepM` at a time, a tick between steps. */
export async function wadeAlong(h: ChapterHarness, points: readonly { x: number; z: number }[], stepM = WATER_STEP_M): Promise<WaterLegLog> {
  const water = h.ctx.services.get('water');
  const log: WaterLegLog = { states: [], metres: 0 };
  const note = () => {
    const s = water?.state ?? 'dry';
    if (log.states.at(-1) !== s) log.states.push(s);
  };
  for (const p of points) {
    for (let guard = 0; guard < 10_000; guard++) {
      const f = h.ctx.player.feet;
      const d = Math.hypot(p.x - f.x, p.z - f.z);
      if (d < 0.5) break;
      const step = Math.min(d, stepM);
      await h.teleport({ x: f.x + ((p.x - f.x) / d) * step, z: f.z + ((p.z - f.z) / d) * step }, 1);
      log.metres += step;
      note();
    }
  }
  heal(h);
  return log;
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
      h.ctx.player.teleport({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t }, h.ctx.cameraRig?.yaw ?? 0);
      await h.runAsync(ticksPerStep);
      if (log.states.at(-1) !== water.state) log.states.push(water.state);
      log.minBreath = Math.min(log.minBreath, water.breath);
      ensure(water.breath > 0, `dive: breath ran out ${s.toFixed(1)} m into leg ${i}`);
      if (s >= len) break;
    }
    log.metres += len;
  }
  return log;
}

/** Rides the ferry from the stop the player stands at to `to` through the ferry service, and waits for the arrival. */
export async function rideFerry(h: ChapterHarness, from: string, to: string, maxSeconds = 600): Promise<void> {
  const ferry = h.ctx.services.get('ferry');
  ensure(ferry, 'the ferry service');
  const before = h.of('ferry.arrived').length;
  const refused = ferry.ride(from, to);
  ensure(refused === null, `ferry ${from} to ${to} refused (${JSON.stringify(refused)})`);
  for (let i = 0; i < maxSeconds && h.of('ferry.arrived').length === before; i++) await h.runAsync(60);
  const arrived = h.of('ferry.arrived').slice(before);
  ensure(arrived.some((e) => e.stop === to && !e.skipped), `ferry arrived at ${to} by the ride`);
}

/** The Phase E pacing report on the rows the Greyfen thread ships, with the nodes each quest's run read. */
export function measurePhaseE(
  h: ChapterHarness, rows: readonly Act3PaceRow[], trails: Readonly<Record<string, PhaseCTrail>>,
): { report: Act3PacingReport; gate: ReturnType<typeof phaseEGate> } {
  const at = (id: string): THREE.Vector3Like => h.anchor(id);
  const measured = rows.map((row) => {
    const trail = trails[row.quest];
    ensure(trail, `a trail for ${row.quest}`);
    return estimateAct3Row(row, at, trailNodes(trail));
  });
  const report = act3PacingReport(measured);
  return { report, gate: phaseEGate(report, PHASE_E_ORDER) };
}
