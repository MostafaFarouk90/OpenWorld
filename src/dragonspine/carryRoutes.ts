// Carry-route data for K7 (CarryRouteDef): R15's three sled hauls, R18's three egg climbs and R17's candle. Checkpoints are the
// route's polyline (K7 confirmed): dense, 10 to 25 m apart (so the 8 m pass radius never skips one), each y read from `heightAt`
// when the routes are built, never a table. `resetAt` lists the indices a reset returns to (default all): eggs [0], candles the
// Anvil and each shrine.
import type { CarryRouteDef } from '../movement/types';
import { buildDragonspine, type DragonspineBuild } from './layout';
import { defaultInputs, type HeightFn, type XZ } from './inputs';
import { pathLength } from './paths';

export type DragonspineCarryRoute = CarryRouteDef & { resetAt?: readonly number[] };

export const CORRIDOR_HALF_WIDTH = 30;
export const MAX_DROP = 10;
/** Consecutive checkpoints are at least this far apart (and at most `CHECKPOINT_MAX`). */
export const CHECKPOINT_MIN = 10;
export const CHECKPOINT_MAX = 25;
/** The spacing aimed for: with the 0.25 m sampling the merged last gap stays within 25 m. */
const TARGET = 14.5;
/** The egg climb's hairpins put the path's legs about 20 m apart, so its checkpoints are spaced wider to keep legs more than two pass radii (16 m) apart. */
const EGG_TARGET = 22;

/** Points along `pts` at least TARGET m apart (straight line), ending exactly on the last point with a final gap of 10 m or more. */
export function densify(pts: readonly XZ[], target = TARGET): XZ[] {
  const out: XZ[] = [{ x: pts[0]!.x, z: pts[0]!.z }];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(1, Math.ceil(len / 0.25));
    for (let k = 1; k <= n; k++) {
      const p = { x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n };
      const last = out[out.length - 1]!;
      if (Math.hypot(p.x - last.x, p.z - last.z) >= target) out.push(p);
    }
  }
  const end = pts[pts.length - 1]!;
  const last = out[out.length - 1]!;
  const gap = Math.hypot(end.x - last.x, end.z - last.z);
  if (gap > 1e-6) {
    if (gap < CHECKPOINT_MIN && out.length > 1) out.pop();
    out.push({ x: end.x, z: end.z });
  } else if (out.length > 1) {
    out[out.length - 1] = { x: end.x, z: end.z };
  }
  return out;
}

const withY = (h: HeightFn, pts: readonly XZ[]) => pts.map((p) => ({ x: p.x, y: h(p.x, p.z), z: p.z }));
const route = (h: HeightFn, id: string, pts: readonly XZ[], resetAt?: readonly number[], target = TARGET): DragonspineCarryRoute => ({
  id,
  checkpoints: withY(h, densify(pts, target)),
  corridorHalfWidth: CORRIDOR_HALF_WIDTH,
  maxDrop: MAX_DROP,
  ...(resetAt ? { resetAt } : {}),
});

/** The path a sled takes from start `i` (0..2): out of the shed, through the pass gate and up the road to the hawk-line cache. */
export function sledPath(b: DragonspineBuild, i: number): XZ[] {
  const { lodge, sites } = b;
  const start = lodge.sledStarts[i]!;
  const up: XZ[] = [];
  for (let s = lodge.passGateS + 6; s < lodge.cacheS; s += 10) {
    const p = sites.road.point(s);
    up.push({ x: p.x, z: p.z });
  }
  return [start, { x: lodge.gateN.x, z: lodge.gateN.z - 8 }, { x: lodge.gateN.x, z: lodge.gateN.z + 6 }, ...up, lodge.cache];
}

/** The path an egg takes: its pick-up at the camp, the cliff foot's climb start, the climb, the nest. */
export function eggPath(b: DragonspineBuild, i: number): XZ[] {
  return [b.hawk.eggs[i]!, ...b.hawk.climb, b.hawk.nests[0]!];
}

/**
 * The candle is two routes, so neither runs back over itself (K7's progress rule is the furthest checkpoint within 8 m):
 * `candle.r17.down` goes Anvil, shrines 3, 2, 1 down the road; `candle.r17.up` starts at shrine 1 and climbs past the Anvil
 * to 4, 5, 6. K13 tracks down, then up.
 */
export const CANDLE_DOWN = [3, 2, 1] as const;
export const CANDLE_UP = [1, 4, 5, 6] as const;
export type CandleLeg = 'down' | 'up';
export const CANDLE_ROUTE_IDS = ['candle.r17.down', 'candle.r17.up'] as const;

type Stop = { at: XZ; s: number };
/** The stops of one leg in order, the first being the start (the Anvil for down, shrine 1 for up). */
export function candleStops(b: DragonspineBuild, leg: CandleLeg): Stop[] {
  const { anvil, wayside } = b;
  const shrine = (n: number): Stop => {
    const w = wayside.sites[n - 1]!;
    return { at: { x: w.x, z: w.z }, s: w.s };
  };
  return leg === 'down' ? [{ at: anvil.shrine, s: anvil.roadS }, ...CANDLE_DOWN.map(shrine)] : CANDLE_UP.map(shrine);
}

/** The road between consecutive stops of a leg (one piece per stop after the first). */
export function candlePieces(b: DragonspineBuild, leg: CandleLeg): XZ[][] {
  const stops = candleStops(b, leg);
  const road = b.sites.road;
  return stops.slice(1).map((to, k) => {
    const from = stops[k]!;
    const dir = to.s >= from.s ? 1 : -1;
    const pts: XZ[] = [from.at];
    for (let s = from.s; dir > 0 ? s < to.s : s > to.s; s += dir * 10) {
      const p = road.point(s);
      pts.push({ x: p.x, z: p.z });
    }
    pts.push(to.at);
    return pts;
  });
}

function candleRoute(h: HeightFn, b: DragonspineBuild, leg: CandleLeg): DragonspineCarryRoute {
  // Densify each piece on its own so every stop is a checkpoint; resetAt is the start and each stop.
  const start = candleStops(b, leg)[0]!.at;
  const resetAt: number[] = [0];
  const pts: XZ[] = [start];
  for (const piece of candlePieces(b, leg)) {
    pts.push(...densify(piece).slice(1));
    resetAt.push(pts.length - 1);
  }
  return { id: `candle.r17.${leg}`, checkpoints: withY(h, pts), corridorHalfWidth: CORRIDOR_HALF_WIDTH, maxDrop: MAX_DROP, resetAt };
}

/** The routes for a build; every y comes from `heightAt`. */
export function buildCarryRoutes(heightAt: HeightFn, build: DragonspineBuild = buildDragonspine(defaultInputs(heightAt))): DragonspineCarryRoute[] {
  const routes: DragonspineCarryRoute[] = [];
  for (let i = 0; i < 3; i++) routes.push(route(heightAt, `sled.r15.${i + 1}`, sledPath(build, i)));
  for (let i = 0; i < 3; i++) routes.push(route(heightAt, `egg.r18.${i + 1}`, eggPath(build, i), [0], EGG_TARGET));
  routes.push(candleRoute(heightAt, build, 'down'), candleRoute(heightAt, build, 'up'));
  return routes;
}

export { pathLength };
