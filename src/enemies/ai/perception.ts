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

  const hears = distance <= (input.targetLoud ? AI.hearingLoud : AI.hearingQuiet);

  let sees = false;
  if (distance <= AI.sightRange) {
    let inCone = true;
    if (distance > 1e-6) {
      const fx = -Math.sin(input.selfYaw);
      const fz = -Math.cos(input.selfYaw);
      const cos = (fx * dx + fz * dz) / distance;
      inCone = cos >= Math.cos((AI.sightConeDegrees / 2) * (Math.PI / 180)) - 1e-9;
    }
    if (inCone) {
      sees = input.lineOfSight(
        { x: s.x, y: s.y + AI.eyeHeight, z: s.z },
        { x: t.x, y: t.y + AI.chestHeight, z: t.z },
      );
    }
  }
  return { sees, hears, notices: input.damagedBy || sees || hears, distance };
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
