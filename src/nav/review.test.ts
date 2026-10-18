import { describe, expect, it } from 'vitest';
import { NavAgent } from './NavAgent';
import { NavGrid } from './NavGrid';
import { findPath } from './pathfind';

const rng = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

describe('nav regressions from the code review', () => {
  it('clearance is the exact Euclidean distance (against brute force on random grids)', () => {
    const rnd = rng(11);
    let worst = 0;
    for (let g = 0; g < 30; g++) {
      const blocked = Array.from({ length: 6 }, () => {
        const x = Math.floor(rnd() * 36) * 0.5;
        const z = Math.floor(rnd() * 36) * 0.5;
        return { x0: x, z0: z, x1: x + 0.5 + Math.floor(rnd() * 4) * 0.5, z1: z + 0.5 + Math.floor(rnd() * 4) * 0.5 };
      });
      const grid = new NavGrid({ id: `g${g}`, minX: 0, minZ: 0, maxX: 20, maxZ: 20, floorY: 0, walkable: [{ x0: 0, z0: 0, x1: 20, z1: 20 }], blocked });
      const solid: { x: number; z: number }[] = [];
      for (let iz = -1; iz <= grid.rows; iz++) {
        for (let ix = -1; ix <= grid.cols; ix++) {
          const out = ix < 0 || iz < 0 || ix >= grid.cols || iz >= grid.rows;
          if (out || !grid.isWalkable(iz * grid.cols + ix)) solid.push({ x: ix, z: iz });
        }
      }
      for (let i = 0; i < grid.cols * grid.rows; i++) {
        if (!grid.isWalkable(i)) continue;
        const ix = i % grid.cols;
        const iz = Math.floor(i / grid.cols);
        let best = Infinity;
        for (const s of solid) best = Math.min(best, (s.x - ix) ** 2 + (s.z - iz) ** 2);
        const expected = Math.sqrt(best) * 0.5 - 0.25;
        worst = Math.max(worst, Math.abs(grid.clearance(i) - expected));
      }
    }
    expect(worst).toBeLessThan(1e-5);
  });

  it('smoothed segments keep at least the radius minus a small tolerance from a grid-aligned block', () => {
    const rect = { x0: 9, z0: 9, x1: 11, z1: 11 };
    const grid = new NavGrid({ id: 'g', minX: 0, minZ: 0, maxX: 20, maxZ: 20, floorY: 0, walkable: [{ x0: 0, z0: 0, x1: 20, z1: 20 }], blocked: [rect] });
    const dist = (x: number, z: number) => Math.hypot(Math.max(rect.x0 - x, 0, x - rect.x1), Math.max(rect.z0 - z, 0, z - rect.z1));
    const rnd = rng(7);
    for (const r of [0.4, 0.75]) {
      let worst = Infinity;
      for (let q = 0; q < 1500; q++) {
        const from = { x: rnd() * 20, y: 0, z: rnd() * 20 };
        const to = { x: rnd() * 20, y: 0, z: rnd() * 20 };
        if (dist(from.x, from.z) < r + 0.5 || dist(to.x, to.z) < r + 0.5) continue;
        let prev = { x: from.x, z: from.z };
        for (const w of findPath(grid, from, to, r)) {
          for (let k = 0; k <= 50; k++) worst = Math.min(worst, dist(prev.x + ((w.x - prev.x) * k) / 50, prev.z + ((w.z - prev.z) * k) / 50));
          prev = w;
        }
      }
      // The cell chain itself may pass a corner at the diagonal cell (0.354 m from it at 0.5 m cells).
      expect(worst, `radius ${r}`).toBeGreaterThanOrEqual(Math.min(r, 0.354) - 0.06);
    }
  });

  it('a start snapped out of a pillar keeps the snapped cell centre as its first waypoint', () => {
    const grid = new NavGrid({ id: 'g', minX: 0, minZ: 0, maxX: 10, maxZ: 10, floorY: 0, walkable: [{ x0: 0, z0: 0, x1: 10, z1: 10 }], blocked: [{ x0: 4, z0: 4, x1: 6, z1: 6 }] });
    const path = findPath(grid, { x: 5.9, y: 0, z: 5 }, { x: 9, y: 0, z: 5 }, 0.4);
    const first = path[0];
    const cell = grid.cellIndex(first.x, first.z);
    expect(grid.cellCentre(cell)).toMatchObject({ x: first.x, z: first.z });
    expect(grid.clearance(cell)).toBeGreaterThanOrEqual(0.4);
    expect(path.at(-1)).toMatchObject({ x: 9, z: 5 });
  });

  it('NavAgent holds at the end of a path that stops short of an unreachable target', () => {
    const grid = new NavGrid({
      id: 'g', minX: 0, minZ: 0, maxX: 10, maxZ: 10, floorY: 0,
      walkable: [{ x0: 0, z0: 0, x1: 10, z1: 10 }], blocked: [{ x0: 4.5, z0: 0, x1: 5.5, z1: 10 }],
    });
    const nav = { path: (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => findPath(grid, a, b, 0.4), hasGrid: () => true };
    const agent = new NavAgent(() => nav);
    const self = { x: 1, y: 0, z: 5 };
    const target = { x: 9, y: 0, z: 5 };
    let d = agent.desired(self, target, 1 / 60)!;
    // Walk to the end of the path.
    for (let i = 0; i < 20 && d; i++) {
      self.x = d.x;
      self.z = d.z;
      d = agent.desired(self, target, 1 / 60)!;
    }
    expect(d.x).toBeLessThan(4.5);
  });
});
