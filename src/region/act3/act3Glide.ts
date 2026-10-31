// Act 3 thread K1: the six Dragonspine Glide ledge sites (plan 3.5), fitted to the shaped heightfield, for K7 PR 2 (the
// glide) and K4 PR 2 (the ledge dressing). K1 owns the positions only: K7 turns each into a `GlideLedgeDef` with its
// anchor and `openWhen`, tunes the updrafts and builds the catch volumes. `glideClearance` is the check both threads
// use: a straight glide at GLIDE_TUNING from the ledge to the landing centre, with the given updrafts.
import { GLIDE_TUNING, type UpdraftDef } from '../../movement/types';

export type Act3GlideLedgeId =
  | 'summit-aerie'
  | 'summit-skyhold'
  | 'skyhold-hawk-cliffs'
  | 'anvil-rime-pass'
  | 'rime-pass-lodge'
  | 'hearth-updraft';

export interface Act3GlideLedge {
  id: Act3GlideLedgeId;
  /** The launch point at the ledge's lip (engine x, z); `y` is the shaped ground there. */
  ledge: { x: number; z: number; y: number };
  /** Launch yaw (yaw 0 faces -Z), toward the landing centre. */
  heading: number;
  /** Allowed headings either side of `heading` (radians). */
  laneHalfAngle: number;
  /** Where the glide is meant to end (engine boxes, `GlideLedgeDef.landingAreas`). */
  landingAreas: readonly { x0: number; z0: number; x1: number; z1: number }[];
  /** The landing target the lane is aimed at (inside the first landing area). */
  target: { x: number; z: number };
  /** A player under this height inside `catchBox` has dropped out of the glide: return them to the ledge. */
  catchFloorY: number;
  catchBox: { x0: number; z0: number; x1: number; z1: number };
}

const yawToward = (dx: number, dz: number): number => Math.atan2(-dx, -dz);
const LANE_HALF_ANGLE = 0.35;
/** The catch box runs this far either side of the lane and past both ends. */
const CATCH_MARGIN = 150;

function ledge(
  id: Act3GlideLedgeId,
  lip: { x: number; z: number; y: number },
  target: { x: number; z: number },
  landing: { x0: number; z0: number; x1: number; z1: number },
  catchFloorY: number,
  laneHalfAngle = LANE_HALF_ANGLE,
): Act3GlideLedge {
  return {
    id,
    ledge: lip,
    heading: yawToward(target.x - lip.x, target.z - lip.z),
    laneHalfAngle,
    landingAreas: [landing],
    target,
    catchFloorY,
    catchBox: {
      x0: Math.min(lip.x, target.x, landing.x0) - CATCH_MARGIN,
      z0: Math.min(lip.z, target.z, landing.z0) - CATCH_MARGIN,
      x1: Math.max(lip.x, target.x, landing.x1) + CATCH_MARGIN,
      z1: Math.max(lip.z, target.z, landing.z1) + CATCH_MARGIN,
    },
  };
}

/**
 * The six ledges. Lip heights are the shaped ground (tested against `heightAt`). Each catch floor is 5 m above the
 * lowest ground under its lane outside the landing areas (the hearth loop's, under its rim): a player who comes down
 * there, in the Frostfang chasm (floor 300) first, is returned to the ledge; one who lands short higher up walks on.
 */
export const ACT3_GLIDE_LEDGES: Readonly<Record<Act3GlideLedgeId, Act3GlideLedge>> = {
  // Across the Frostfang chasm from the summit's east lip to the Aerie's shelf (D06, 700 m of gliding).
  'summit-aerie': ledge('summit-aerie', { x: 14450, z: 15900, y: 593 }, { x: 15500, z: 15980 }, { x0: 15300, z0: 15850, x1: 15700, z1: 16120 }, 305),
  // From the Wyrm's Hearth's west edge along the summit ridge to the top of Skyhold Cliffs.
  'summit-skyhold': ledge('summit-skyhold', { x: 13450, z: 15560, y: 600 }, { x: 12230, z: 15200 }, { x0: 12150, z0: 15130, x1: 12300, z1: 15270 }, 578),
  // Off Skyhold's south-west lip, over the Hawk Cliffs' ridge, down to the cliffs' foot.
  'skyhold-hawk-cliffs': ledge('skyhold-hawk-cliffs', { x: 12150, z: 15050, y: 566 }, { x: 11420, z: 13080 }, { x0: 11200, z0: 12600, x1: 11600, z1: 13200 }, 24),
  // From the Last Anvil's west edge down the spine to the Rime Pass shelter.
  'anvil-rime-pass': ledge('anvil-rime-pass', { x: 14640, z: 13860, y: 380 }, { x: 13000, z: 13300 }, { x0: 12900, z0: 13220, x1: 13100, z1: 13380 }, 261),
  // From the Rime Pass shelter's south edge down to Wyrmwatch Lodge.
  'rime-pass-lodge': ledge('rime-pass-lodge', { x: 13020, z: 13270, y: 250 }, { x: 13600, z: 11950 }, { x0: 13530, z0: 11845, x1: 13670, z1: 11955 }, 125),
  // The Wyrm's Hearth loop: launch off the amphitheatre's north rim, circle in the hearth's updraft, land in the bowl.
  'hearth-updraft': ledge(
    'hearth-updraft',
    { x: 13600, z: 15720, y: 600 },
    { x: 13600, z: 15600 },
    { x0: 13450, z0: 15475, x1: 13750, z1: 15725 },
    595,
    Math.PI,
  ),
};

/**
 * The updrafts K1's terrain gives a reason for (K7 tunes them): a thermal standing in the Frostfang chasm, which is what
 * carries the summit-to-Aerie glide, the wind up the Hawk Cliffs' north face (where the hawks soar), which lifts the
 * Skyhold glide over the cliffs' ridge, and the Wyrm's Hearth's own heat. The other lanes need lift K7 chooses
 * (`glideClearance` reports how much), from ridge lift or the Last Anvil's heat shimmer (design 7.5).
 */
export const ACT3_GLIDE_UPDRAFTS: readonly UpdraftDef[] = [
  { id: 'updraft.frostfang-chasm', centre: { x: 14958, y: 300, z: 15939 }, radius: 160, height: 400, lift: 6 },
  { id: 'updraft.hawk-cliffs', centre: { x: 11994, y: 100, z: 14628 }, radius: 130, height: 600, lift: 4 },
  { id: 'updraft.wyrms-hearth', centre: { x: 13600, y: 600, z: 15600 }, radius: 80, height: 120, lift: 5 },
];

/** The launch run off the lip, where the ledge dressing (K4) and the jump decide clearance, not the terrain. */
export const LIP_RUN = 60;

export interface GlideRun {
  /** True when the glide first touches ground inside a landing area. */
  landed: boolean;
  /** Where it touched (or the end of the run). */
  at: { x: number; z: number };
  /**
   * Metres of lift the straight glide needs, with no updrafts, to keep 10 m over the ground from 60 m past the lip to
   * its landing area, and reach the landing area's ground (0 if none). K7 supplies it from updrafts or the launch.
   */
  deficit: number;
}

/**
 * Flies a straight glide from the ledge toward its target at GLIDE_TUNING (forward speed, sink rate), adding each
 * updraft's lift inside its column, until it touches the ground or runs 800 m past the target.
 */
export function glideClearance(l: Act3GlideLedge, heightAt: (x: number, z: number) => number, updrafts: readonly UpdraftDef[] = []): GlideRun {
  const len = Math.hypot(l.target.x - l.ledge.x, l.target.z - l.ledge.z);
  const ux = (l.target.x - l.ledge.x) / len;
  const uz = (l.target.z - l.ledge.z) / len;
  const step = 1;
  const dt = step / GLIDE_TUNING.forwardSpeed;
  const h0 = heightAt(l.ledge.x, l.ledge.z) + 1.8;
  const inLanding = (x: number, z: number): boolean => l.landingAreas.some((a) => x >= a.x0 && x <= a.x1 && z >= a.z0 && z <= a.z1);
  let deficit = 0;
  for (let s = LIP_RUN; s <= len; s += step) {
    const x = l.ledge.x + ux * s;
    const z = l.ledge.z + uz * s;
    const line = h0 - (s * GLIDE_TUNING.sinkRate) / GLIDE_TUNING.forwardSpeed;
    deficit = Math.max(deficit, heightAt(x, z) + (inLanding(x, z) ? 0 : 10) - line);
  }
  let y = h0;
  for (let s = step; s <= len + 800; s += step) {
    const x = l.ledge.x + ux * s;
    const z = l.ledge.z + uz * s;
    const g = heightAt(x, z);
    let vy = -GLIDE_TUNING.sinkRate;
    for (const u of updrafts) {
      if (Math.hypot(x - u.centre.x, z - u.centre.z) < u.radius && y >= u.centre.y && y <= u.centre.y + u.height) vy += u.lift;
    }
    y += vy * dt;
    if (y <= g) return { landed: inLanding(x, z), at: { x, z }, deficit };
  }
  return { landed: false, at: { x: l.target.x + ux * 800, z: l.target.z + uz * 800 }, deficit };
}
