import { describe, expect, it } from 'vitest';
import { NavGrid, type NavGridDef } from './NavGrid';
import { NavRegistry } from './NavRegistry';

const def = (id: string, x0: number, openEdges: boolean, extra: Partial<NavGridDef> = {}): NavGridDef => ({
  id, minX: x0, minZ: 0, maxX: x0 + 20, maxZ: 20, floorY: 0, cellSize: 0.5, walkable: [{ x0, z0: 0, x1: x0 + 20, z1: 20 }], openEdges, ...extra,
});
const at = (x: number, z: number) => ({ x, y: 0, z });

describe('NavRegistry open-edged grids', () => {
  it('appends a goal in no grid after the edge cell', () => {
    const r = new NavRegistry();
    r.add(new NavGrid(def('street', 0, true)));
    const p = r.path(at(5, 10), at(40, 10))!;
    expect(p.at(-1)).toEqual(at(40, 10));
    expect(p.at(-2)!.x).toBeGreaterThan(18.5); // the last valid cell on the east edge
    expect(r.gridId(at(5, 10))).toBe('street');
    expect(r.gridId(at(40, 10))).toBeNull();
  });

  it('appends a goal in another grid', () => {
    const r = new NavRegistry();
    r.add(new NavGrid(def('market', 0, true)));
    r.add(new NavGrid(def('alley', 30, true)));
    expect(r.path(at(5, 10), at(40, 10))!.at(-1)).toEqual(at(40, 10));
  });

  it('does not append inside the same grid, even when the goal is walled off', () => {
    const r = new NavRegistry();
    r.add(new NavGrid(def('street', 0, true, { blocked: [{ x0: 10, z0: 0, x1: 11, z1: 20 }] })));
    const p = r.path(at(5, 10), at(15, 10))!;
    expect(p.at(-1)!.x).toBeLessThan(10);
  });

  it('never appends on an interior grid (its edge is a wall)', () => {
    const r = new NavRegistry();
    r.add(new NavGrid(def('vault', 0, false)));
    const p = r.path(at(5, 10), at(40, 10))!;
    expect(p.at(-1)!.x).toBeLessThan(20);
  });
});
