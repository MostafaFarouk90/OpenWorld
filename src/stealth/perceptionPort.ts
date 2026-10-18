/**
 * STUB of thread 5's perception hook (plans/slice-2-stealth-chase.md section 12, B3). Thread 5 owns the real
 * `PerceptionModifiers`, `combineModifiers`, `stepAwareness` and the `enemies.perception` service in
 * `src/enemies/ai/perception.ts`. This file mirrors the agreed names so the stealth code builds before thread 5's
 * PR B lands; it is replaced by re-exports of thread 5's module before merging.
 */
import { AI } from '../enemies/tuning';
import { type PerceptionInput, type PerceptionResult, perceive } from '../enemies/ai/perception';

export type P3 = { x: number; y: number; z: number };

export interface SightBlocker {
  x: number;
  z: number;
  r: number;
}

export interface PerceptionModifiers {
  sightRangeScale: number;
  coneScale: number;
  hearingQuietScale: number;
  hearingLoudScale: number;
  /** Concatenated across providers. */
  blockSight?: readonly SightBlocker[];
  /** Not noticed beyond this distance (minimum wins). */
  hiddenBelow?: number;
  /** Height above the feet the sight ray aims at (minimum wins); default AI.chestHeight. */
  targetHeight?: number;
}

export const NO_MODIFIERS: PerceptionModifiers = { sightRangeScale: 1, coneScale: 1, hearingQuietScale: 1, hearingLoudScale: 1 };

/** Scales multiply, sight blockers concatenate, `hiddenBelow` and `targetHeight` take the minimum. */
export function combineModifiers(list: readonly (PerceptionModifiers | null | undefined)[]): PerceptionModifiers {
  const out: PerceptionModifiers = { ...NO_MODIFIERS };
  const blockers: SightBlocker[] = [];
  for (const m of list) {
    if (!m) continue;
    out.sightRangeScale *= m.sightRangeScale;
    out.coneScale *= m.coneScale;
    out.hearingQuietScale *= m.hearingQuietScale;
    out.hearingLoudScale *= m.hearingLoudScale;
    if (m.blockSight) blockers.push(...m.blockSight);
    if (m.hiddenBelow !== undefined) out.hiddenBelow = Math.min(out.hiddenBelow ?? Infinity, m.hiddenBelow);
    if (m.targetHeight !== undefined) out.targetHeight = Math.min(out.targetHeight ?? Infinity, m.targetHeight);
  }
  if (blockers.length) out.blockSight = blockers;
  return out;
}

/** Does the horizontal segment a to b pass within r of the blocker's centre? */
function segmentBlocked(a: P3, b: P3, k: SightBlocker): boolean {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((k.x - a.x) * dx + (k.z - a.z) * dz) / len2)) : 0;
  return Math.hypot(a.x + dx * t - k.x, a.z + dz * t - k.z) <= k.r;
}

/** Thread 5's `perceive` with modifiers applied (stub semantics; the real one is thread 5's). */
export type ModifiedPerception = PerceptionResult & {
  /** The sight range after modifiers; awareness fills by distance over this range. */
  sightRange?: number;
};

export function perceiveWith(input: PerceptionInput, mods: PerceptionModifiers | null): ModifiedPerception {
  if (!mods) return perceive(input);
  const t = input.targetFeet;
  if (!t || !input.targetAlive) return perceive(input);
  const s = input.selfFeet;
  const distance = Math.hypot(t.x - s.x, t.z - s.z);
  if (!Number.isFinite(distance)) return { sees: false, hears: false, notices: false, distance: Infinity };
  if (mods.hiddenBelow !== undefined && distance > mods.hiddenBelow) {
    return { sees: false, hears: false, notices: input.damagedBy, distance };
  }
  const hears = distance <= (input.targetLoud ? AI.hearingLoud * mods.hearingLoudScale : AI.hearingQuiet * mods.hearingQuietScale);
  let sees = false;
  if (distance <= AI.sightRange * mods.sightRangeScale) {
    let inCone = true;
    if (distance > 1e-6) {
      const cos = (-Math.sin(input.selfYaw) * (t.x - s.x) - Math.cos(input.selfYaw) * (t.z - s.z)) / distance;
      inCone = cos >= Math.cos(((AI.sightConeDegrees * mods.coneScale) / 2) * (Math.PI / 180)) - 1e-9;
    }
    if (inCone && !(mods.blockSight ?? []).some((k) => segmentBlocked(s, t, k))) {
      sees = input.lineOfSight(
        { x: s.x, y: s.y + AI.eyeHeight, z: s.z },
        { x: t.x, y: t.y + (mods.targetHeight ?? AI.chestHeight), z: t.z },
      );
    }
  }
  return { sees, hears, notices: input.damagedBy || sees || hears, distance, sightRange: AI.sightRange * mods.sightRangeScale };
}

/** Awareness 0..1 (stub rates): fills faster the closer a seen target is (relative to the modified sight range), slower when only heard, drains 0.25/s. */
export function stepAwareness(prev: number, r: ModifiedPerception, dt: number): number {
  const p = Number.isFinite(prev) ? prev : 0;
  let rate = -0.25;
  if (r.sees) {
    const near = Math.max(0, Math.min(1, r.distance / (r.sightRange ?? AI.sightRange)));
    rate = 1 / (0.5 + 1.5 * near); // 0.5 s point blank, 2 s at full range
  } else if (r.hears) rate = 0.6;
  return Math.max(0, Math.min(1, p + rate * dt));
}

/** The per-guard read thread 5 exposes as `enemies.perception.state(actorId)`. */
export interface GuardPerceptionState {
  awareness: number;
  sees: boolean;
  hears: boolean;
  distance: number;
}
