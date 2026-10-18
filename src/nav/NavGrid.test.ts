import { describe, expect, it } from 'vitest';
import { NavGrid } from './NavGrid';

/** 10 x 10 m room at floor 5, with a 1.5 m wide door gap in a dividing wall at x 5..6. */
function room() {
  return new NavGrid({
    id: 'room',
    minX: 0,
    minZ: 0,
    maxX: 10,
    maxZ: 10,
    floorY: 5,
    walkable: [{ x0: 0, z0: 0, x1: 10, z1: 10 }],
    blocked: [
      { x0: 5, z0: 0, x1: 6, z1: 4 },
      { x0: 5, z0: 5.5, x1: 6, z1: 10 },
    ],
    blockers: { door: [{ x0: 5, z0: 4, x1: 6, z1: 5.5 }] },
  });
}

describe('NavGrid', () => {
  it('builds walkable and blocked cells from rects', () => {
    const g = room();
    expect(g.cols).toBe(20);
    expect(g.rows).toBe(20);
    expect(g.isWalkable(g.cellIndex(1, 1))).toBe(true);
    expect(g.isWalkable(g.cellIndex(5.5, 1))).toBe(false);
    expect(g.isWalkable(g.cellIndex(5.5, 4.75))).toBe(true);
    expect(g.isWalkable(-1)).toBe(false);
    expect(g.cellIndex(-0.1, 1)).toBe(-1);
    expect(g.cellIndex(10, 1)).toBe(-1);
  });

  it('reports cell centres', () => {
    const g = room();
    const c = g.cellCentre(g.cellIndex(1.1, 2.3));
    expect(c).toEqual({ x: 1.25, y: 5, z: 2.25 });
  });

  it('measures clearance from the nearest non-walkable cell centre minus half a cell', () => {
    const g = room();
    expect(g.clearance(g.cellIndex(0.25, 0.25))).toBeCloseTo(0.25, 5); // against the grid edge
    expect(g.clearance(g.cellIndex(4.75, 1))).toBeCloseTo(0.25, 5); // against the wall
    expect(g.clearance(g.cellIndex(2.75, 5))).toBeGreaterThan(1);
    // Door gap is 3 cells (z 4..5.5): the middle cell centre is 2 cells (1.0 m) from a wall centre, minus 0.25.
    expect(g.clearance(g.cellIndex(5.5, 4.75))).toBeCloseTo(0.75, 5);
    expect(g.clearance(g.cellIndex(5.5, 4.25))).toBeCloseTo(0.25, 5);
    expect(g.clearance(g.cellIndex(5.5, 1))).toBe(0);
  });

  it('splits components with a closed blocker and merges them when it opens', () => {
    const g = room();
    const a = g.cellIndex(1, 5);
    const b = g.cellIndex(8, 5);
    expect(g.component(a)).toBe(g.component(b));
    expect(g.setBlocker('door', true)).toBe(true);
    expect(g.hasBlocker('door')).toBe(true);
    expect(g.component(a)).not.toBe(g.component(b));
    expect(g.isWalkable(g.cellIndex(5.5, 4.75))).toBe(false);
    expect(g.component(g.cellIndex(5.5, 4.75))).toBe(-1);
    g.setBlocker('door', false);
    expect(g.component(a)).toBe(g.component(b));
    expect(g.isWalkable(g.cellIndex(5.5, 4.75))).toBe(true);
  });

  it('does not connect components through a diagonal corner touch', () => {
    const g = new NavGrid({
      id: 'diag',
      minX: 0,
      minZ: 0,
      maxX: 1,
      maxZ: 1,
      floorY: 0,
      walkable: [
        { x0: 0, z0: 0, x1: 0.5, z1: 0.5 },
        { x0: 0.5, z0: 0.5, x1: 1, z1: 1 },
      ],
    });
    expect(g.component(g.cellIndex(0.25, 0.25))).not.toBe(g.component(g.cellIndex(0.75, 0.75)));
  });

  it('contains() checks bounds and the vertical band', () => {
    const g = room();
    expect(g.contains({ x: 5, y: 5, z: 5 })).toBe(true);
    expect(g.contains({ x: 5, y: 7.4, z: 5 })).toBe(true);
    expect(g.contains({ x: 5, y: -145, z: 5 })).toBe(false);
    expect(g.contains({ x: 11, y: 5, z: 5 })).toBe(false);
    expect(g.contains({ x: 5, y: 5, z: -1 })).toBe(false);
  });

  it('refuses unknown blockers', () => {
    const g = room();
    expect(g.setBlocker('nope', true)).toBe(false);
    expect(g.hasBlocker('nope')).toBe(false);
  });

  it('rejects a non-positive cell size', () => {
    expect(() => new NavGrid({ id: 'x', minX: 0, minZ: 0, maxX: 1, maxZ: 1, floorY: 0, cellSize: 0, walkable: [] })).toThrow();
  });
});
