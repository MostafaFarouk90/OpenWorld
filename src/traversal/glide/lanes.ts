// The Dragonspine Glide's six lanes (contracts v0.7 item 5; plan 3.5): K1's ledge sites (`ACT3_GLIDE_LEDGES`) as K0's
// `GlideLedgeDef`, the lift a glider meets (K1's thermals plus K7's slope wind), the lane corridor and the straight-glide
// check the tuning test runs. Pure: no engine imports beyond K0's and K1's data.
import type { Vec3Like } from '../../core/events';
import { ACT3_GLIDE_LEDGES, ACT3_GLIDE_UPDRAFTS, type Act3GlideLedge, type Act3GlideLedgeId } from '../../region/act3/act3Glide';
import { GLIDE_TUNING, type GlideLedgeDef, type UpdraftDef } from '../../movement/types';

/** M34 opens the ledges (plan 3.5). */
export const GLIDE_OPEN_FLAG = 'story.m34.complete';
/** M30 (the Last Anvil restored) makes the lift visible as heat shimmer (design 7.5); the lift works before it. */
export const SHIMMER_FLAG = 'shrine.last-anvil.lit';

export const GLIDE_RULES = {
  /** Steering: A/D turn the glide yaw at this rate (rad/s), clamped to the lane. */
  turnRate: 0.8,
  /** Upward speed is capped here (m/s), whatever the lift adds up to. */
  maxClimb: 6,
  /** The corridor: the lane's half-angle plus this (rad), and this many metres either side at the lip. */
  corridorSlack: 0.15,
  corridorMargin: 60,
  /** Nothing in the Dragonspine glides past this z (the world edge is 17000; the summit is kept south of 16900). */
  maxZ: 16900,
  /** A launch that never leaves the ground within this many seconds is cancelled. */
  launchTimeout: 2,
  /** Metres behind the lip, along the heading, where a glide starts and a catch returns (K1's fallback stand). */
  standBack: 2,
  /** A jump in position larger than this between ticks is another system's teleport. */
  teleportJump: 5,
} as const;

/**
 * Slope wind (K7, coordinator ruling A, 2026-10-30; a taste call Mostafa may veto, logged in design/changes-applied.md):
 * the three lanes that run down slopes gentler than the glider's 4:1 get a steady wind up their slope. Inside the lane's
 * corridor the glider gains `lift` (m/s) near the ground, fading to nothing `fadeTop` m up, so it settles at a height
 * where the wind matches the sink and follows the slope down; `stopBefore` m short of the landing target the wind drops
 * and the glider sinks in. Tuned by `lanes.test.ts`.
 */
export const SLOPE_WIND: Readonly<Partial<Record<Act3GlideLedgeId, number>>> = {
  'summit-skyhold': 4.5,
  'anvil-rime-pass': 5,
  'rime-pass-lodge': 4,
};
/** Full lift up to `fullBelow` m above the ground, none at `fadeTop`; the wind drops `stopBefore` m short of the target. */
export const SLOPE_WIND_PROFILE = { fullBelow: 8, fadeTop: 40, stopBefore: 40 } as const;

export interface GlideLane {
  site: Act3GlideLedge;
  def: GlideLedgeDef;
  /** The slope wind's lift (m/s), 0 on the thermal lanes. */
  wind: number;
  /** Along the lane (m from the lip), where the wind stops: `stopBefore` short of the target. */
  windStop: number;
}

export const glideId = (site: Act3GlideLedgeId): string => `glide.${site}`;
/** K4 PR 2's launch platform anchor (agreed 2026-10-30); until it exists the stand falls back to K1's lip. */
export const launchAnchorId = (site: Act3GlideLedgeId): string => `dragonspine.glide.${site}.launch`;
/** Interactable id (`kind:name`, no dots). */
export const glideInteractId = (site: Act3GlideLedgeId): string => `glide:${site}`;

export const GLIDE_LANES: readonly GlideLane[] = (Object.keys(ACT3_GLIDE_LEDGES) as Act3GlideLedgeId[]).map((id) => {
  const site = ACT3_GLIDE_LEDGES[id];
  return {
    site,
    wind: SLOPE_WIND[id] ?? 0,
    windStop: Math.hypot(site.target.x - site.ledge.x, site.target.z - site.ledge.z) - SLOPE_WIND_PROFILE.stopBefore,
    def: {
      id: glideId(id),
      anchorId: launchAnchorId(id),
      heading: site.heading,
      laneHalfAngle: site.laneHalfAngle,
      landingAreas: site.landingAreas,
      openWhen: { all: [GLIDE_OPEN_FLAG] },
    },
  };
});

/**
 * K1's thermals as K7 tunes them (K1's comment hands K7 the tuning). The Wyrm's Hearth column is widened to take in the
 * launch on the amphitheatre's rim (120 m from its centre: the bowl is flat, so the glider must lift off there) and kept
 * 30 m tall, so a glider leaving it in any direction comes down inside the hearth's catch box.
 */
export const HEARTH_UPDRAFT_TUNING = { radius: 130, height: 30 } as const;
export const GLIDE_UPDRAFTS: readonly UpdraftDef[] = ACT3_GLIDE_UPDRAFTS.map((u) =>
  u.id === 'updraft.wyrms-hearth' ? { ...u, ...HEARTH_UPDRAFT_TUNING } : u,
);

/** K1's fallback stand: `standBack` m behind the lip along the heading, on the ground (yaw 0 faces -Z). */
export function fallbackStand(site: Act3GlideLedge, heightAt: (x: number, z: number) => number): Vec3Like {
  const x = site.ledge.x + Math.sin(site.heading) * GLIDE_RULES.standBack;
  const z = site.ledge.z + Math.cos(site.heading) * GLIDE_RULES.standBack;
  return { x, y: heightAt(x, z) + 0.05, z };
}

export function inBox(b: { x0: number; z0: number; x1: number; z1: number }, x: number, z: number): boolean {
  return x >= Math.min(b.x0, b.x1) && x <= Math.max(b.x0, b.x1) && z >= Math.min(b.z0, b.z1) && z <= Math.max(b.z0, b.z1);
}

export const inLanding = (lane: GlideLane, x: number, z: number): boolean => lane.def.landingAreas.some((a) => inBox(a, x, z));

/** Wraps an angle to (-PI, PI]. */
export function wrapAngle(a: number): number {
  let r = a % (Math.PI * 2);
  if (r > Math.PI) r -= Math.PI * 2;
  if (r <= -Math.PI) r += Math.PI * 2;
  return r;
}

/** The yaw clamped to the lane's allowed headings. A full-circle lane (the hearth loop) never clamps. */
export function clampToLane(lane: GlideLane, yaw: number): number {
  const half = lane.def.laneHalfAngle;
  if (half >= Math.PI) return wrapAngle(yaw);
  const d = wrapAngle(yaw - lane.def.heading);
  return wrapAngle(lane.def.heading + Math.max(-half, Math.min(half, d)));
}

/**
 * Inside the lane's corridor: a wedge from the lip at the half-angle plus slack, widened by the margin, out to the
 * catch box (the full-circle lane is its catch box). Landing areas always count as inside.
 */
export function inCorridor(lane: GlideLane, x: number, z: number): boolean {
  const s = lane.site;
  if (inLanding(lane, x, z)) return true;
  if (!inBox(s.catchBox, x, z)) return false;
  const half = lane.def.laneHalfAngle + GLIDE_RULES.corridorSlack;
  if (half >= Math.PI) return true;
  const dx = x - s.ledge.x;
  const dz = z - s.ledge.z;
  // Along and across the heading (yaw 0 faces -Z, so the heading's direction is (-sin, -cos)).
  const fx = -Math.sin(lane.def.heading);
  const fz = -Math.cos(lane.def.heading);
  const along = dx * fx + dz * fz;
  const across = Math.abs(dx * fz - dz * fx);
  if (along < -GLIDE_RULES.corridorMargin) return false;
  return across <= GLIDE_RULES.corridorMargin + Math.max(0, along) * Math.tan(half);
}

/** The slope wind's lift at a height above the ground. */
export function windLift(wind: number, aboveGround: number): number {
  if (wind <= 0) return 0;
  const { fullBelow, fadeTop } = SLOPE_WIND_PROFILE;
  if (aboveGround <= fullBelow) return wind;
  if (aboveGround >= fadeTop) return 0;
  return (wind * (fadeTop - aboveGround)) / (fadeTop - fullBelow);
}

/** Lift from the updraft columns at `p` (summed). */
export function updraftLift(p: Vec3Like, updrafts: readonly UpdraftDef[] = GLIDE_UPDRAFTS): number {
  let lift = 0;
  for (const u of updrafts) {
    if (p.y < u.centre.y || p.y > u.centre.y + u.height) continue;
    if (Math.hypot(p.x - u.centre.x, p.z - u.centre.z) < u.radius) lift += u.lift;
  }
  return lift;
}

/** Everything that lifts a glider on `lane` at `p`, `ground` m below: the thermals and, inside the corridor, the wind. */
export function liftAt(lane: GlideLane, p: Vec3Like, ground: number, updrafts: readonly UpdraftDef[] = GLIDE_UPDRAFTS): number {
  let lift = updraftLift(p, updrafts);
  if (lane.wind > 0 && alongLane(lane, p.x, p.z) < lane.windStop && inCorridor(lane, p.x, p.z)) lift += windLift(lane.wind, p.y - ground);
  return lift;
}

/** Metres from the lip along the lane's heading. */
export function alongLane(lane: GlideLane, x: number, z: number): number {
  return (x - lane.site.ledge.x) * -Math.sin(lane.def.heading) + (z - lane.site.ledge.z) * -Math.cos(lane.def.heading);
}

export interface StraightGlide {
  /** Touched the ground inside a landing area. */
  landed: boolean;
  /** Touched the ground anywhere (false: the glide left the corridor, or ran out of time). */
  touched: boolean;
  /** Left the corridor or passed `maxZ` first: the game ends such a glide as `contained` and returns the player. */
  contained: boolean;
  at: { x: number; z: number };
  /** The lowest clearance over the ground from `skip` m past the lip, outside the landing areas. */
  minClearance: number;
  /** The highest the glider rose above the ground (the save-loader limit is 200). */
  maxAboveGround: number;
  seconds: number;
}

/**
 * A straight glide at `yaw` from the lane's stand at GLIDE_TUNING (10 m/s forward, 2.5 m/s sink), with the same lift the
 * game applies, until it touches the ground, leaves the corridor or runs 300 s. The tuning test's check (it mirrors `GlidePlayer`).
 */
export function flyStraight(
  lane: GlideLane,
  heightAt: (x: number, z: number) => number,
  opts: { yaw?: number; wind?: boolean; skip?: number; updrafts?: readonly UpdraftDef[] } = {},
): StraightGlide {
  const l = opts.wind === false ? { ...lane, wind: 0 } : lane;
  const yaw = opts.yaw ?? lane.def.heading;
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  const dt = 1 / 20;
  const start = fallbackStand(lane.site, heightAt);
  let x = start.x;
  let z = start.z;
  let y = start.y;
  let vy = 0;
  let minClearance = Infinity;
  let maxAbove = 0;
  const skip = opts.skip ?? 60;
  for (let t = 0; t < 300; t += dt) {
    x += fx * GLIDE_TUNING.forwardSpeed * dt;
    z += fz * GLIDE_TUNING.forwardSpeed * dt;
    const g = heightAt(x, z);
    const lift = liftAt(l, { x, y, z }, g, opts.updrafts);
    // As the game: (-sink + lift) whenever there is lift, else gravity down to the sink rate.
    vy = lift > 0 ? Math.min(GLIDE_RULES.maxClimb, -GLIDE_TUNING.sinkRate + lift) : Math.max(vy - 20 * dt, -GLIDE_TUNING.sinkRate);
    y += vy * dt;
    const along = Math.hypot(x - lane.site.ledge.x, z - lane.site.ledge.z);
    if (along >= skip && !inLanding(lane, x, z)) minClearance = Math.min(minClearance, y - g);
    maxAbove = Math.max(maxAbove, y - g);
    const end = { at: { x, z }, minClearance, maxAboveGround: maxAbove, seconds: t };
    if (y <= g) return { ...end, landed: inLanding(lane, x, z), touched: true, contained: false };
    if (!inCorridor(lane, x, z) || z > GLIDE_RULES.maxZ) return { ...end, landed: false, touched: false, contained: true };
  }
  return { landed: false, touched: false, contained: false, at: { x, z }, minClearance, maxAboveGround: maxAbove, seconds: 300 };
}
