// Ysmeryth's roost and M31's climb (PR 2). The roost is K1's `dragon-roost` pad (70 x 70 m, flat, in the hollow under the
// crown's crest about 60 m below the Wyrm's Hearth's north rim), so the walk from the rim runs down to it and the three Leap
// ledges face the player on the way back up. The route is routed over the ground (walkable everywhere) and wound to about 800 m;
// the ledges are fitted on it at their built size. The trial arena's centre `dragonspine.roost.arena.centre` is the pad's centre
// (K0 trial v2 `arenaCentre`, the 80 m rule). Searches: the claw-scored ledge and a dead hunter's horn on the way, a shed scale
// at the roost. Four hawk spawn anchors on the route.
import type { StructureSpec } from '../region/layoutTypes';
import { a, emptyPart, headingTo, ledge, LEDGE_HEIGHT, open, solid, sphere, type Part } from './helpers';
import { fitLedge } from './fit';
import type { HeightFn, XZ } from './inputs';
import { pathLength, pathPoint, windingPath } from './paths';
import { routeOver } from './route';
import { freeStand, type SummitSites } from './summitSites';

/** M31's foot leg: about this many metres from the rim to the roost (the plan's 800 m). */
export const ROOST_CLIMB = 800;
/** The route is accepted within this share of ROOST_CLIMB. */
const CLIMB_TOLERANCE = 0.08;
/** The trailhead stands this far inside the Hearth's north edge. */
const RIM_INSET = 4;
const LEDGE_AT = [0.3, 0.55, 0.8];
const HAWK_AT = [0.25, 0.45, 0.62, 0.85];

export interface RoostInfo {
  trailhead: XZ;
  centre: XZ;
  climb: XZ[];
  climbLength: number;
  leaps: StructureSpec[];
  launches: XZ[];
  specs: StructureSpec[];
}

const fail = (msg: string): never => {
  throw new Error(`dragonspine: ${msg}`);
};

/** A route over the ground through `bends` side steps, each leg routed, joined. Null when a leg has no walkable route. */
function routedThrough(h: HeightFn, pts: readonly XZ[]): XZ[] | null {
  const out: XZ[] = [pts[0]!];
  for (let i = 1; i < pts.length; i++) {
    const leg = routeOver(h, pts[i - 1]!, pts[i]!, { margin: 120 });
    if (!leg) return null;
    out.push(...leg.slice(1));
  }
  return out;
}

/**
 * A walkable route from `from` to `to` of about `target` metres: the straight-line winding path (two bends) is solved for a
 * nominal length and its legs are routed; the nominal length is corrected from the routed one a few times (secant steps).
 */
export function windToLength(h: HeightFn, from: XZ, to: XZ, target: number): XZ[] {
  const direct = routeOver(h, from, to, { margin: 120 }) ?? fail('no walkable route from the Hearth rim to the roost');
  if (pathLength(direct) >= target * (1 - CLIMB_TOLERANCE)) return direct;
  let nominal = target - (pathLength(direct) - Math.hypot(to.x - from.x, to.z - from.z));
  let best = direct;
  for (let k = 0; k < 6; k++) {
    const r = routedThrough(h, windingPath(from, to, nominal, 2));
    if (r) {
      const len = pathLength(r);
      if (Math.abs(len - target) < Math.abs(pathLength(best) - target)) best = r;
      if (Math.abs(len - target) <= target * CLIMB_TOLERANCE) return r;
      nominal += target - len;
    } else nominal *= 0.9;
  }
  return best;
}

export function roostLayout(s: SummitSites): { part: Part; info: RoostInfo } {
  const R = s.roost;
  const H = s.hearth;
  const centre = { x: R.cx, z: R.cz };
  const trailhead = { x: Math.min(Math.max(R.cx, H.minX + 10), H.maxX - 10), z: H.maxZ - RIM_INSET };
  const climb = windToLength(s.h, trailhead, centre, ROOST_CLIMB);
  const climbLength = pathLength(climb);
  const along = (f: number, side: number): XZ => {
    const p = pathPoint(climb, climbLength * f);
    return { x: p.x - p.dirZ * side, z: p.z + p.dirX * side };
  };

  // The Leap ledges, fitted at their built size where the route has ground for them, nearest the wanted share.
  const taken: XZ[] = [];
  const leaps = LEDGE_AT.map((f, i) => {
    for (let k = 0; k <= 16; k++) {
      for (const sign of k === 0 ? [1] : [1, -1]) {
        const at = f + sign * k * 0.02;
        if (at < 0.08 || at > 0.92) continue;
        const fitted = fitLedge(s.h, along(at, 5));
        if (!fitted || taken.some((t) => Math.hypot(t.x - fitted.x, t.z - fitted.z) < 25)) continue;
        if (Math.hypot(fitted.x - centre.x, fitted.z - centre.z) < Math.min(R.w, R.d) / 2 + 6) continue;
        taken.push(fitted);
        return { spec: ledge(`dragonspine-roost-ledge-${i + 1}`, fitted.x, fitted.z), launch: fitted.launch };
      }
    }
    return fail(`no climbable ground for the roost's Leap ledge ${i + 1}`);
  });
  const leapSpecs = leaps.map((l) => l.spec);
  const avoid = [...leapSpecs];
  const stand = (want: XZ, what: string): XZ => freeStand(s.h, want, { radius: 30, maxGrad: 0.5, avoid, clear: 2 }) ?? fail(`no standable ground for ${what}`);
  const clawAt = stand(along(0.4, -6), 'the claw-scored ledge');
  const claw = solid('dragonspine-roost-claw-ledge', 'rock', clawAt.x, clawAt.z, 4, 3, 1.2);
  avoid.push(claw);
  const hornAt = stand(along(0.68, -5), 'the dead hunter\'s horn');
  const horn = open('dragonspine-roost-horn', 'dragonspine-horn', hornAt.x, hornAt.z, 1.2, 0.6);
  const scaleAt = { x: R.cx + R.w * 0.25, z: R.cz + R.d * 0.25 };
  const scale = open('dragonspine-roost-scale', 'dragonspine-scale', scaleAt.x, scaleAt.z, 1.6, 1.2);
  const clawFace = stand({ x: clawAt.x + 3.5, z: clawAt.z }, 'the claw-scored ledge\'s search');
  const hawks = HAWK_AT.map((f, i) => stand(along(f, 9), `roost hawk ${i + 1}`));

  const part: Part = {
    ...emptyPart(),
    anchors: [
      a('dragonspine.roost.trailhead', trailhead.x, trailhead.z, headingTo(trailhead.x, trailhead.z, centre.x, centre.z), ['objective']),
      ...leaps.map((l, i) => a(`dragonspine.roost.leap.${i + 1}`, l.spec.x, l.spec.z, 0, ['poi', 'leap-gated'], { onStructure: l.spec.id, dy: LEDGE_HEIGHT })),
      ...leaps.map((l, i) => a(`dragonspine.roost.leap.${i + 1}.launch`, l.launch.x, l.launch.z, headingTo(l.launch.x, l.launch.z, l.spec.x, l.spec.z), ['poi'])),
      a('dragonspine.roost.claw-ledge', clawFace.x, clawFace.z, headingTo(clawFace.x, clawFace.z, clawAt.x, clawAt.z), ['objective']),
      a('dragonspine.roost.horn', hornAt.x, hornAt.z - 1.5, 0, ['objective']),
      a('dragonspine.roost.scale', scaleAt.x, scaleAt.z - 1.8, 0, ['objective']),
      a('dragonspine.roost.entry', centre.x, R.minZ + 6, 0, ['poi']),
      a('dragonspine.roost.arena.centre', centre.x, centre.z, 0, ['objective', 'arena-centre']),
      a('dragonspine.roost.ysmeryth.land', centre.x, centre.z + R.d * 0.3, 180, ['poi']),
      ...hawks.map((p, i) => a(`dragonspine.spawn.roost.hawk-${i + 1}`, p.x, p.z, 0, ['spawn'])),
    ],
    triggers: [sphere('trg.dragonspine.roost', centre.x, centre.z, Math.min(R.w, R.d) / 2), sphere('trg.dragonspine.roost.trailhead', trailhead.x, trailhead.z, 12)],
    structures: [...leapSpecs, claw, horn, scale],
  };
  return { part, info: { trailhead, centre, climb, climbLength, leaps: leapSpecs, launches: leaps.map((l) => l.launch), specs: part.structures } };
}
