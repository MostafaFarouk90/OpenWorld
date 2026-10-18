import type { RouteNode } from '../route';

/**
 * Thread 17's `CHASE_M10` (harrowmark.layout.ts on its branch, draft PR #51) relative to node 0, with roof heights as
 * y (Rooftop Ward blocks 6 + 0.5 (i + j), 3 m alleys). Replaced by the real anchors once that PR is on main.
 */
const NODES: [number, number, RouteNode['kind'], number?][] = [
  [8900, 1620, 'run'],
  [8900, 1760, 'run'],
  [8900, 1900, 'run'],
  [8900, 2040, 'vault'],
  [8900, 2200, 'run'],
  [8850, 2262, 'run', 6.5],
  [8850, 2338, 'gap', 6.5],
  [8850, 2400, 'run', 7],
  [8812, 2390, 'gap', 7],
  [8750, 2390, 'run', 6.5],
  [8756, 2430, 'gap', 6.5],
  [8756, 2490, 'run', 7],
  [8716, 2490, 'drop', 7],
  [8690, 2494, 'run'],
  [8600, 2494, 'run'],
  [8510, 2494, 'run'],
];

export function m10FixtureRoute(): RouteNode[] {
  return NODES.map(([x, z, kind, roof], i) => ({ id: `chase.m10.${i}`, position: { x: x - 8900, y: roof ?? 0, z: z - 1620 }, kind }));
}

/** A short synthetic route with one 6 m roof gap and a plank detour, for the Leap margin check. */
export function plankRoute(): RouteNode[] {
  const n = (i: number, x: number, kind: RouteNode['kind'] = 'run', detour?: RouteNode['detour']): RouteNode => ({
    id: `chase.p.${i}`,
    position: { x, y: 6, z: 0 },
    kind,
    ...(detour ? { detour } : {}),
  });
  return [n(0, 0), n(1, 60, 'gap', { x: 63, y: 6, z: 25 }), n(2, 66), n(3, 140), n(4, 146, 'gap', { x: 149, y: 6, z: 25 }), n(5, 152), n(6, 230)];
}
