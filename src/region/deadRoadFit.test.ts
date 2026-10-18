// The Dead Road's fit on the natural ground (slice 2 thread 4, PR 2). core's shaper makes the 8% grade true by
// construction, so these limits are the ones that can fail: how far the road cuts into or fills over the ground, how
// wide its blend gets and how steep its banks are. Numbers measured on the shipped polyline are in the PR.
import { describe, expect, it } from 'vitest';
import { WORLD_BOUNDS } from '../config/constants';
import { heightAt, naturalHeightAt, worldRoads } from '../terrain/heightfield';
import { MAX_ROAD_BLEND, PHASE_A_PROTECTED } from '../terrain/shaping';
import { DEAD_ROAD, DEAD_ROAD_PLATEAUS, FARM_RING_PLATEAU } from '../terrain/shape/deadRoad';
import { regionAt } from './regionMask';

/** Ridge suppression around Harrowmark reaches x 6100; west of it the shaper's ground before roads is the natural ground. */
const NATURAL_UNTIL_X = 6100;
const MAX_CUT = 25;
const MAX_BANK_SLOPE = 0.9;
const STEP = 20;

interface Sample {
  x: number;
  z: number;
  s: number;
  /** Unit normal to the segment. */
  nx: number;
  nz: number;
}

function samples(step = STEP): Sample[] {
  const out: Sample[] = [];
  let arc = 0;
  const pts = DEAD_ROAD.points;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const dx = (b.x - a.x) / len;
    const dz = (b.z - a.z) / len;
    for (let t = 0; t < len; t += step) out.push({ x: a.x + dx * t, z: a.z + dz * t, s: arc + t, nx: -dz, nz: dx });
    arc += len;
  }
  return out;
}

describe('the Dead Road polyline', () => {
  it('leaves the fog wall due east at (1100, -150), ends at the South Gate and stays inside the world', () => {
    const pts = DEAD_ROAD.points;
    expect(pts[0]).toEqual({ x: 1100, z: -150 });
    expect(pts[1].z).toBe(-150);
    expect(pts[pts.length - 1]).toEqual({ x: 8500, z: 1250 });
    expect(pts[pts.length - 2]).toEqual({ x: 8500, z: 1180 });
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(WORLD_BOUNDS.minX);
      expect(p.x).toBeLessThanOrEqual(WORLD_BOUNDS.maxX);
      expect(p.z).toBeGreaterThanOrEqual(WORLD_BOUNDS.minZ);
      expect(p.z).toBeLessThanOrEqual(WORLD_BOUNDS.maxZ);
    }
  });

  it('never enters the Phase A protected box past the fog wall and keeps east after (1300, -150)', () => {
    const pts = DEAD_ROAD.points;
    for (const p of pts.slice(1)) expect(p.x).toBeGreaterThanOrEqual(PHASE_A_PROTECTED.maxX);
  });

  it('is about 9 to 9.5 km from Kettlewick (its gate is 1.46 km before the fog wall)', () => {
    const length = worldRoads.length('dead-road');
    expect(length + 1460).toBeGreaterThan(8800);
    expect(length + 1460).toBeLessThan(9700);
  });

  it('reaches Harrowmark and passes through the null corridor on the way', () => {
    const ids = samples(50).map((p) => regionAt(p.x, p.z)?.id ?? null);
    expect(ids).toContain('brightwater');
    expect(ids).toContain(null);
    expect(ids).toContain('harrowmark');
    expect(regionAt(8500, 1250)?.id).toBe('harrowmark');
  });
});

describe('the Dead Road fit', () => {
  const along = samples();

  // East of x 6100 the ground before roads is the suppressed ridge field, which core does not export, so the cut limit
  // is checked on the natural ground west of it (about 70% of the road); the bank-slope test below covers all of it.
  it(`cuts or fills at most ${MAX_CUT} m at the centre and at both edges (on the natural ground)`, () => {
    let worst = 0;
    for (const p of along) {
      if (p.x >= NATURAL_UNTIL_X) continue;
      const profile = worldRoads.profile('dead-road', p.s);
      for (const off of [0, 6, -6]) {
        const cut = Math.abs(profile - naturalHeightAt(p.x + p.nx * off, p.z + p.nz * off));
        worst = Math.max(worst, cut);
        expect(cut, `at (${p.x.toFixed(0)}, ${p.z.toFixed(0)}) offset ${off}`).toBeLessThanOrEqual(MAX_CUT);
      }
    }
    expect(worst).toBeGreaterThan(0);
  });

  it('never grows its blend toward MAX_ROAD_BLEND: the ground 60% of the cap out is untouched', () => {
    for (const p of along) {
      if (p.x >= NATURAL_UNTIL_X || p.x < 1400) continue;
      const off = 6 + MAX_ROAD_BLEND * 0.6;
      for (const side of [1, -1]) {
        const x = p.x + p.nx * off * side;
        const z = p.z + p.nz * off * side;
        expect(Math.abs(heightAt(x, z) - naturalHeightAt(x, z)), `at (${x.toFixed(0)}, ${z.toFixed(0)})`).toBeLessThan(0.5);
      }
    }
  });

  it(`keeps every bank at most ${MAX_BANK_SLOPE} steep on 4 m samples out to the edge of the blend`, () => {
    let worst = 0;
    for (const p of along) {
      const profile = worldRoads.profile('dead-road', p.s);
      const reach = 6 + Math.max(30, 2.6 * Math.abs(profile - naturalHeightAt(p.x, p.z)) + 10);
      for (const side of [1, -1]) {
        for (let o = 6; o < reach; o += 4) {
          const h0 = heightAt(p.x + p.nx * o * side, p.z + p.nz * o * side);
          const h1 = heightAt(p.x + p.nx * (o + 4) * side, p.z + p.nz * (o + 4) * side);
          worst = Math.max(worst, Math.abs(h1 - h0) / 4);
        }
      }
    }
    expect(worst).toBeLessThanOrEqual(MAX_BANK_SLOPE);
  });

  it('the centreline never climbs more than 8% over any 5 m step', () => {
    const length = worldRoads.length('dead-road');
    for (let s = 5; s <= length; s += 5) {
      const rise = Math.abs(worldRoads.profile('dead-road', s) - worldRoads.profile('dead-road', s - 5)) / 5;
      expect(rise).toBeLessThanOrEqual(0.08 + 1e-6);
    }
  });

  it('is exactly the natural ground at the fog wall', () => {
    expect(worldRoads.profile('dead-road', 0)).toBeCloseTo(naturalHeightAt(1100, -150), 6);
    expect(heightAt(1100, -150)).toBeCloseTo(naturalHeightAt(1100, -150), 6);
  });
});

describe('the farm-ring plateau', () => {
  const box = FARM_RING_PLATEAU.box;

  it('is registered with the shape, east of x 6500 so it sits in Harrowmark', () => {
    expect(DEAD_ROAD_PLATEAUS).toContain(FARM_RING_PLATEAU);
    expect(box.minX).toBeGreaterThanOrEqual(6500);
    expect(regionAt(box.minX, box.minZ)?.id).toBe('harrowmark');
    expect(regionAt(box.maxX, box.maxZ)?.id).toBe('harrowmark');
  });

  it('is flat at its height across the box, and the road crosses it at that height', () => {
    for (let x = box.minX; x <= box.maxX; x += 10) {
      for (let z = box.minZ; z <= box.maxZ; z += 10) expect(heightAt(x, z)).toBeCloseTo(FARM_RING_PLATEAU.height, 1);
    }
    let crossed = 0;
    for (const p of samples(5)) {
      if (p.x < box.minX || p.x > box.maxX || p.z < box.minZ || p.z > box.maxZ) continue;
      crossed++;
      expect(Math.abs(worldRoads.profile('dead-road', p.s) - FARM_RING_PLATEAU.height)).toBeLessThanOrEqual(0.5);
    }
    expect(crossed).toBeGreaterThan(20);
  });

  it('blends back to the ground no steeper than 0.5 on any side', () => {
    let worst = 0;
    const sweep = (x0: number, z0: number, dx: number, dz: number) => {
      for (let t = 0; t < FARM_RING_PLATEAU.blend; t += 4) {
        const h0 = heightAt(x0 + dx * t, z0 + dz * t);
        const h1 = heightAt(x0 + dx * (t + 4), z0 + dz * (t + 4));
        worst = Math.max(worst, Math.abs(h1 - h0) / 4);
      }
    };
    const midX = (box.minX + box.maxX) / 2;
    const midZ = (box.minZ + box.maxZ) / 2;
    sweep(box.minX, midZ, -1, 0);
    sweep(box.maxX, midZ, 1, 0);
    sweep(midX, box.maxZ, 0, 1);
    sweep(midX, box.minZ, 0, -1);
    expect(worst).toBeLessThanOrEqual(0.5);
  });
});
