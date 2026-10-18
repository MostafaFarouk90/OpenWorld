import { describe, expect, it } from 'vitest';
import { NavGrid } from './NavGrid';
import { NavRegistry } from './NavRegistry';
import { findPath } from './pathfind';

const P = (x: number, z: number, y = 0) => ({ x, y, z });

/** 20 x 20 m yard with a 2 x 2 m pillar at (9..11, 9..11). */
function yard() {
  return new NavGrid({
    id: 'yard',
    minX: 0,
    minZ: 0,
    maxX: 20,
    maxZ: 20,
    floorY: 0,
    walkable: [{ x0: 0, z0: 0, x1: 20, z1: 20 }],
    blocked: [{ x0: 9, z0: 9, x1: 11, z1: 11 }],
  });
}

/** Wall at x 9..10 with a 1.5 m gap at z 9..10.5 and a closable door across the gap. */
function walled() {
  return new NavGrid({
    id: 'walled',
    minX: 0,
    minZ: 0,
    maxX: 20,
    maxZ: 20,
    floorY: 0,
    walkable: [{ x0: 0, z0: 0, x1: 20, z1: 20 }],
    blocked: [
      { x0: 9, z0: 0, x1: 10, z1: 9 },
      { x0: 9, z0: 10.5, x1: 10, z1: 20 },
    ],
    blockers: { door: [{ x0: 9, z0: 9, x1: 10, z1: 10.5 }] },
  });
}

/** Samples each segment every 0.1 m and asserts every sampled cell is walkable with clearance >= radius. */
function assertClear(g: NavGrid, from: { x: number; z: number }, path: { x: number; z: number }[], radius: number) {
  let a = from;
  for (const b of path) {
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(1, Math.ceil(len / 0.1));
    for (let k = 0; k <= n; k++) {
      const x = a.x + ((b.x - a.x) * k) / n;
      const z = a.z + ((b.z - a.z) * k) / n;
      const i = g.cellIndex(x, z);
      expect(i, `sample ${x},${z}`).toBeGreaterThanOrEqual(0);
      expect(g.isWalkable(i), `walkable ${x},${z}`).toBe(true);
      expect(g.clearance(i), `clearance ${x},${z}`).toBeGreaterThanOrEqual(radius - 1e-6);
    }
    a = b;
  }
}

describe('findPath', () => {
  it('returns one waypoint equal to the target on a clear line', () => {
    const g = yard();
    const p = findPath(g, P(2, 2), P(6, 3), 0.4);
    expect(p).toEqual([{ x: 6, y: 0, z: 3 }]);
  });

  it('goes around a pillar without entering a blocked cell', () => {
    const g = yard();
    const from = P(3, 10);
    const p = findPath(g, from, P(17, 10), 0.4);
    expect(p.length).toBeGreaterThan(1);
    expect(p[p.length - 1]).toEqual({ x: 17, y: 0, z: 10 });
    assertClear(g, from, p, 0.4);
  });

  it('never cuts a diagonal corner', () => {
    const g = new NavGrid({
      id: 'corner',
      minX: 0,
      minZ: 0,
      maxX: 4,
      maxZ: 4,
      floorY: 0,
      walkable: [{ x0: 0, z0: 0, x1: 4, z1: 4 }],
      blocked: [{ x0: 2, z0: 2, x1: 4, z1: 4 }],
    });
    const from = P(1.75, 1.75);
    const p = findPath(g, from, P(2.25, 1.75), 0);
    assertClear(g, from, p, 0);
    // A diagonal squeeze between two touching blocked cells is refused.
    const h = new NavGrid({
      id: 'diag',
      minX: 0,
      minZ: 0,
      maxX: 2,
      maxZ: 2,
      floorY: 0,
      walkable: [{ x0: 0, z0: 0, x1: 2, z1: 2 }],
      blocked: [
        { x0: 0.5, z0: 1, x1: 1, z1: 1.5 },
        { x0: 1, z0: 0.5, x1: 1.5, z1: 1 },
      ],
    });
    const q = findPath(h, P(0.75, 0.75), P(1.25, 1.25), 0);
    assertClear(h, P(0.75, 0.75), q, 0);
    expect(q.length).toBeGreaterThan(1);
  });

  it('passes a 1.5 m gap at radius 0.4 and refuses it at radius 0.8', () => {
    const g = walled();
    const from = P(5, 9.75);
    const to = P(15, 9.75);
    const narrow = findPath(g, from, to, 0.4);
    expect(narrow[narrow.length - 1]).toEqual({ x: 15, y: 0, z: 9.75 });
    assertClear(g, from, narrow, 0.4);
    const wide = findPath(g, from, to, 0.8);
    const last = wide[wide.length - 1]!;
    expect(last.x).toBeLessThan(9); // stopped on the near side, nearest reachable cell
    assertClear(g, from, wide, 0.8);
  });

  it('ends at the nearest reachable cell for a target inside a pillar', () => {
    const g = yard();
    const p = findPath(g, P(2, 10), P(10, 10), 0.4);
    const last = p[p.length - 1]!;
    expect(g.isWalkable(g.cellIndex(last.x, last.z))).toBe(true);
    expect(Math.hypot(last.x - 10, last.z - 10)).toBeLessThan(2);
    assertClear(g, P(2, 10), p, 0.4);
  });

  it('clamps a target outside the grid', () => {
    const g = yard();
    const p = findPath(g, P(5, 5), P(50, 5), 0.4);
    const last = p[p.length - 1]!;
    expect(last.x).toBeGreaterThan(19);
    expect(last.x).toBeLessThan(20);
  });

  it('ends on the near side of a closed blocker, and goes through once it opens', () => {
    const g = walled();
    g.setBlocker('door', true);
    const from = P(5, 9.75);
    const closed = findPath(g, from, P(15, 9.75), 0.4);
    expect(closed.length).toBeGreaterThan(0);
    expect(closed[closed.length - 1]!.x).toBeLessThan(9);
    g.setBlocker('door', false);
    const open = findPath(g, from, P(15, 9.75), 0.4);
    expect(open[open.length - 1]).toEqual({ x: 15, y: 0, z: 9.75 });
  });

  it('snaps a start inside a wall to open floor', () => {
    const g = yard();
    const p = findPath(g, P(10, 10), P(3, 3), 0.4);
    expect(p.length).toBeGreaterThan(0);
    expect(p[p.length - 1]).toEqual({ x: 3, y: 0, z: 3 });
  });

  it('returns [] when no cell is valid', () => {
    const g = new NavGrid({ id: 'empty', minX: 0, minZ: 0, maxX: 4, maxZ: 4, floorY: 0, walkable: [] });
    expect(findPath(g, P(1, 1), P(2, 2), 0.4)).toEqual([]);
    const thin = new NavGrid({ id: 'thin', minX: 0, minZ: 0, maxX: 4, maxZ: 4, floorY: 0, walkable: [{ x0: 0, z0: 0, x1: 4, z1: 1 }] });
    expect(findPath(thin, P(1, 0.5), P(2, 0.5), 2)).toEqual([]);
  });

  it('returns [to] when from and to share a cell, and treats negative radius as 0', () => {
    const g = yard();
    expect(findPath(g, P(2.1, 2.1), P(2.3, 2.2), 0.4)).toEqual([{ x: 2.3, y: 0, z: 2.2 }]);
    expect(findPath(g, P(2, 2), P(6, 3), -5)).toEqual([{ x: 6, y: 0, z: 3 }]);
  });

  it('is deterministic', () => {
    const g = yard();
    const a = findPath(g, P(3, 3), P(17, 16), 0.4);
    const b = findPath(g, P(3, 3), P(17, 16), 0.4);
    expect(a).toEqual(b);
  });
});

describe('NavRegistry', () => {
  it('routes by the start point and reports floors', () => {
    const reg = new NavRegistry();
    const undo = reg.add(yard());
    expect(() => reg.add(yard())).toThrow(/duplicate/);
    expect(reg.hasGrid(P(5, 5))).toBe(true);
    expect(reg.floorAt(P(5, 5))).toBe(0);
    expect(reg.floorAt(P(5, 5, -150))).toBeNull();
    expect(reg.path(P(5, 5), P(8, 5))).toEqual([{ x: 8, y: 0, z: 5 }]);
    undo();
    expect(reg.hasGrid(P(5, 5))).toBe(false);
    reg.add(yard()); // the id is free again
  });

  it('returns null outside every grid and for non-finite input', () => {
    const reg = new NavRegistry();
    reg.add(yard());
    expect(reg.path(P(50, 50), P(5, 5))).toBeNull();
    expect(reg.path(P(5, 5, -150), P(5, 5))).toBeNull();
    expect(reg.path(P(NaN, 5), P(5, 5))).toBeNull();
    expect(reg.path(P(5, 5), P(5, NaN))).toBeNull();
    expect(reg.path(P(5, 5), P(Infinity, 5))).toBeNull();
    expect(reg.hasGrid(P(NaN, 0))).toBe(false);
  });

  it('paths toward the clamped point when the target is in another grid', () => {
    const reg = new NavRegistry();
    reg.add(yard());
    const p = reg.path(P(5, 5), P(100, 5))!;
    expect(p[p.length - 1]!.x).toBeGreaterThan(19);
  });

  it('applies blockers to whichever grid has them', () => {
    const reg = new NavRegistry();
    reg.add(walled());
    expect(reg.setBlocker('nope', true)).toBe(false);
    expect(reg.setBlocker('door', true)).toBe(true);
    const p = reg.path(P(5, 9.75), P(15, 9.75))!;
    expect(p[p.length - 1]!.x).toBeLessThan(9);
  });

  it('is fast: 500 random queries on a 24 x 58 m grid average under 1 ms', () => {
    const g = new NavGrid({
      id: 'big',
      minX: 0,
      minZ: 0,
      maxX: 24,
      maxZ: 58,
      floorY: 0,
      walkable: [{ x0: 0, z0: 0, x1: 24, z1: 58 }],
      blocked: [
        { x0: 6, z0: 10, x1: 8, z1: 12 },
        { x0: 16, z0: 25, x1: 18, z1: 27 },
        { x0: 8, z0: 40, x1: 10, z1: 42 },
        { x0: 0, z0: 30, x1: 16, z1: 31 },
        { x0: 8, z0: 48, x1: 24, z1: 49 },
      ],
    });
    const reg = new NavRegistry();
    reg.add(g);
    let seed = 12345;
    const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    const valid = (): { x: number; y: number; z: number } => {
      for (;;) {
        const x = rnd() * 24;
        const z = rnd() * 58;
        const i = g.cellIndex(x, z);
        if (i >= 0 && g.isWalkable(i) && g.clearance(i) >= 0.4) return P(x, z);
      }
    };
    const qs = Array.from({ length: 500 }, () => [valid(), valid()] as const);
    for (let i = 0; i < 20; i++) reg.path(qs[i]![0], qs[i]![1]);
    const t0 = performance.now();
    let waypoints = 0;
    for (const [a, b] of qs) waypoints += reg.path(a, b)!.length;
    const avg = (performance.now() - t0) / qs.length;
    console.info(`nav perf: ${avg.toFixed(3)} ms/query over ${qs.length} queries (${waypoints} waypoints)`);
    expect(waypoints).toBeGreaterThan(500);
    expect(avg).toBeLessThan(1);
  });
});
