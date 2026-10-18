import type { Collider } from '@dimforge/rapier3d';
import type { PhysicsQueries } from '../../physics/PhysicsWorld';
import { AI } from '../tuning';

type P3 = { x: number; y: number; z: number };

export interface PerceptionInput {
  selfFeet: P3;
  /** Player convention: yaw 0 faces -Z, forward = (-sin yaw, -cos yaw). */
  selfYaw: number;
  targetFeet: P3 | null;
  targetAlive: boolean;
  /** Sprinting or attacking. */
  targetLoud: boolean;
  /** The target hit us this tick. */
  damagedBy: boolean;
  lineOfSight(from: P3, to: P3): boolean;
  /** Combined perception modifiers (perceptionHook.ts); absent or `null` is exactly the unmodified behaviour. */
  modifiers?: CombinedModifiers | null;
}

/** A disc on the ground that blocks sight rays passing through it (Ash Cloud smoke). */
export interface SightBlocker {
  x: number;
  z: number;
  r: number;
}

/**
 * What a provider returns (see perceptionHook.ts). Combining several providers:
 * - `sightRangeScale`, `coneScale`, `hearingQuietScale`, `hearingLoudScale` multiply (1 changes nothing). The effective sight
 *   range is `AI.sightRange * sightRangeScale`, the cone's full angle `AI.sightConeDegrees * coneScale`, and the hearing
 *   radius `AI.hearingQuiet * hearingQuietScale` (or `AI.hearingLoud * hearingLoudScale` while the target is loud).
 * - `blockSight` lists concatenate.
 * - `hiddenBelow` and `targetHeight` take the minimum across providers (the most hidden / lowest target wins).
 */
export interface PerceptionModifiers {
  sightRangeScale: number;
  coneScale: number;
  hearingQuietScale: number;
  hearingLoudScale: number;
  /** Sight blockers: ground discs `{ x, z, r }` that a sight ray cannot pass through. Several providers' lists concatenate. */
  blockSight?: readonly SightBlocker[];
  /** Hidden: not noticed unless closer than this, regardless of the cone. The minimum across providers wins. */
  hiddenBelow?: number;
  /** Metres above the target's feet that sight rays aim at, when lower than the 1.1 m chest (crouching behind low cover). The minimum wins. */
  targetHeight?: number;
}

/** `PerceptionModifiers` after combining: scales multiplied, blockers concatenated, minimums taken. */
export interface CombinedModifiers {
  sightRangeScale: number;
  coneScale: number;
  hearingQuietScale: number;
  hearingLoudScale: number;
  blockSight: readonly SightBlocker[];
  hiddenBelow?: number;
  targetHeight?: number;
}

export interface PerceptionResult {
  sees: boolean;
  hears: boolean;
  notices: boolean;
  /** Horizontal distance to the target (Infinity with no target). */
  distance: number;
}

const NONE: PerceptionResult = { sees: false, hears: false, notices: false, distance: Infinity };

export function perceive(input: PerceptionInput): PerceptionResult {
  const { selfFeet: s, targetFeet: t } = input;
  if (!t || !input.targetAlive) return { ...NONE };
  const dx = t.x - s.x;
  const dz = t.z - s.z;
  const distance = Math.hypot(dx, dz);
  if (!Number.isFinite(distance)) return { ...NONE };
  const m = input.modifiers ?? null;

  const hiddenBelow = m?.hiddenBelow;
  const hiddenOut = hiddenBelow !== undefined && !(distance < hiddenBelow);
  const hearRange = (input.targetLoud ? AI.hearingLoud * (m?.hearingLoudScale ?? 1) : AI.hearingQuiet * (m?.hearingQuietScale ?? 1));
  const hears = !hiddenOut && distance <= hearRange;

  let sees = false;
  if (!hiddenOut && distance <= AI.sightRange * (m?.sightRangeScale ?? 1)) {
    let inCone = true;
    // Hidden but close: noticed regardless of the cone.
    if (distance > 1e-6 && hiddenBelow === undefined) {
      const fx = -Math.sin(input.selfYaw);
      const fz = -Math.cos(input.selfYaw);
      const cos = (fx * dx + fz * dz) / distance;
      const half = AI.sightConeDegrees * (m?.coneScale ?? 1);
      inCone = cos >= Math.cos((half / 2) * (Math.PI / 180)) - 1e-9;
    }
    if (inCone) {
      const eye = { x: s.x, y: s.y + AI.eyeHeight, z: s.z };
      const height = m?.targetHeight !== undefined ? Math.min(AI.chestHeight, Math.max(0, m.targetHeight)) : AI.chestHeight;
      sees =
        !(m && m.blockSight.length > 0 && blocked(s, t, m.blockSight)) &&
        input.lineOfSight(eye, { x: t.x, y: t.y + height, z: t.z });
    }
  }
  return { sees, hears, notices: input.damagedBy || sees || hears, distance };
}

/** True when the ground segment a to b touches any blocker disc. */
function blocked(a: P3, b: P3, blockers: readonly SightBlocker[]): boolean {
  const sx = b.x - a.x;
  const sz = b.z - a.z;
  const len2 = sx * sx + sz * sz;
  for (const c of blockers) {
    if (!(c.r > 0)) continue;
    const u = len2 > 0 ? Math.max(0, Math.min(1, ((c.x - a.x) * sx + (c.z - a.z) * sz) / len2)) : 0;
    if (Math.hypot(a.x + sx * u - c.x, a.z + sz * u - c.z) <= c.r) return true;
  }
  return false;
}

/**
 * Line-of-sight adapter over the physics world: a ray from `from` to `to`; visible when nothing is
 * hit before the target, or the first hit is the target's collider. `excludeSelf` is the enemy's
 * own collider (PhysicsWorld.raycast takes one exclude). Other enemies do block sight.
 */
export function makeLineOfSight(
  physics: PhysicsQueries,
  targetCollider: unknown,
  excludeSelf?: unknown,
): (from: P3, to: P3) => boolean {
  return (from, to) => {
    const dir = { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
    const len = Math.hypot(dir.x, dir.y, dir.z);
    if (!(len > 0) || !Number.isFinite(len)) return true;
    const hit = physics.raycast(from, dir, len, (excludeSelf ?? undefined) as Collider | undefined);
    return hit === null || hit.collider === targetCollider;
  };
}
