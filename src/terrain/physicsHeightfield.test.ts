import { describe, expect, it } from 'vitest';
import { heightAt } from './heightfield';
import { ColliderPatches, buildPhysicsHeightfield } from './physicsHeightfield';

describe('buildPhysicsHeightfield', () => {
  const cx = 3000;
  const cz = -2000;
  const size = 200;
  const cells = 8;
  const hf = buildPhysicsHeightfield(cx, cz, size, cells);

  it('has the documented shape', () => {
    expect(hf.nrows).toBe(cells);
    expect(hf.ncols).toBe(cells);
    expect(hf.heights).toBeInstanceOf(Float32Array);
    expect(hf.heights.length).toBe((cells + 1) * (cells + 1));
    expect(hf.scale).toEqual({ x: size, y: 1, z: size });
    expect(hf.center).toEqual({ x: cx, y: 0, z: cz });
    expect(new Set(hf.heights).size).toBeGreaterThan(10); // the centre is far from the flat meadow
  });

  const sample = (row: number, col: number) => hf.heights[row + col * (hf.nrows + 1)];
  const expected = (row: number, col: number) =>
    Math.fround(heightAt(cx - size / 2 + (col * size) / cells, cz - size / 2 + (row * size) / cells));

  it('stores heights column-major at the documented positions (corners)', () => {
    for (const [row, col] of [
      [0, 0],
      [0, cells],
      [cells, 0],
      [cells, cells],
    ]) {
      expect(sample(row, col)).toBe(expected(row, col));
    }
  });

  it('distinguishes rows from columns (off-diagonal samples)', () => {
    expect(sample(1, 3)).toBe(expected(1, 3));
    expect(sample(3, 1)).toBe(expected(3, 1));
    expect(sample(1, 3)).not.toBe(sample(3, 1));
    for (let row = 0; row <= cells; row++) for (let col = 0; col <= cells; col++) expect(sample(row, col)).toBe(expected(row, col));
  });

  it('works for a single cell and for non-square-friendly spacing', () => {
    const one = buildPhysicsHeightfield(500, 500, 10, 1);
    expect(one.heights.length).toBe(4);
    expect(Array.from(one.heights).every(Number.isFinite)).toBe(true);
  });

  it.each([
    ['NaN centreX', [NaN, 0, 200, 8]],
    ['Infinity centreX', [Infinity, 0, 200, 8]],
    ['NaN centreZ', [0, NaN, 200, 8]],
    ['-Infinity centreZ', [0, -Infinity, 200, 8]],
    ['size 0', [0, 0, 0, 8]],
    ['size -1', [0, 0, -1, 8]],
    ['size NaN', [0, 0, NaN, 8]],
    ['size Infinity', [0, 0, Infinity, 8]],
    ['cells 0', [0, 0, 200, 0]],
    ['cells -1', [0, 0, 200, -1]],
    ['cells 1.5', [0, 0, 200, 1.5]],
    ['cells NaN', [0, 0, 200, NaN]],
  ] as [string, [number, number, number, number]][])('throws RangeError for %s', (_name, args) => {
    expect(() => buildPhysicsHeightfield(...args)).toThrow(RangeError);
  });
});

describe('ColliderPatches', () => {
  const make = () => new ColliderPatches(200, 4, 1);

  it('first update adds (2r+1)^2 patches centred on the player patch', () => {
    const patches = make();
    const { added, removed } = patches.update(10, 10);
    expect(removed).toEqual([]);
    expect(added).toHaveLength(9);
    const keys = added.map((p) => p.key).sort();
    expect(keys).toEqual(['-1,-1', '-1,0', '-1,1', '0,-1', '0,0', '0,1', '1,-1', '1,0', '1,1']);
    for (const p of added) {
      const [ix, iz] = p.key.split(',').map(Number);
      expect(p.heightfield.center).toEqual({ x: (ix + 0.5) * 200, y: 0, z: (iz + 0.5) * 200 });
      expect(p.heightfield.scale.x).toBe(200);
      expect(p.heightfield.nrows).toBe(4);
    }
    expect(patches.keys.sort()).toEqual(keys);
  });

  it('uses floor for negative coordinates', () => {
    const { added } = make().update(-1, -1);
    expect(added.map((p) => p.key)).toContain('-1,-1');
    expect(added.map((p) => p.key)).toContain('-2,-2');
    expect(added.map((p) => p.key)).toContain('0,0');
  });

  it('does not change when moving within the same patch', () => {
    const patches = make();
    patches.update(10, 10);
    const changes = patches.update(190, 199.999);
    expect(changes).toEqual({ added: [], removed: [] });
  });

  it('adds and removes exactly 2r+1 patches when crossing one boundary', () => {
    const patches = make();
    patches.update(150, 150);
    const east = patches.update(200, 150); // x exactly on the boundary is the next patch
    expect(east.added).toHaveLength(3);
    expect(east.removed).toHaveLength(3);
    expect(east.added.map((p) => p.key).sort()).toEqual(['2,-1', '2,0', '2,1']);
    expect(east.removed.sort()).toEqual(['-1,-1', '-1,0', '-1,1']);

    const north = patches.update(250, -1);
    expect(north.added).toHaveLength(3);
    expect(north.removed).toHaveLength(3);
    expect(patches.keys).toHaveLength(9);
  });

  it('replaces everything on a long jump', () => {
    const patches = make();
    patches.update(0, 0);
    const jump = patches.update(100000, 100000);
    expect(jump.added).toHaveLength(9);
    expect(jump.removed).toHaveLength(9);
  });

  it('ignores non-finite positions', () => {
    const patches = make();
    patches.update(0, 0);
    for (const [x, z] of [
      [NaN, 0],
      [0, Infinity],
      [-Infinity, NaN],
    ]) {
      expect(patches.update(x, z)).toEqual({ added: [], removed: [] });
    }
    expect(patches.keys).toHaveLength(9);
    expect(new ColliderPatches(200, 4, 1).update(NaN, NaN)).toEqual({ added: [], removed: [] });
  });

  it('radius 0 keeps a single patch', () => {
    const patches = new ColliderPatches(200, 4, 0);
    expect(patches.update(10, 10).added).toHaveLength(1);
    const move = patches.update(250, 10);
    expect(move.added).toHaveLength(1);
    expect(move.removed).toEqual(['0,0']);
  });

  it('clear() returns all keys and forgets them', () => {
    const patches = make();
    patches.update(0, 0);
    const keys = patches.keys.sort();
    expect(patches.clear().sort()).toEqual(keys);
    expect(patches.keys).toEqual([]);
    expect(patches.clear()).toEqual([]);
    expect(patches.update(0, 0).added).toHaveLength(9);
  });

  it('defaults come from TERRAIN config', () => {
    const patches = new ColliderPatches();
    expect(patches.patchSize).toBe(200);
    expect(patches.cells).toBe(128);
    expect(patches.radius).toBe(1);
  });

  it.each([
    ['patch size 0', [0, 4, 1]],
    ['negative patch size', [-5, 4, 1]],
    ['NaN patch size', [NaN, 4, 1]],
    ['Infinity patch size', [Infinity, 4, 1]],
    ['cells 0', [200, 0, 1]],
    ['fractional cells', [200, 2.5, 1]],
    ['negative radius', [200, 4, -1]],
    ['fractional radius', [200, 4, 0.5]],
    ['NaN radius', [200, 4, NaN]],
  ] as [string, [number, number, number]][])('constructor throws RangeError for %s', (_name, args) => {
    expect(() => new ColliderPatches(...args)).toThrow(RangeError);
  });
});
