// The whistle (plans/slice-2-ashmare.md section 1, review S3): where the horse comes from and where it stops.
// Ground follows the companions contract's order (down-ray, then `nav.floorAt`, then `heightAt` outdoors).
import { groundAt, lineOfSight, type GroundPorts } from '../companions/ground';
import type { Vec3 } from '../physics/PhysicsWorld';
import { MOUNT_TUNING } from './tuning';

export interface SummonPorts extends GroundPorts {
  /** True when a ball at chest height can travel from `a` to `b` (both chest points) without a hit. */
  ballClear(a: Vec3, b: Vec3): boolean;
}

export interface HorseSpot extends Vec3 {
  yaw: number;
}

export type WhistlePlan =
  | { kind: 'run'; to: HorseSpot }
  | { kind: 'spawn'; at: HorseSpot; to: HorseSpot }
  | { kind: 'pop'; at: HorseSpot };

const CHEST = 1.0;
const chest = (p: Vec3): Vec3 => ({ x: p.x, y: p.y + CHEST, z: p.z });
const yawTo = (from: Vec3, to: Vec3): number => Math.atan2(-(to.x - from.x), -(to.z - from.z));

/** Feet with the forward vector of `yaw` scaled by `fwd` and the right vector by `right`. */
function offset(p: Vec3, yaw: number, fwd: number, right: number): { x: number; z: number } {
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  return { x: p.x + fx * fwd - fz * right, z: p.z + fz * fwd + fx * right };
}

/** A walkable path for a horse with no collider: ground every metre with no step above 45 degrees, and a clear ball. */
export function pathClear(ports: SummonPorts, from: Vec3, to: Vec3): boolean {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const len = Math.hypot(dx, dz);
  const maxStep = Math.tan(MOUNT_TUNING.pathMaxSlope);
  const n = Math.max(1, Math.ceil(len));
  const outdoors = !ports.indoors();
  let prev = from.y;
  let prevH = outdoors ? ports.heightAt(from.x, from.z) : NaN;
  for (let i = 1; i <= n; i++) {
    const k = i / n;
    const x = from.x + dx * k;
    const z = from.z + dz * k;
    const y = groundAt(ports, x, z, prev);
    if (y === null) return false;
    const limit = maxStep * (len / n) + 0.05;
    if (Math.abs(y - prev) > limit) return false;
    // The heightfield too, so a cliff the down-ray cannot see (it starts under the slope) still blocks.
    if (outdoors) {
      const h = ports.heightAt(x, z);
      if (Number.isFinite(h) && Number.isFinite(prevH) && Math.abs(h - prevH) > limit) return false;
      prevH = h;
    }
    prev = y;
  }
  return ports.ballClear(chest(from), chest(to));
}

/**
 * Where the horse stops: beside the player (right, then left), facing the player's way. When the feet stand more
 * than `sameLevel` above the heightfield (a rooftop, a wall walk, a bridge) it waits at street level instead: the
 * first point on rings of 4, 8 and 12 m whose down-ray from the player's height lands on the ground, not a roof.
 * Null indoors, when the player's ground is not resident, or when no street spot is found.
 */
export function arrivalSpot(ports: SummonPorts, feet: Vec3, yaw: number): HorseSpot | null {
  const t = MOUNT_TUNING;
  if (ports.indoors() || !ports.isResident(feet.x, feet.z)) return null;
  const h = ports.heightAt(feet.x, feet.z);
  if (!(Number.isFinite(h) && feet.y - h > t.sameLevel)) {
    for (const side of [1, -1]) {
      const c = offset(feet, yaw, 0, side * t.arriveBeside);
      const y = groundAt(ports, c.x, c.z, feet.y);
      if (y === null || Math.abs(y - feet.y) > t.spawnLevel) continue;
      if (!ports.ballClear(chest(feet), chest({ x: c.x, y, z: c.z }))) continue;
      return { x: c.x, y, z: c.z, yaw };
    }
    return { ...feet, yaw };
  }
  for (const r of [4, 8, 12]) {
    for (let k = 0; k < 8; k++) {
      const a = yaw + Math.PI + (k * Math.PI) / 4;
      const x = feet.x - Math.sin(a) * r;
      const z = feet.z - Math.cos(a) * r;
      if (!ports.isResident(x, z)) continue;
      const g = ports.heightAt(x, z);
      if (!Number.isFinite(g)) continue;
      const top = feet.y + 1.5;
      const hit = ports.raycast({ x, y: top, z }, { x: 0, y: -1, z: 0 }, top - g + 1);
      const ground = hit ? hit.point.y : g;
      if (Math.abs(ground - g) > 0.5) continue;
      return { x, y: ground, z, yaw: Math.atan2(-(feet.x - x), -(feet.z - z)) };
    }
  }
  return null;
}

/**
 * Where the whistled horse comes from: its own spot when within range with a clear path; else the first clear
 * candidate `spawnBehind` behind the arrival spot (behind, behind-left, behind-right); else it pops in at the
 * arrival spot. `horse` is null when it is not placed. Null when there is no arrival spot (see `arrivalSpot`).
 */
export function planWhistle(ports: SummonPorts, feet: Vec3, yaw: number, horse: Vec3 | null): WhistlePlan | null {
  const t = MOUNT_TUNING;
  const to = arrivalSpot(ports, feet, yaw);
  if (!to) return null;
  if (horse) {
    const d = Math.hypot(horse.x - to.x, horse.z - to.z);
    if (d <= t.whistleRange && Math.abs(horse.y - to.y) <= t.whistleRange / 4 && pathClear(ports, horse, to)) {
      return { kind: 'run', to: { ...to, yaw: d > 0.1 ? yawTo(horse, to) : to.yaw } };
    }
  }
  const back = t.spawnBehind;
  for (const [fwd, right] of [
    [-back, 0],
    [-back * 0.8, -back * 0.6],
    [-back * 0.8, back * 0.6],
  ]) {
    const c = offset(to, yaw, fwd, right);
    if (!ports.isResident(c.x, c.z)) continue;
    const y = groundAt(ports, c.x, c.z, to.y);
    if (y === null || Math.abs(y - to.y) > t.spawnLevel) continue;
    const at = { x: c.x, y, z: c.z };
    if (!lineOfSight(ports, chest(to), chest(at))) continue;
    if (!pathClear(ports, at, to)) continue;
    return { kind: 'spawn', at: { ...at, yaw: yawTo(at, to) }, to };
  }
  return { kind: 'pop', at: to };
}
