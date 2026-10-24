import { describe, expect, it } from 'vitest';
import { distanceAlong, lintDiveRoute, routeLength } from './airPockets';
import { DIVE_ROUTES } from './routes';
import type { DiveRouteDef } from './types';

const P = (x: number, y = 0, z = 0) => ({ x, y, z });
const route = (pockets: number[], length = 100): DiveRouteDef => ({
  id: 'dive.test',
  volumeId: 'water.test',
  points: [P(0), P(length / 2, -5), P(length)],
  airPockets: pockets.map((x, i) => ({ id: `pocket.${i}`, at: P(x, x <= length / 2 ? (-5 * x) / (length / 2) : -5 + (5 * (x - length / 2)) / (length / 2)) })),
});

describe('the 40 m air-pocket lint', () => {
  it('every registered dive route passes', () => {
    for (const r of DIVE_ROUTES) expect(lintDiveRoute(r), r.id).toEqual([]);
  });
  it('passes pockets 40 m apart or closer, entry and exit included', () => {
    expect(lintDiveRoute(route([35, 70], 100))).toEqual([]);
    expect(lintDiveRoute(route([], 38))).toEqual([]); // 38 m across with the 5 m dip is 39.3 m along the route
  });
  it('fails a gap over 40 m anywhere: entry to first, between pockets, last to exit', () => {
    expect(lintDiveRoute(route([45, 80], 100))[0]).toMatch(/entry to pocket.0/);
    expect(lintDiveRoute(route([20, 70], 100))[0]).toMatch(/pocket.0 to pocket.1/);
    expect(lintDiveRoute(route([30, 55], 100))[0]).toMatch(/pocket.1 to exit/);
  });
  it('fails pockets listed out of route order, and a route under two points', () => {
    expect(lintDiveRoute(route([70, 35], 100)).join()).toMatch(/comes before/);
    expect(lintDiveRoute({ id: 'r', volumeId: 'v', points: [P(0)], airPockets: [] })).toEqual(['r: a dive route needs at least two points']);
  });
  it('measures along the route, not straight across', () => {
    const bend: DiveRouteDef = { id: 'b', volumeId: 'v', points: [P(0), P(0, 0, 30), P(10, 0, 30), P(10, 0, 0)], airPockets: [] };
    expect(routeLength(bend.points)).toBe(70);
    expect(distanceAlong(bend.points, P(10, 0, 0))).toBe(70);
    expect(lintDiveRoute(bend)[0]).toMatch(/entry to exit is 70.0 m/);
  });
});
