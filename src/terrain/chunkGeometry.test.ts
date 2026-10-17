import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildChunkData, buildChunkIndices, chunkVertexCount } from './chunkGeometry';

const hooks = vi.hoisted(() => ({ impl: null as null | ((x: number, z: number) => number) }));

vi.mock('./heightfield', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./heightfield')>();
  return { ...actual, heightAt: (x: number, z: number) => (hooks.impl ? hooks.impl(x, z) : actual.heightAt(x, z)) };
});

afterEach(() => {
  hooks.impl = null;
});

const SEGMENT_CASES = [1, 2, 8, 64];

function tri(indices: ArrayLike<number>, t: number): [number, number, number] {
  return [indices[t * 3], indices[t * 3 + 1], indices[t * 3 + 2]];
}

function vertex(p: Float32Array, i: number): [number, number, number] {
  return [p[i * 3], p[i * 3 + 1], p[i * 3 + 2]];
}

function faceNormal(p: Float32Array, [a, b, c]: [number, number, number]): [number, number, number] {
  const A = vertex(p, a);
  const B = vertex(p, b);
  const C = vertex(p, c);
  const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
  const v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
  return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
}

describe('chunkVertexCount / buildChunkIndices', () => {
  it.each(SEGMENT_CASES)('has consistent buffer sizes for %i segments', (segments) => {
    const data = buildChunkData({ centerX: 1500, centerZ: -800, size: 100, segments, skirtDepth: 4 });
    const count = chunkVertexCount(segments);
    expect(count).toBe((segments + 1) ** 2 + 4 * segments);
    expect(data.positions.length).toBe(count * 3);
    expect(data.normals.length).toBe(count * 3);
    expect(data.colors.length).toBe(count * 3);

    const indices = buildChunkIndices(segments);
    expect(indices.length).toBe(segments * segments * 6 + 4 * segments * 6);
    let max = -1;
    for (const i of indices) max = Math.max(max, i);
    expect(max).toBeLessThan(count);
    expect(indices.length % 3).toBe(0);
  });

  it('uses Uint16Array for 64 segments and Uint32Array when vertices exceed 65535', () => {
    expect(chunkVertexCount(64)).toBeLessThanOrEqual(65535);
    expect(buildChunkIndices(64)).toBeInstanceOf(Uint16Array);
    expect(chunkVertexCount(300)).toBeGreaterThan(65535);
    const big = buildChunkIndices(300);
    expect(big).toBeInstanceOf(Uint32Array);
    let max = 0;
    for (const i of big) max = Math.max(max, i);
    expect(max).toBe(chunkVertexCount(300) - 1);
  });

  it('references every vertex at least once', () => {
    const segments = 8;
    const used = new Set(buildChunkIndices(segments));
    expect(used.size).toBe(chunkVertexCount(segments));
  });
});

describe('triangle winding', () => {
  it.each(SEGMENT_CASES)('grid triangles face +y for %i segments', (segments) => {
    const data = buildChunkData({ centerX: 3000, centerZ: -2000, size: 100, segments, skirtDepth: 3 });
    const indices = buildChunkIndices(segments);
    const gridTris = segments * segments * 2;
    for (let t = 0; t < gridTris; t++) {
      expect(faceNormal(data.positions, tri(indices, t))[1]).toBeGreaterThan(0);
    }
  });

  it.each(SEGMENT_CASES)('skirt triangles face outward and are vertical for %i segments', (segments) => {
    const size = 100;
    const data = buildChunkData({ centerX: 3000, centerZ: -2000, size, segments, skirtDepth: 5 });
    const indices = buildChunkIndices(segments);
    const gridTris = segments * segments * 2;
    const half = size / 2;
    const sides = { minZ: 0, maxZ: 0, minX: 0, maxX: 0 };
    for (let t = gridTris; t < indices.length / 3; t++) {
      const idx = tri(indices, t);
      const n = faceNormal(data.positions, idx);
      expect(Math.abs(n[1])).toBeLessThan(1e-3 * Math.hypot(n[0], n[2]));
      // Outward: away from the chunk centre (positions are centre-relative) in xz.
      let mx = 0;
      let mz = 0;
      for (const i of idx) {
        mx += data.positions[i * 3] / 3;
        mz += data.positions[i * 3 + 2] / 3;
      }
      expect(n[0] * mx + n[2] * mz).toBeGreaterThan(0);
      // Which edge it sits on, by its dominant normal direction.
      if (Math.abs(n[2]) > Math.abs(n[0])) {
        if (n[2] < 0) {
          sides.minZ++;
          expect(mz).toBeCloseTo(-half, 3);
        } else {
          sides.maxZ++;
          expect(mz).toBeCloseTo(half, 3);
        }
      } else if (n[0] < 0) {
        sides.minX++;
        expect(mx).toBeCloseTo(-half, 3);
      } else {
        sides.maxX++;
        expect(mx).toBeCloseTo(half, 3);
      }
    }
    for (const count of Object.values(sides)) expect(count).toBe(segments * 2);
  });
});

describe('skirt vertices', () => {
  it.each([5, 0])('copy a border vertex x/z and hang skirtDepth %f below it', (skirtDepth) => {
    const segments = 8;
    const data = buildChunkData({ centerX: 700, centerZ: 900, size: 100, segments, skirtDepth });
    const grid = (segments + 1) ** 2;
    const total = chunkVertexCount(segments);
    const isBorder = (i: number) => {
      const r = Math.floor(i / (segments + 1));
      const c = i % (segments + 1);
      return r === 0 || c === 0 || r === segments || c === segments;
    };
    const borderKeys = new Map<string, number>();
    for (let i = 0; i < grid; i++) {
      if (!isBorder(i)) continue;
      const [x, y, z] = vertex(data.positions, i);
      borderKeys.set(`${x},${z}`, y);
    }
    expect(borderKeys.size).toBe(4 * segments);
    const seen = new Set<string>();
    for (let s = grid; s < total; s++) {
      const [x, y, z] = vertex(data.positions, s);
      const key = `${x},${z}`;
      expect(borderKeys.has(key)).toBe(true);
      seen.add(key);
      const borderY = borderKeys.get(key) as number;
      expect(borderY - y).toBeCloseTo(skirtDepth, 4);
      if (skirtDepth === 0) expect(y).toBe(borderY);
    }
    expect(seen.size).toBe(4 * segments);
  });

  it('copies border normals and colours', () => {
    const segments = 4;
    const data = buildChunkData({ centerX: 700, centerZ: 900, size: 100, segments, skirtDepth: 5 });
    const grid = (segments + 1) ** 2;
    // First skirt vertex is the min-z, min-x corner (grid index 0).
    for (let k = 0; k < 3; k++) {
      expect(data.normals[grid * 3 + k]).toBe(data.normals[k]);
      expect(data.colors[grid * 3 + k]).toBe(data.colors[k]);
    }
  });
});

describe('normals', () => {
  it('are unit length on real terrain', () => {
    const data = buildChunkData({ centerX: 2500, centerZ: 1500, size: 200, segments: 16, skirtDepth: 8 });
    for (let i = 0; i < data.normals.length / 3; i++) {
      const [x, y, z] = vertex(data.normals, i);
      expect(Math.hypot(x, y, z)).toBeCloseTo(1, 5);
      expect(y).toBeGreaterThan(0);
    }
  });

  it('are exactly (0,1,0) on a constant height, with minY === maxY', () => {
    hooks.impl = () => 17.5;
    const data = buildChunkData({ centerX: 10, centerZ: -30, size: 64, segments: 8, skirtDepth: 3 });
    for (let i = 0; i < data.normals.length / 3; i++) {
      expect(vertex(data.normals, i)).toEqual([0, 1, 0]);
    }
    expect(data.minY).toBe(17.5);
    expect(data.maxY).toBe(17.5);
  });

  it('match the analytic normal of a sloped plane h = 0.5 x, including borders', () => {
    hooks.impl = (x) => 0.5 * x;
    const data = buildChunkData({ centerX: 400, centerZ: 100, size: 64, segments: 8, skirtDepth: 3 });
    const len = Math.hypot(0.5, 1);
    for (let i = 0; i < data.normals.length / 3; i++) {
      const [x, y, z] = vertex(data.normals, i);
      expect(x).toBeCloseTo(-0.5 / len, 6);
      expect(y).toBeCloseTo(1 / len, 6);
      expect(z).toBeCloseTo(0, 6);
    }
  });
});

describe('minY / maxY', () => {
  it('bracket all grid heights exactly and exclude skirts', () => {
    const segments = 16;
    const skirtDepth = 500;
    const data = buildChunkData({ centerX: 3200, centerZ: 3200, size: 400, segments, skirtDepth });
    const grid = (segments + 1) ** 2;
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < grid; i++) {
      const y = data.positions[i * 3 + 1];
      lo = Math.min(lo, y);
      hi = Math.max(hi, y);
      expect(y).toBeGreaterThanOrEqual(data.minY - 1e-3);
      expect(y).toBeLessThanOrEqual(data.maxY + 1e-3);
    }
    expect(data.minY).toBeLessThanOrEqual(lo + 1e-3);
    expect(data.maxY).toBeGreaterThanOrEqual(hi - 1e-3);
    expect(data.maxY).toBeGreaterThan(data.minY);
    // Skirts hang far below minY, so they cannot have been included.
    expect(data.positions[grid * 3 + 1]).toBeLessThan(data.minY - skirtDepth / 2);
  });

  it('colours are finite and in [0, 1]', () => {
    const data = buildChunkData({ centerX: 3200, centerZ: 3200, size: 400, segments: 16, skirtDepth: 4 });
    for (const c of data.colors) {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(1);
    }
  });
});
