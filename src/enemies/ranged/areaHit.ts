import * as THREE from 'three';
import type { EnemyHost } from '../ports';
import type { AreaSpec, MoveDef } from '../types';
import { AREA_HEIGHT_TOLERANCE, RANGED_ATTACK_PREFIX } from './tuning';
import type { Shooter } from './EnemyProjectiles';

const tmp = new THREE.Vector3();

/** The centre of an area on the ground: at the attacker, or `offset` metres ahead of it (yaw 0 faces -Z). */
export function areaCentre(spec: AreaSpec, shooter: Pick<Shooter, 'feet' | 'yaw'>): { x: number; y: number; z: number } {
  if (spec.centre === 'self') return { x: shooter.feet.x, y: shooter.feet.y, z: shooter.feet.z };
  const off = spec.offset ?? 0;
  return { x: shooter.feet.x - Math.sin(shooter.yaw) * off, y: shooter.feet.y, z: shooter.feet.z - Math.cos(shooter.yaw) * off };
}

/**
 * Hits the player once, if their feet are inside the circle (stomp, slam, the crawler's landing). The request is a
 * `kind: 'melee'` hit like a tracer's, so a dodge i-frame, a block (yellow moves) and the Act 1 modifiers apply; red moves
 * are unblockable. Companions are not aimed at: an area is the enemy's attack on the player. Returns whether a hit landed.
 */
export function areaHit(host: EnemyHost, shooter: Shooter, move: MoveDef): boolean {
  const spec = move.area;
  const apply = host.damage.apply;
  if (!spec || !apply) return false;
  const centre = areaCentre(spec, shooter);
  const feet = host.player.feet;
  if (Math.hypot(feet.x - centre.x, feet.z - centre.z) > spec.radius) return false;
  if (Math.abs(feet.y - centre.y) > AREA_HEIGHT_TOLERANCE) return false;
  const player = host.actors.player;
  if (player.dead) return false;
  const direction = new THREE.Vector3(feet.x - centre.x, 0, feet.z - centre.z);
  if (direction.lengthSq() < 1e-8) direction.set(-Math.sin(shooter.yaw), 0, -Math.cos(shooter.yaw));
  direction.normalize();
  const result = apply.call(host.damage, {
    attackerId: shooter.id,
    targetId: player.id,
    amount: move.damage * shooter.damageScale,
    poise: move.poise,
    kind: 'melee',
    attackId: RANGED_ATTACK_PREFIX + move.id,
    direction,
    unblockable: move.telegraph === 'dodge',
    ...(move.element ? { element: move.element } : {}),
    point: tmp.set(feet.x, feet.y + 0.2, feet.z).clone(),
  });
  return result?.outcome === 'hit';
}
