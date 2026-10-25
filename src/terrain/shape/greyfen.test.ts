// Act 3 thread K1: the Greyfen as shaped on the real heightfield (plan 3.5 and the hand-offs to K3 and K7).
import { describe, expect, it } from 'vitest';
import { heightAt, worldRoads } from '../heightfield';
import { MAX_GROUND_RANGE } from '../../interiors/layout';
import { ACT3_FERRY, ACT3_INTERIOR_PADS, ACT3_WAYSTONES, M24_POOL } from '../../region/act3/act3Places';
import { engineBox } from '../../region/regions';
import {
  CAUSEWAY_DECK,
  CAUSEWAY_GAPS,
  CAUSEWAY_REEDGATE_MERE_POINTS,
  FEN_ROAD_POINTS,
  FERRY_CHANNELS,
  GREYFEN_PLATEAUS,
  GREYFEN_ROADS,
  GREYFEN_WATER_TABLE,
  HATHRENS_MERE,
  WADE_FLOOR_MIN,
} from './greyfen';
import { roadPoint } from './roadPoint';

const segDist = (pts: readonly (readonly [number, number])[], x: number, z: number): number => {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1];
    const dx = pts[i][0] - ax;
    const dz = pts[i][1] - az;
    const t = Math.min(Math.max(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0), 1);
    best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
  }
  return best;
};
const channels = FERRY_CHANNELS.map((c) => c.points.map((p) => [p.x, p.z] as const));

describe('Greyfen ground (K1)', () => {
  it('outside the Mere, the ferry channels, the causeway gaps and the M24 pit, no fen ground is deeper than wading water', () => {
    const b = engineBox('greyfen');
    let wet = 0;
    for (let x = b.x0; x <= b.x1; x += 50) {
      for (let z = b.z0; z <= b.z1; z += 50) {
        if (Math.hypot(x - HATHRENS_MERE.x, z - HATHRENS_MERE.z) < HATHRENS_MERE.radius + 30) continue;
        if (channels.some((c) => segDist(c, x, z) < 30)) continue;
        if (Math.hypot(x - M24_POOL.x, z - M24_POOL.z) < 15) continue;
        const h = heightAt(x, z);
        expect(h, `(${x}, ${z})`).toBeGreaterThanOrEqual(WADE_FLOOR_MIN);
        expect(h, `(${x}, ${z})`).toBeLessThan(20);
        if (h < GREYFEN_WATER_TABLE) wet++;
      }
    }
    // Bog pools under the water sheet: some, not most.
    expect(wet).toBeGreaterThan(50);
  });

  it('the Mere has a deep floor, a wading shelf and dry ground beyond', () => {
    expect(heightAt(HATHRENS_MERE.x, HATHRENS_MERE.z)).toBeCloseTo(HATHRENS_MERE.floor, 1);
    const shelf = heightAt(HATHRENS_MERE.x + HATHRENS_MERE.radius + 30, HATHRENS_MERE.z);
    expect(shelf).toBeGreaterThan(GREYFEN_WATER_TABLE - 1.2);
    expect(shelf).toBeLessThan(GREYFEN_WATER_TABLE - 0.4);
  });

  it('every ferry path has at least 1.3 m of water along its centreline, from landing to landing', () => {
    for (const path of ACT3_FERRY.paths) {
      for (let i = 1; i < path.points.length; i++) {
        const [ax, az] = path.points[i - 1];
        const [bx, bz] = path.points[i];
        const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 10);
        for (let k = 0; k <= n; k++) {
          const x = ax + ((bx - ax) * k) / n;
          const z = az + ((bz - az) * k) / n;
          // The landings are quays: skip the last 40 m at each end (the Reedgate quay's pad and its 10 m blend).
          if (Math.hypot(x - path.points[0][0], z - path.points[0][1]) < 40 || Math.hypot(x - path.points[path.points.length - 1][0], z - path.points[path.points.length - 1][1]) < 40) continue;
          expect(ACT3_FERRY.surfaceY - heightAt(x, z), `${path.id} at (${x.toFixed(0)}, ${z.toFixed(0)})`).toBeGreaterThanOrEqual(1.3);
        }
      }
    }
    expect(ACT3_FERRY.paths.length).toBeGreaterThanOrEqual(3);
  });

  it('pins every Greyfen plateau and the four Greyfen waystones on dry ground', () => {
    for (const p of GREYFEN_PLATEAUS) {
      const cx = (p.box.minX + p.box.maxX) / 2;
      const cz = (p.box.minZ + p.box.maxZ) / 2;
      const atCentre = p.hollow ? heightAt(p.box.minX + 2, cz) : heightAt(cx, cz);
      expect(atCentre, p.id).toBeCloseTo(p.height, 2);
      expect(p.height, p.id).toBeGreaterThan(GREYFEN_WATER_TABLE);
    }
    for (const id of ['reedgate', 'hathrens-mere', 'greywatch', 'mireweather-hut'] as const) {
      const w = ACT3_WAYSTONES[id];
      expect(heightAt(w.x, w.z), id).toBeCloseTo(w.y, 1);
    }
  });

  it('the Greyfen interior pads are flat well inside the 40 m float rule', () => {
    for (const id of ['sunken-chapel', 'mirewater-deeps', 'mireweather-hut'] as const) {
      const p = ACT3_INTERIOR_PADS[id];
      let lo = Infinity;
      let hi = -Infinity;
      for (let x = p.x - p.w / 2; x <= p.x + p.w / 2; x += 2) {
        for (let z = p.z - p.d / 2; z <= p.z + p.d / 2; z += 2) {
          const h = heightAt(x, z);
          lo = Math.min(lo, h);
          hi = Math.max(hi, h);
        }
      }
      expect(hi - lo, id).toBeLessThan(1);
      expect(hi - lo).toBeLessThan(MAX_GROUND_RANGE);
      expect(lo, id).toBeCloseTo(p.y, 1);
    }
  });

  it('the M24 pit is 6 m deep under a flat rim', () => {
    expect(heightAt(M24_POOL.x, M24_POOL.z)).toBeCloseTo(M24_POOL.floorY, 1);
    expect(heightAt(M24_POOL.x - M24_POOL.w / 2 - 3, M24_POOL.z)).toBeCloseTo(M24_POOL.rimY, 1);
    expect(heightAt(M24_POOL.x, M24_POOL.z + M24_POOL.d / 2 + 3)).toBeCloseTo(M24_POOL.rimY, 1);
    expect(M24_POOL.rimY - M24_POOL.floorY).toBe(6);
  });
});

describe('Greyfen roads and causeways (K1)', () => {
  const grade = (id: string): number => {
    const len = worldRoads.length(id);
    let worst = 0;
    for (let s = 0; s + 5 <= len; s += 5) worst = Math.max(worst, Math.abs(worldRoads.profile(id, s + 5) - worldRoads.profile(id, s)) / 5);
    return worst;
  };

  it('every road keeps its grade, and the Fen Road and Fen Track keep 8%', () => {
    for (const r of GREYFEN_ROADS) expect(grade(r.id), r.id).toBeLessThanOrEqual(r.maxGrade + 1e-6);
    expect(GREYFEN_ROADS.find((r) => r.id === 'fen-road')!.maxGrade).toBe(0.08);
    expect(GREYFEN_ROADS.find((r) => r.id === 'fen-track')!.maxGrade).toBe(0.08);
  });

  it('the Fen Road leaves through the shipped face and bends west within 500 m of it, clear of the Waste corner by 80 m', () => {
    expect(FEN_ROAD_POINTS).toContainEqual([7800, 3970]);
    const i = FEN_ROAD_POINTS.findIndex(([x, z]) => x === 7800 && z === 3970);
    const [nx, nz] = FEN_ROAD_POINTS[i + 1];
    expect(nx).toBeLessThan(7800);
    // By 500 m out it is already west of the Waste's west edge (x 7000).
    const at500 = roadPoint('fen-road', Math.hypot(FEN_ROAD_POINTS[1][0] - FEN_ROAD_POINTS[0][0], FEN_ROAD_POINTS[1][1] - FEN_ROAD_POINTS[0][1]) + Math.hypot(7800 - FEN_ROAD_POINTS[1][0], 3970 - FEN_ROAD_POINTS[1][1]) + 500);
    expect(at500.x).toBeLessThan(7400);
    expect(nz).toBeGreaterThan(3970);
    expect(segDist(FEN_ROAD_POINTS, 7000, 4500)).toBeGreaterThanOrEqual(80);
  });

  it('the Fen Road is about 9.5 km from the shipped face to Reedgate (within 10%)', () => {
    const i = FEN_ROAD_POINTS.findIndex(([x, z]) => x === 7800 && z === 3970);
    let len = 0;
    for (let k = i + 1; k < FEN_ROAD_POINTS.length; k++) len += Math.hypot(FEN_ROAD_POINTS[k][0] - FEN_ROAD_POINTS[k - 1][0], FEN_ROAD_POINTS[k][1] - FEN_ROAD_POINTS[k - 1][1]);
    expect(len).toBeGreaterThan(9500 * 0.9);
    expect(len).toBeLessThan(9500 * 1.1);
  });

  it('the causeways stand at the deck height except in the two gaps, where open water spans at least 8 m', () => {
    for (const id of ['causeway-reedgate-mere', 'causeway-mere-greywatch', 'causeway-mere-mireweather']) {
      const len = worldRoads.length(id);
      for (let s = 0; s <= len; s += 5) {
        if (CAUSEWAY_GAPS.some((g) => id === g.causewayId && Math.abs(s - g.arc) < 12)) continue;
        expect(worldRoads.profile(id, s), `${id} at ${s}`).toBeGreaterThanOrEqual(CAUSEWAY_DECK - 1e-6);
      }
    }
    for (const g of CAUSEWAY_GAPS) {
      let wet = 0;
      for (let s = g.arc - 10; s <= g.arc + 10; s += 0.5) {
        const p = roadPoint('causeway-reedgate-mere', s);
        if (heightAt(p.x, p.z) < GREYFEN_WATER_TABLE) wet += 0.5;
      }
      expect(wet).toBeGreaterThanOrEqual(8);
    }
    expect(CAUSEWAY_GAPS.map((g) => g.arc / worldRoads.length('causeway-reedgate-mere'))).toEqual([expect.closeTo(0.35, 2), expect.closeTo(0.7, 2)]);
    expect(CAUSEWAY_REEDGATE_MERE_POINTS.length).toBeGreaterThanOrEqual(2);
  });

  it('no dry pad or waystone sits on a road or causeway ribbon', () => {
    const strips = GREYFEN_ROADS.map((r) => ({ id: r.id, pts: r.points.map((p) => [p.x, p.z] as const), half: r.halfWidth }));
    for (const [id, w] of Object.entries(ACT3_WAYSTONES)) {
      for (const s of strips) {
        if (segDist(s.pts, w.x, w.z) < s.half + 2) expect.fail(`waystone ${id} sits on ${s.id}`);
      }
    }
    for (const [id, p] of Object.entries(ACT3_INTERIOR_PADS)) {
      for (const s of strips) {
        if (segDist(s.pts, p.x, p.z) < s.half + Math.min(p.w, p.d) / 2) expect.fail(`pad ${id} sits on ${s.id}`);
      }
    }
  });
});
