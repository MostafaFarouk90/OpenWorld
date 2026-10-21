/** Defender-band order of the golem's poise rule (after the Footman guard at -50). */
export const GOLEM_CORE_ORDER = -40;

/** A hit from behind: the attack's horizontal direction (attacker to golem) points along the golem's facing. */
const BEHIND_DOT = 0.5;

/**
 * Whether a hit lands on the Cinder Golem's back core: a swing whose struck hurtbox is the named `core`, or (a bolt or spell
 * with no bone) any hit coming from behind the golem. `yaw` 0 faces -Z.
 */
export function isCoreHit(bone: string | undefined, direction: { x: number; z: number } | undefined, yaw: number): boolean {
  if (bone) return bone === 'core';
  if (!direction) return false;
  const len = Math.hypot(direction.x, direction.z);
  if (!(len > 1e-6)) return false;
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  return (direction.x * fx + direction.z * fz) / len > BEHIND_DOT;
}
