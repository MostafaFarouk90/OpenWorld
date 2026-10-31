// The road sight rule (thread K2, design 4.3: "a new sight every 30 to 60 seconds of walking"). Along a road, sampled every
// SIGHT_STEP metres, a sight counts when it is within its range and its top is in line of sight from the Knight's eye (1.7 m
// above the road). The longest stretch with nothing in view, in seconds at the plan's walking average, must stay under the
// design's 60 s. Pure and deterministic: heights come in, the sight list is frozen data.
import { roadLength, roadPoint, type RoadId } from '../../../terrain/shape/roadPoint';

export const EYE_HEIGHT = 1.7;
export const SIGHT_STEP = 25;
/** Design 4.3's walking average (60% walking at 3 m/s, 40% sprinting at 7.5 m/s). */
export const WALK_SPEED = 4.8;
export const CANTER_SPEED = 9;
/** The design's upper bound: nothing new in view for longer than this is a gap. */
export const MAX_GAP_SECONDS = 60;
/** Inside this distance a sight always counts (it is beside the road). */
export const NEAR_RANGE = 60;

export interface Sight {
  id: string;
  x: number;
  z: number;
  /** Height of its top above the ground under it (m). */
  height: number;
  /** How far it reads from (m): small dressing about 220, a POI 450, a place or a large building 700. */
  range: number;
}

export type HeightFn = (x: number, z: number) => number;

/** True when the line from the eye to the sight's top clears the ground (sampled every 10 m). */
export function inView(h: HeightFn, ex: number, ez: number, eyeY: number, s: Sight): boolean {
  const d = Math.hypot(s.x - ex, s.z - ez);
  if (d <= NEAR_RANGE) return true;
  if (d > s.range) return false;
  const topY = h(s.x, s.z) + s.height;
  const n = Math.ceil(d / 10);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const ground = h(ex + (s.x - ex) * t, ez + (s.z - ez) * t);
    if (ground > eyeY + (topY - eyeY) * t + 0.2) return false;
  }
  return true;
}

export interface SightReport {
  road: RoadId;
  length: number;
  /** Samples with nothing in view. */
  blind: number;
  /** The longest blind stretch: from arc, to arc (m). */
  worst: { from: number; to: number; metres: number };
  /** All blind stretches (m), longest first. */
  gaps: Array<{ from: number; to: number; metres: number }>;
}

/** Sights in view at arc `s`. */
export function sightsAt(h: HeightFn, road: RoadId, s: number, sights: readonly Sight[]): Sight[] {
  const p = roadPoint(road, s, 0);
  const eye = h(p.x, p.z) + EYE_HEIGHT;
  return sights.filter((x) => Math.abs(x.x - p.x) <= x.range && Math.abs(x.z - p.z) <= x.range && inView(h, p.x, p.z, eye, x));
}

export function sightReport(h: HeightFn, road: RoadId, sights: readonly Sight[], from = 0, to = roadLength(road)): SightReport {
  const gaps: Array<{ from: number; to: number; metres: number }> = [];
  let blind = 0;
  let start: number | null = null;
  const end = to;
  for (let s = from; s <= end + 1e-6; s += SIGHT_STEP) {
    const seen = sightsAt(h, road, s, sights).length > 0;
    if (!seen) {
      blind++;
      if (start === null) start = s;
    } else if (start !== null) {
      gaps.push({ from: start, to: s, metres: s - start });
      start = null;
    }
  }
  if (start !== null) gaps.push({ from: start, to: end, metres: end - start });
  gaps.sort((a, b) => b.metres - a.metres);
  return { road, length: to, blind, worst: gaps[0] ?? { from: 0, to: 0, metres: 0 }, gaps };
}
