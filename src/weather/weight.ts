// Act 4 L3 (plans/act4-L3.md 2.4): one number from 0 to 1 drives the storm's look. Pure.
import { STORM_EDGE, STORM_WEIGHT } from './tuning';
import type { ClockKind } from './clock';

export interface Box {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

/** Signed metres inside the box (negative outside): the distance to the nearest edge. */
export function insideDepth(box: Box, x: number, z: number): number {
  const dx = Math.min(x - box.x0, box.x1 - x);
  const dz = Math.min(z - box.z0, box.z1 - z);
  if (dx >= 0 && dz >= 0) return Math.min(dx, dz);
  const ox = Math.max(0, -dx);
  const oz = Math.max(0, -dz);
  return -Math.hypot(ox, oz);
}

/**
 * v0.9 (Act 5 N1): regions nested in a storm region that keep no storm of their own (the Caldera, inside the Waste's box).
 * The look fades out over this many metres inside such a hole (the Caldera's crest stands 150 m inside its box), and the
 * clock stops deeper than `STORM_EDGE.outside` inside it.
 */
export const STORM_HOLE_FADE = 100;

/** 1 outside every hole, falling to 0 at STORM_HOLE_FADE metres inside one. */
export function stormHoleFactor(holes: readonly Box[], x: number, z: number): number {
  let f = 1;
  for (const h of holes) {
    const d = insideDepth(h, x, z);
    if (d > 0) f = Math.min(f, Math.max(0, 1 - d / STORM_HOLE_FADE));
  }
  return f;
}

/** The storm clock's band: in or near a storm region (STORM_EDGE.outside), and not deep inside one of its holes. */
export function inStormBand(boxes: readonly Box[], holes: readonly Box[], x: number, z: number): boolean {
  if (holes.some((h) => insideDepth(h, x, z) > STORM_EDGE.outside)) return false;
  return boxes.some((b) => insideDepth(b, x, z) > -STORM_EDGE.outside);
}

/** The storm regions' boxes, and the boxes of the built regions nested inside one with no storm of their own. */
export function stormBoxes(
  ids: readonly string[],
  info: (id: string) => { weather?: string; reserved?: boolean },
  box: (id: string) => Box,
): { boxes: Box[]; holes: Box[] } {
  const storm = ids.filter((id) => info(id).weather === 'ash-storm');
  const boxes = storm.map(box);
  const within = (a: Box, b: Box) => a.x0 >= b.x0 && a.x1 <= b.x1 && a.z0 >= b.z0 && a.z1 <= b.z1;
  const holes = ids
    .filter((id) => !storm.includes(id) && !info(id).reserved)
    .map(box)
    .filter((h) => boxes.some((b) => within(h, b)));
  return { boxes, holes };
}

/** 0 at `STORM_EDGE.outside` metres outside the box, 1 at `STORM_EDGE.inside` inside. */
export function edgeFade(depth: number): number {
  const u = (depth + STORM_EDGE.outside) / (STORM_EDGE.outside + STORM_EDGE.inside);
  return Math.min(1, Math.max(0, u));
}

export function phaseWeight(kind: ClockKind): number {
  return kind === 'storm' ? STORM_WEIGHT.storm : kind === 'warning' ? STORM_WEIGHT.warning : 0;
}

/** Moves `current` toward `target` at full scale per `STORM_WEIGHT.rampSeconds`. */
export function ramp(current: number, target: number, dt: number): number {
  const step = dt / STORM_WEIGHT.rampSeconds;
  if (!(step > 0)) return current;
  return current < target ? Math.min(target, current + step) : Math.max(target, current - step);
}
