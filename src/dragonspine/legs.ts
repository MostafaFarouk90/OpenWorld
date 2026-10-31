// Leg lengths: what the plan's table (Part 7.1) promises, computed from the layout and the road so the numbers stay true.
// "Ridden" is metres on the pass road or on horseback; "foot" is metres walked. Plain numbers, rounded to metres.
import { candleStops, sledPath } from './carryRoutes';
import { buildCaveDef } from './collapsedCave';
import type { DragonspineBuild } from './layout';
import { dist } from './helpers';
import type { HeightFn, XZ } from './inputs';
import { pathLength } from './paths';
import { roadFromPoints, type Road } from './road';
import { routeOver } from './route';

export interface LegLengths {
  ridden: number;
  foot: number;
  /** Metres glided (D06 only). */
  glide?: number;
  note: string;
}

/** The plan's targets, ridden and on foot. */
export const LEG_TARGETS: Readonly<Record<string, { ridden: number; foot: number; glide?: number }>> = {
  M28: { ridden: 1200, foot: 1000 },
  R15: { ridden: 600, foot: 1000 },
  M29: { ridden: 600, foot: 300 },
  R16: { ridden: 700, foot: 500 },
  M30: { ridden: 1100, foot: 400 },
  R17: { ridden: 1800, foot: 200 },
  R18: { ridden: 600, foot: 800 },
  // The summit (PR 2).
  M31: { ridden: 1000, foot: 800 },
  M32: { ridden: 0, foot: 300 },
  M33: { ridden: 800, foot: 700 },
  M34: { ridden: 0, foot: 600 },
  D06: { ridden: 0, foot: 600, glide: 700 },
};

const m = (n: number): number => Math.round(n);

const routeLength = (p: readonly XZ[]): number => p.reduce((n, q, i) => (i ? n + dist(q, p[i - 1]!) : 0), 0);

/**
 * The ridden distance to `to` as a rider covers it: along `road` from position `fromS` to a road point, then the walkable route over
 * the ground (never a straight line through a cliff). The leaving point is the best of those within 300 m of the road point nearest `to`.
 * Throws when no leaving point has a route.
 */
export function rideRoute(h: HeightFn, road: Road, fromS: number, to: XZ): number {
  const near = road.nearest(to.x, to.z).s;
  let best = Infinity;
  for (let s = Math.max(0, near - 300); s <= Math.min(road.length, near + 300); s += 60) {
    const p = road.point(s);
    const r = routeOver(h, { x: p.x, z: p.z }, to);
    if (r) best = Math.min(best, Math.abs(s - fromS) + routeLength(r));
  }
  if (!Number.isFinite(best)) throw new Error(`no rideable route to ${to.x.toFixed(0)},${to.z.toFixed(0)}`);
  return best;
}

export function legLengths(b: DragonspineBuild): Record<string, LegLengths> {
  const road = b.sites.road;
  const sled = pathLength(sledPath(b, 1));
  const hawkClimb = b.hawk.climbLength + dist(b.hawk.camp, b.hawk.climbStart);
  let ride = 0;
  for (const leg of ['down', 'up'] as const) {
    const stops = candleStops(b, leg).map((c) => c.s);
    for (let i = 1; i < stops.length; i++) ride += Math.abs(stops[i]! - stops[i - 1]!);
  }
  const padWalk = b.wayside.sites.reduce((n, w) => n + 2 * Math.hypot(w.x - road.point(w.s).x, w.z - road.point(w.s).z), 0);
  // The cave interior, entry to the axe, along its passage and chamber (a straight run).
  const cave = buildCaveDef(b.sites.cavePad);
  const at = (id: string) => cave.anchors.find((x) => x.id === id)!;
  const spine = roadFromPoints(b.sites.inp.spinePoints);
  const interior = Math.abs(at('dragonspine.cave.axe').z - at('dragonspine.cave.exit').z);
  return {
    M28: { ridden: m(b.m28.trailheadS - b.lodge.passGateS), foot: m(2 * b.m28.climbLength), note: 'lodge pass gate to the trailhead on the road; the climb there and back' },
    R15: { ridden: m(2 * sled), foot: m(3 * sled), note: 'depot to cache x 3 hauling; cache to depot x 2 riding back' },
    M29: { ridden: 0, foot: m(2 * dist(b.shelter.fire, b.shelter.woodpile)), note: 'ridden n/a: the shelter waystone is the start (lodge to shelter is K1\'s road); fire to woodpile and back' },
    R16: { ridden: m(rideRoute(b.sites.h, road, b.shelter.roadS, b.cave.trailhead)), foot: m(2 * b.cave.approachLength + 2 * interior), note: 'Rime Pass from the shelter to the road point nearest the trailhead, then the walkable route off the road to it; the approach to the mouth (over the Leap) x 2 and the interior entry to the axe x 2' },
    M30: { ridden: m(b.anvil.roadS - b.shelter.roadS), foot: m(b.anvil.loopLength), note: 'shelter to the Anvil along the road; shrine -> six carvings -> shrine' },
    R17: { ridden: m(ride), foot: m(padWalk), note: 'road from the Anvil down to shrines 3, 2, 1, then up past the Anvil to 4, 5, 6; the walk from the road to each pad and back' },
    R18: { ridden: m(rideRoute(b.sites.h, spine, spine.length, b.hawk.climbStart)), foot: m(5 * hawkClimb), note: 'the plan\'s lodge-to-foot ride: the Spine Road from the lodge to the point nearest the cliff foot, then the walkable route to the climb start; camp to nest x 3 and down x 2' },
    ...summitLegs(b),
  };
}

/** The summit's rows (PR 2), from the summit layout on the same ground. */
export function summitLegs(b: DragonspineBuild): Record<string, LegLengths> {
  const road = b.sites.road;
  const gateS = road.nearest(b.gate.arch.x, b.gate.arch.z).s;
  const H = b.hearth;
  const m32 = routeLength([H.entry, H.keeperStone, H.hoard, ...H.hoardSearches, H.shrine]);
  const lt = b.summit.ledges['summit-skyhold'];
  const m34 = routeLength([H.shrine, ...H.carvings, H.glideMarkers[0]!, { x: lt.ledge.x, z: lt.ledge.z }]);
  const glide = dist(b.glide.launch['summit-aerie'], b.glide.landing['summit-aerie']);
  return {
    M31: {
      ridden: m(road.length - gateS + dist(H.entry, b.roost.trailhead)),
      foot: m(b.roost.climbLength),
      note: 'the Rime Pass from the summit gate to its end at the Wyrm\'s Hearth, then across the bowl to the north-rim trailhead (Eadgyth waits at the Hearth); the routed walk down from the rim to the roost',
    },
    M32: { ridden: 0, foot: m(m32), note: 'ridden n/a; in the Hearth: the entry to the keeper-stone, the hoard and its three searches, then the shrine' },
    M33: { ridden: m(b.summit.spur.length), foot: m(b.skyhold.ledgeLength), note: 'K1\'s Skyhold spur from the summit gate to the cliff top; the routed cliff-ledge path from the camp along the six net anchors and back' },
    M34: { ridden: 0, foot: m(m34), note: 'ridden n/a; the shrine, the four hearth carvings, the glide marker, then the summit-skyhold launch (the first glide)' },
    D06: { ridden: 0, foot: m(pathLength(b.aerie.route)), glide: m(glide), note: 'the summit-aerie lip to the Aerie landing marker gliding; on foot the landing (the waystone attunes on arrival), the winch, the gate, the courtyard\'s searches, the arena and the keep door' },
  };
}
