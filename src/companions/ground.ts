// Where the companion can stand: ground under a point and the teleport-behind spot (plans/slice-2-tobb.md
// section 13, S3). Indoors (the vault floats about 150 m above the chapel) the heightfield is never used, so a
// ray miss can never drop him onto the terrain far below.
import type { Vec3 } from './FollowModel';
import { behind } from './FollowModel';
import { COMPANION_TUNING } from './tuning';

export interface RayHitLike {
  distance: number;
  point: Vec3;
}

/** The world as the probe sees it; the plugin builds it from the game context, tests from fakes. */
export interface GroundPorts {
  /** Excludes the player's capsule. */
  raycast(origin: Vec3, dir: Vec3, maxDistance: number): RayHitLike | null;
  isResident(x: number, z: number): boolean;
  heightAt(x: number, z: number): number;
  /** True while the player is inside an interior (`interiors.current`, or a nav grid under the player). */
  indoors(): boolean;
  /** 3a's `nav` service, when present. */
  nav?: { hasGrid(at: Vec3): boolean; floorAt?(at: Vec3): number | null } | null;
}

const DOWN = { x: 0, y: -1, z: 0 };
/** How far above the current height the down-ray starts, and how far it reaches. */
const RAY_LIFT = 1.5;
const RAY_REACH = 8;
const INSIDE_SOLID = 0.05;
/** A heightfield fallback more than this below the current height is refused. */
const MAX_DROP = 20;

/** Counts rays per tick; `take` refuses once the budget is spent. */
export class RayBudget {
  private used = 0;
  constructor(private readonly max: number = COMPANION_TUNING.maxRaysPerTick) {}
  reset(): void {
    this.used = 0;
  }
  take(n = 1): boolean {
    if (this.used + n > this.max) return false;
    this.used += n;
    return true;
  }
  get spent(): number {
    return this.used;
  }
}

/**
 * Ground height near (x, z), searching down from `yHint + 1.5`: the down-ray first, then `nav.floorAt`, then the
 * heightfield outdoors only. Null when nothing usable is there (not resident outdoors, nothing indoors). A ray that
 * starts inside a solid (a wall) keeps the current height: he has no collider and walks through greybox walls.
 */
export function groundAt(ports: GroundPorts, x: number, z: number, yHint: number): number | null {
  if (![x, z, yHint].every(Number.isFinite)) return null;
  const indoors = ports.indoors();
  if (!indoors && !ports.isResident(x, z)) return null;
  const hit = ports.raycast({ x, y: yHint + RAY_LIFT, z }, DOWN, RAY_REACH);
  if (hit) return hit.distance <= INSIDE_SOLID ? yHint : hit.point.y;
  const at = { x, y: yHint, z };
  if (ports.nav?.hasGrid(at)) {
    const f = ports.nav.floorAt?.(at);
    if (f !== null && f !== undefined && Number.isFinite(f)) return f;
  }
  if (indoors) return null;
  const h = ports.heightAt(x, z);
  // Far below the current height means a floating floor (the vault) we just stepped off: never drop onto the terrain.
  return h < yHint - MAX_DROP ? null : h;
}

/** Clear line between two chests (Cael's and the candidate's), so he never appears behind a wall. */
export function lineOfSight(ports: GroundPorts, from: Vec3, to: Vec3): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-3) return true;
  const hit = ports.raycast(from, { x: dx / len, y: dy / len, z: dz / len }, len);
  return !hit || hit.distance >= len - 0.05;
}

export interface SpotQuery {
  player: Vec3;
  playerYaw: number;
  /** The newest trail point before the jump (the last candidate). */
  trailPoint?: Vec3 | null;
  /** Indoors with no candidate on a grid: the interior's entry anchor, else null (then the player's feet). */
  indoorFallback?: Vec3 | null;
}

/**
 * Teleport-behind spot: behind, then left, then right of the player, then the newest trail point. Each candidate
 * costs two rays (sight and ground) from `budget`; when the budget runs out the search returns 'later' and `cursor`
 * carries where it stopped. 'unresident': the ground under the player is not loaded yet (keep him hidden).
 * 'exhausted': no candidate outdoors passed.
 */
export function findSpot(
  ports: GroundPorts,
  q: SpotQuery,
  budget: RayBudget,
  cursor: { next: number },
): Vec3 | 'exhausted' | 'unresident' | 'later' {
  const t = COMPANION_TUNING;
  const { player, playerYaw } = q;
  const indoors = ports.indoors();
  if (!indoors && !ports.isResident(player.x, player.z)) return 'unresident';
  const candidates: { x: number; z: number; y?: number }[] = [
    behind(player, playerYaw, t.teleportBack, 0),
    behind(player, playerYaw, 0.5, -t.teleportBack),
    behind(player, playerYaw, 0.5, t.teleportBack),
  ];
  if (q.trailPoint) candidates.push(q.trailPoint);
  const chest = { x: player.x, y: player.y + t.chestHeight, z: player.z };
  while (cursor.next < candidates.length) {
    const c = candidates[cursor.next];
    if ((indoors && ports.nav && !ports.nav.hasGrid({ x: c.x, y: player.y, z: c.z })) || (!indoors && !ports.isResident(c.x, c.z))) {
      cursor.next++;
      continue;
    }
    // Only candidates that will cast rays spend budget.
    if (!budget.take(2)) return 'later';
    cursor.next++;
    const y = groundAt(ports, c.x, c.z, c.y ?? player.y);
    if (y === null || Math.abs(y - player.y) > 3) continue;
    if (!lineOfSight(ports, chest, { x: c.x, y: y + t.chestHeight, z: c.z })) continue;
    return { x: c.x, y, z: c.z };
  }
  if (indoors) return q.indoorFallback ?? { ...player };
  return 'exhausted';
}
