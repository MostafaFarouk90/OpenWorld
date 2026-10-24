// Leg lengths: what the plan's table (Part 7.1) promises, computed from the layout and the road so the numbers stay true.
// "Ridden" is metres on the pass road or on horseback; "foot" is metres walked. Plain numbers, rounded to metres.
import { sledPath } from './carryRoutes';
import type { DragonspineBuild } from './layout';
import { dist } from './helpers';
import { pathLength } from './paths';

export interface LegLengths {
  ridden: number;
  foot: number;
  note: string;
}

/** The plan's targets, ridden and on foot. */
export const LEG_TARGETS: Readonly<Record<string, { ridden: number; foot: number }>> = {
  M28: { ridden: 1200, foot: 1000 },
  R15: { ridden: 600, foot: 1000 },
  M29: { ridden: 600, foot: 300 },
  R16: { ridden: 700, foot: 500 },
  M30: { ridden: 1100, foot: 400 },
  R17: { ridden: 1800, foot: 200 },
  R18: { ridden: 600, foot: 800 },
};

const m = (n: number): number => Math.round(n);

export function legLengths(b: DragonspineBuild): Record<string, LegLengths> {
  const road = b.sites.road;
  const roadStart = road.point(0);
  const gateToRoad = dist(b.lodge.gateN, roadStart);
  const sled = pathLength(sledPath(b, 1));
  const hawkClimb = b.hawk.climbLength + dist(b.hawk.camp, b.hawk.climbStart);
  const stops = [b.anvil.roadS, ...b.wayside.sites.map((w) => w.s)];
  let ride = 0;
  for (let i = 1; i < stops.length; i++) ride += Math.abs(stops[i]! - stops[i - 1]!);
  const padWalk = b.wayside.sites.reduce((n, w) => n + 2 * Math.hypot(w.x - road.point(w.s).x, w.z - road.point(w.s).z), 0);
  const interior = 30;
  return {
    M28: { ridden: m(gateToRoad + b.m28.trailheadS), foot: m(2 * b.m28.climbLength), note: 'lodge pass gate to the trailhead on the road; the climb there and back' },
    R15: { ridden: m(2 * sled), foot: m(3 * sled), note: 'depot to cache x 3 hauling; cache to depot x 2 riding back' },
    M29: { ridden: 0, foot: m(2 * dist(b.shelter.fire, b.shelter.woodpile)), note: 'ridden n/a: the shelter waystone is the start (lodge to shelter is K1\'s road); fire to woodpile and back' },
    R16: { ridden: m(dist({ x: b.sites.shelter.cx, z: b.sites.shelter.cz }, b.cave.door)), foot: m(2 * (dist(b.cave.ledge, b.cave.door) + interior)), note: 'shelter centre to the cave mouth in a straight line; the Leap and the interior there and back (interior ~30 m each way)' },
    M30: { ridden: m(b.anvil.roadS - b.shelter.roadS), foot: m(b.anvil.loopLength), note: 'shelter to the Anvil along the road; shrine -> six carvings -> shrine' },
    R17: { ridden: m(ride), foot: m(padWalk), note: 'road from the Anvil to wayside 1, then 2..6 in order; the walk from the road to each pad and back' },
    R18: { ridden: m(dist({ x: b.sites.shelter.cx, z: b.sites.shelter.cz }, b.hawk.climbStart)), foot: m(5 * hawkClimb), note: 'shelter centre to the cliff foot in a straight line; camp to nest x 3 and down x 2' },
  };
}
