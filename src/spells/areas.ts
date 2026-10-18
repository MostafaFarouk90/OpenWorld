import * as THREE from 'three';
import type { ActorLike, ActorsLike, Vec3 } from '../vfx/ports';

export interface AreaFilter {
  team?: string | readonly string[];
  /** Default true: dead actors are ignored. false includes dead actors too. */
  alive?: boolean;
}
export interface AreaHit {
  actor: ActorLike;
  /** Horizontal (XZ) distance from the centre. */
  distance: number;
  position: Vec3;
}

const scratch = new THREE.Vector3();

function accepts(a: ActorLike, filter: AreaFilter): boolean {
  if (!a.hittable) return false;
  if (a.dead && filter.alive !== false) return false;
  if (filter.team !== undefined) {
    const teams = typeof filter.team === 'string' ? [filter.team] : filter.team;
    if (!teams.includes(a.team)) return false;
  }
  return true;
}

/** Actors whose position is within `radius` (XZ plane) of the centre, nearest first. */
export function actorsInRadius(host: ActorsLike, centre: Vec3, radius: number, filter: AreaFilter = {}): AreaHit[] {
  const out: AreaHit[] = [];
  if (!(radius >= 0) || !Number.isFinite(centre.x + centre.z)) return out;
  for (const a of host.all()) {
    if (!accepts(a, filter)) continue;
    a.worldPosition(scratch);
    const d = Math.hypot(scratch.x - centre.x, scratch.z - centre.z);
    if (d <= radius) out.push({ actor: a, distance: d, position: { x: scratch.x, y: scratch.y, z: scratch.z } });
  }
  return out.sort((p, q) => p.distance - q.distance);
}

/**
 * Actors in a cone on the XZ plane. Forward for yaw is (sin yaw, cos yaw) in (x, z). An actor at the apex is
 * always inside. `halfAngle` in radians.
 */
export function actorsInCone(host: ActorsLike, centre: Vec3, yaw: number, halfAngle: number, range: number, filter: AreaFilter = {}): AreaHit[] {
  if (!Number.isFinite(yaw) || !(halfAngle >= 0)) return [];
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  return actorsInRadius(host, centre, range, filter).filter((h) => {
    if (h.distance < 1e-6) return true;
    const dx = (h.position.x - centre.x) / h.distance;
    const dz = (h.position.z - centre.z) / h.distance;
    const cos = Math.min(1, Math.max(-1, dx * fx + dz * fz));
    return Math.acos(cos) <= halfAngle + 1e-9;
  });
}
