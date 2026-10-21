import type { Vec3 } from '../../physics/PhysicsWorld';
import { EMBER_WYRM } from './tuning';

export interface LandingPorts {
  heightAt(x: number, z: number): number;
  /** A ray against the static world (null without physics or without a hit). */
  raycast(origin: Vec3, dir: Vec3, length: number): { distance: number } | null;
}

/** Rings tried around the wanted point: the point itself, then 8 directions at half and full radius. */
const RINGS = [0, 0.5, 1] as const;
const DIRECTIONS = 8;
/** Clear space needed around a landing spot (metres), checked with eight feelers at hip height. */
const CLEARANCE = 1.6;
/** A ray from above that meets something this far over the ground found a roof or a wall top, not ground. */
const ROOF_MARGIN = 0.5;
const SKY = 30;

/**
 * An open walkable spot within `radius` of `near` (plans/act2-A6a.md 1.3): ground slope under 35 degrees, nothing
 * standing on it (a roof, a cart) and no wall within 1.6 m. Deterministic; the first candidate that passes wins.
 * Null when none does (the wyrm keeps circling and tries again).
 */
export function findLandingSpot(near: { x: number; z: number }, ports: LandingPorts, radius: number = EMBER_WYRM.landingSearchRadius): Vec3 | null {
  if (!Number.isFinite(near.x) || !Number.isFinite(near.z)) return null;
  const maxGrade = Math.tan((EMBER_WYRM.landingMaxSlopeDeg * Math.PI) / 180);
  for (const ring of RINGS) {
    const count = ring === 0 ? 1 : DIRECTIONS;
    for (let i = 0; i < count; i++) {
      const a = (i / DIRECTIONS) * Math.PI * 2;
      const x = near.x + Math.cos(a) * radius * ring;
      const z = near.z + Math.sin(a) * radius * ring;
      const y = ports.heightAt(x, z);
      if (!Number.isFinite(y)) continue;
      if (!gentle(x, z, y, ports, maxGrade)) continue;
      const down = ports.raycast({ x, y: y + SKY, z }, { x: 0, y: -1, z: 0 }, SKY + 1);
      if (down && SKY - down.distance > ROOF_MARGIN) continue;
      if (!clear(x, y, z, ports)) continue;
      return { x, y, z };
    }
  }
  return null;
}

function gentle(x: number, z: number, y: number, ports: LandingPorts, maxGrade: number): boolean {
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const h = ports.heightAt(x + dx, z + dz);
    if (!Number.isFinite(h) || Math.abs(h - y) > maxGrade) return false;
  }
  return true;
}

function clear(x: number, y: number, z: number, ports: LandingPorts): boolean {
  for (let i = 0; i < DIRECTIONS; i++) {
    const a = (i / DIRECTIONS) * Math.PI * 2;
    if (ports.raycast({ x, y: y + 1, z }, { x: Math.cos(a), y: 0, z: Math.sin(a) }, CLEARANCE)) return false;
  }
  return true;
}
