import { describe, expect, it } from 'vitest';
import { WORLD_BOUNDS } from '../config/constants';
import { BRIGHTWATER_LAYOUT } from '../region/brightwater.layout';
import GOLDEN from './__fixtures__/phase-a-anchor-heights.json';
import { HEIGHT_RANGE, heightAt, naturalHeightAt, worldRoads } from './heightfield';
import { DEAD_ROAD } from './shape/deadRoad';
import { HARROWMARK_PLATEAU } from './shape/harrowmark';
import { PHASE_A_PROTECTED } from './shaping';

// v0.5 terrain shaping must never move Phase A ground (contracts/heightfield.md "Terrain shaping"). The golden
// file is regenerated at the slice2-phase-a tag with `npx vite-node tools/gen-phase-a-heights.ts`.
const golden = GOLDEN as Record<string, number>;

describe('Phase A ground is unchanged by terrain shaping', () => {
  it('every layout anchor keeps its golden height, keyed by id; later anchors equal the natural ground', () => {
    let compared = 0;
    for (const a of BRIGHTWATER_LAYOUT.anchors) {
      const h = heightAt(a.x, a.z);
      expect(h, a.id).toBe(naturalHeightAt(a.x, a.z));
      if (a.id in golden) {
        expect(h, a.id).toBe(golden[a.id]);
        compared++;
      }
    }
    expect(compared).toBeGreaterThan(50);
  });

  it('a 25 m grid over the protected box is exactly the natural ground', () => {
    const b = PHASE_A_PROTECTED;
    for (let x = b.minX; x <= b.maxX; x += 25) {
      for (let z = b.minZ; z <= b.maxZ; z += 25) {
        if (heightAt(x, z) !== naturalHeightAt(x, z)) throw new Error(`shaped Phase A ground at (${x}, ${z})`);
      }
    }
  });

  it('the fog wall point is inside the protected box and untouched', () => {
    expect(PHASE_A_PROTECTED.maxX).toBe(1100);
    expect(heightAt(1100, -150)).toBe(naturalHeightAt(1100, -150));
  });
});

describe('the placeholder world shape', () => {
  it('the city plateau is flat at its height and the South Gate meets the road', () => {
    const p = HARROWMARK_PLATEAU;
    for (const [x, z] of [[8500, 2000], [p.box.minX, p.box.minZ], [p.box.maxX, p.box.maxZ]]) expect(heightAt(x, z)).toBe(p.height);
    const last = DEAD_ROAD.points[DEAD_ROAD.points.length - 1];
    expect(heightAt(last.x, last.z)).toBeCloseTo(p.height, 6);
  });

  it('the Dead Road starts at the fog wall and keeps 8% past its taper', () => {
    expect(DEAD_ROAD.points[0]).toEqual({ x: 1100, z: -150 });
    const len = worldRoads.length('dead-road');
    let worst = 0;
    for (let s = DEAD_ROAD.startTaper; s + 1 <= len; s += 1) {
      worst = Math.max(worst, Math.abs(worldRoads.profile('dead-road', s + 1) - worldRoads.profile('dead-road', s)));
    }
    expect(worst).toBeLessThanOrEqual(DEAD_ROAD.maxGrade + 1e-9);
  });

  it('heightAt stays inside HEIGHT_RANGE on a coarse world grid', () => {
    for (let x = WORLD_BOUNDS.minX; x <= WORLD_BOUNDS.maxX; x += 250) {
      for (let z = WORLD_BOUNDS.minZ; z <= WORLD_BOUNDS.maxZ; z += 250) {
        const h = heightAt(x, z);
        if (!(h >= HEIGHT_RANGE.min && h <= HEIGHT_RANGE.max)) throw new Error(`height ${h} at (${x}, ${z})`);
      }
    }
  });

  it('ridges are gone in the Harrowmark box: its ground stays low', () => {
    let max = -Infinity;
    for (let x = 6600; x <= 10400; x += 100) for (let z = 100; z <= 3900; z += 100) max = Math.max(max, heightAt(x, z));
    expect(max).toBeLessThan(120);
  });
});

describe('meshes and physics see the shaped ground', () => {
  it('a physics patch and a chunk mesh on the city plateau are flat at its height', async () => {
    const { buildPhysicsHeightfield } = await import('./physicsHeightfield');
    const { buildChunkData, chunkVertexCount } = await import('./chunkGeometry');
    const hf = buildPhysicsHeightfield(8500, 2000, 200, 32);
    for (const h of hf.heights) expect(h).toBe(HARROWMARK_PLATEAU.height);
    const chunk = buildChunkData({ centerX: 8500, centerZ: 2000, size: 200, segments: 16, skirtDepth: 2 });
    const grid = (16 + 1) ** 2;
    expect(chunkVertexCount(16)).toBeGreaterThanOrEqual(grid);
    for (let i = 0; i < grid; i++) expect(chunk.positions[i * 3 + 1]).toBeCloseTo(HARROWMARK_PLATEAU.height, 4);
  });
});
