// Lava, vents and heat (contracts v0.9 item 4, plan Part 3.3): the shared types N3 builds the volumes from, and the two
// small pure rules every lava touch uses, so N3 (the volumes), N6 (the Anvil's rising lava) and N4 (the siege's braziers)
// share one floor. Engine metres.
import type { Vec3 } from '../physics/PhysicsWorld';

/** A lava surface: a box, a circle, or a ribbon (a channel: a polyline with a half width). */
export type LavaShape =
  | { kind: 'box'; x0: number; z0: number; x1: number; z1: number }
  | { kind: 'circle'; x: number; z: number; r: number }
  | { kind: 'ribbon'; points: readonly (readonly [number, number])[]; halfWidth: number };

export interface LavaVolumeDef {
  id: string;
  shape: LavaShape;
  /** The surface height (m); feet below it are in the lava. */
  surfaceY: number;
  /** Percent of max health lost per second while in (plan 3.3: 15). */
  damagePctPerS: number;
  /** Where a player in the lava is thrown: the nearest of these (ties by list order). At least one. */
  safeLips: readonly Vec3[];
}

/** Plan 3.3's default burn rate. */
export const LAVA_DAMAGE_PCT_PER_S = 15;
/** The Act 4 exposure floor, reused: lava never takes health under this fraction of max, and never kills. */
export const LAVA_HEALTH_FLOOR = 0.1;

/** A heat vent: open (burning) for `openS`, closed for `closedS`; a `wheel` names the valve that holds it shut. */
export interface VentDef {
  id: string;
  at: Vec3;
  openS: number;
  closedS: number;
  wheel?: string;
}

export const VENT_OPEN_S = 6;
export const VENT_CLOSED_S = 10;

/** A Surge crossing: a lip marker pair the Leap reads (N3 places them; the Leap's own rules are shipped). */
export interface SurgeCrossingDef {
  id: string;
  from: Vec3;
  to: Vec3;
}

/** `mesh.userData[HAZE_FLAG] = true`: N3's heat-haze pass draws the flagged meshes (High and Medium only). */
export const HAZE_FLAG = 'caldera.haze';
/** The spike's ceiling for haze cards per view (plans/act5-N0-spike.md). */
export const HAZE_MAX_CARDS = 24;

const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/**
 * Health after `dt` seconds in lava: `pctPerS` percent of max per second, never below LAVA_HEALTH_FLOOR of max and never
 * to 0. Health already under the floor is left as it is (lava never heals). Bad input returns `health` unchanged.
 */
export function lavaDamage(health: number, maxHealth: number, dt: number, pctPerS: number = LAVA_DAMAGE_PCT_PER_S): number {
  if (!isNum(health) || !isNum(maxHealth) || !isNum(dt) || !isNum(pctPerS) || maxHealth <= 0 || dt <= 0 || pctPerS <= 0) return health;
  const floor = Math.max(Number.MIN_VALUE, maxHealth * LAVA_HEALTH_FLOOR);
  if (health <= floor) return health;
  return Math.max(floor, health - (maxHealth * pctPerS * dt) / 100);
}

/** The nearest safe lip to `feet` in x, z (ties keep list order); undefined for an empty list. */
export function nearestSafeLip(feet: { x: number; z: number }, lips: readonly Vec3[]): Vec3 | undefined {
  let best: Vec3 | undefined;
  let bestD = Infinity;
  for (const l of lips) {
    const d = Math.hypot(l.x - feet.x, l.z - feet.z);
    if (d < bestD) {
      bestD = d;
      best = l;
    }
  }
  return best;
}

/** True when (x, z) lies on the shape (edges inclusive). */
export function onLavaShape(shape: LavaShape, x: number, z: number): boolean {
  if (shape.kind === 'box') return x >= shape.x0 && x <= shape.x1 && z >= shape.z0 && z <= shape.z1;
  if (shape.kind === 'circle') return Math.hypot(x - shape.x, z - shape.z) <= shape.r;
  const p = shape.points;
  for (let i = 1; i < p.length; i++) {
    const [ax, az] = p[i - 1];
    const [bx, bz] = p[i];
    const dx = bx - ax;
    const dz = bz - az;
    const len2 = dx * dx + dz * dz;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2)) : 0;
    if (Math.hypot(x - (ax + dx * t), z - (az + dz * t)) <= shape.halfWidth) return true;
  }
  return false;
}

/** Feet in the volume: on its shape and below its surface. */
export function inLava(def: LavaVolumeDef, feet: Vec3): boolean {
  return feet.y < def.surfaceY && onLavaShape(def.shape, feet.x, feet.z);
}

/**
 * A vent's state `t` seconds into its cycle (open first). 'open' means vented (plan 2.7, M48): the heat is let out, the
 * crust over the channel is cooled and walkable for `openS`; 'closed' means the crust is hot (lava rules apply). A turned
 * wheel starts a cycle (pass `t` from the turn). `wheelHeld` (a wheel jammed or held shut) keeps it closed.
 */
export function ventStateAt(def: Pick<VentDef, 'openS' | 'closedS'>, t: number, wheelHeld = false): 'open' | 'closed' {
  if (wheelHeld) return 'closed';
  const cycle = def.openS + def.closedS;
  if (!(cycle > 0) || !isNum(t)) return 'closed';
  const u = ((t % cycle) + cycle) % cycle;
  return u < def.openS ? 'open' : 'closed';
}
