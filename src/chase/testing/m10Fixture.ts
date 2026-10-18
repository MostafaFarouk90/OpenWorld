import type { RouteNode } from '../route';

/**
 * A stand-in for thread 17's `chase.m10.0..15` until its layout is on main (plans/slice-2-harrowmark-city.md 5.x):
 * street start, a vault, a ramp up to the roofs (nodes 5 to 12 at 6 m), two 3 m gaps for a plain jump, one 6 m gap
 * with a plank detour, a drop back to the street, and a dead end. About 400 m on the player's line.
 */
export function m10FixtureRoute(): RouteNode[] {
  const n = (i: number, x: number, y: number, z: number, kind: RouteNode['kind'] = 'run', detour?: RouteNode['detour']): RouteNode => ({
    id: `chase.m10.${i}`,
    position: { x, y, z },
    kind,
    ...(detour ? { detour } : {}),
  });
  return [
    n(0, 0, 0, 0),
    n(1, 30, 0, 4),
    n(2, 58, 0, -6, 'vault'),
    n(3, 85, 0, -2),
    n(4, 110, 0, 10),
    n(5, 135, 6, 14),
    n(6, 162, 6, 8, 'gap'),
    n(7, 165, 6, 8),
    n(8, 192, 6, 18),
    n(9, 218, 6, 12, 'gap', { x: 221, y: 6, z: 24 }),
    n(10, 224, 6, 12),
    n(11, 250, 6, 0, 'gap'),
    n(12, 253, 6, 0, 'drop'),
    n(13, 268, 0, -4),
    n(14, 300, 0, -12, 'vault'),
    n(15, 330, 0, -6),
  ];
}
