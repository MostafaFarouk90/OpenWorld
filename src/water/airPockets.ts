// The 40 m air-pocket lint (contracts v0.7 item 4, review finding 3): along a dive route, the entry to the first pocket,
// each pocket to the next and the last pocket to the exit are at most AIR_POCKET_MAX_SPACING apart, measured along the
// route. Every dive route K7 and the quest threads register is checked by `airPockets.test.ts`.
import type { Vec3Like } from '../core/events';
import { AIR_POCKET_MAX_SPACING, type DiveRouteDef } from './types';

/** Distance along the polyline from its start to the projection of `p` onto it. */
export function distanceAlong(points: readonly Vec3Like[], p: Vec3Like): number {
  let walked = 0;
  let best = Infinity;
  let at = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const d = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
    const len = Math.hypot(d.x, d.y, d.z);
    const t = len > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * d.x + (p.y - a.y) * d.y + (p.z - a.z) * d.z) / (len * len))) : 0;
    const q = { x: a.x + d.x * t, y: a.y + d.y * t, z: a.z + d.z * t };
    const off = Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
    if (off < best) {
      best = off;
      at = walked + len * t;
    }
    walked += len;
  }
  return at;
}

export function routeLength(points: readonly Vec3Like[]): number {
  let n = 0;
  for (let i = 1; i < points.length; i++) n += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y, points[i].z - points[i - 1].z);
  return n;
}

/** The route's problems, empty when it passes: gaps over the limit, pockets out of route order, a route under two points. */
export function lintDiveRoute(route: DiveRouteDef, max: number = AIR_POCKET_MAX_SPACING): string[] {
  const out: string[] = [];
  if (route.points.length < 2) return [`${route.id}: a dive route needs at least two points`];
  const stops = [0, ...route.airPockets.map((p) => distanceAlong(route.points, p.at)), routeLength(route.points)];
  const names = ['entry', ...route.airPockets.map((p) => p.id), 'exit'];
  for (let i = 1; i < stops.length; i++) {
    const gap = stops[i] - stops[i - 1];
    if (gap < -1e-6) out.push(`${route.id}: ${names[i]} comes before ${names[i - 1]} along the route`);
    else if (gap > max + 1e-6) out.push(`${route.id}: ${names[i - 1]} to ${names[i]} is ${gap.toFixed(1)} m (max ${max})`);
  }
  return out;
}
