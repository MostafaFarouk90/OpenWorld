// Act 4 thread L1: the Waste's terrain fitted on the real ground (plans/act4-L1.md section 3). Grades are true by
// construction (core's shaper); what can fail is the fit, the guards, the floor and the dune mask.
import { describe, expect, it } from 'vitest';
import { engineBox } from '../../region/regions';
import { heightAt, worldRoads } from '../heightfield';
import type { ShapeBox } from '../shaping';
import { ACT3_MIN_FLOOR } from './act3';
import { DRAGONSPINE_TROUGHS, DRAGONSPINE_UPLIFTS } from './dragonspine';
import { GREYFEN_FLATS, GREYFEN_TROUGHS } from './greyfen';
import { WORLD_SHAPE } from './index';
import {
  ASH_ROAD,
  ASHGATE,
  CALDERA_BOX,
  DUNE_AMPLITUDE,
  DUNE_KEEP_CLEAR,
  duneOpenness,
  duneProfile,
  GLASSLANDS,
  GLASSLANDS_PLAIN,
  NE_GATE,
  ROPE_LINE_IDS,
  ROPE_MAX_GRADE,
  ROPE_POINTS,
  WASTE_BOX,
  WASTE_FLATS,
  WASTE_PLATEAUS,
  WASTE_ROADS,
  WASTE_UPLIFTS,
  wasteRelief,
} from './waste';

const boxOf = (id: Parameters<typeof engineBox>[0]): ShapeBox => {
  const b = engineBox(id);
  return { minX: b.x0, maxX: b.x1, minZ: b.z0, maxZ: b.z1 };
};
const overlaps = (a: ShapeBox, b: ShapeBox) => a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
const grow = (b: ShapeBox, m: number): ShapeBox => ({ minX: b.minX - m, maxX: b.maxX + m, minZ: b.minZ - m, maxZ: b.maxZ + m });
const spineReach = (spine: readonly { x: number; z: number }[], r: number): ShapeBox => ({
  minX: Math.min(...spine.map((p) => p.x)) - r,
  maxX: Math.max(...spine.map((p) => p.x)) + r,
  minZ: Math.min(...spine.map((p) => p.z)) - r,
  maxZ: Math.max(...spine.map((p) => p.z)) + r,
});
const roadNear = (x: number, z: number) =>
  WASTE_ROADS.some((r) =>
    r.points.some((p, i) => {
      if (i === 0) return false;
      const a = r.points[i - 1];
      const dx = p.x - a.x;
      const dz = p.z - a.z;
      const t = Math.min(Math.max(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz), 0), 1);
      return Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t)) < r.halfWidth + 70;
    }),
  );
const inCaldera = (x: number, z: number) => x >= CALDERA_BOX.x0 && x < CALDERA_BOX.x1 && z >= CALDERA_BOX.z0 && z < CALDERA_BOX.z1;

describe('the Waste in the world shape', () => {
  it('lists its flats, the rim, its plateaus and its roads, the roads after every shipped road', () => {
    expect(WORLD_SHAPE.flats).toEqual(expect.arrayContaining([...WASTE_FLATS]));
    expect(WORLD_SHAPE.uplifts).toEqual(expect.arrayContaining([...WASTE_UPLIFTS]));
    expect(WORLD_SHAPE.plateaus).toEqual(expect.arrayContaining([...WASTE_PLATEAUS]));
    expect(WORLD_SHAPE.roads.slice(-WASTE_ROADS.length)).toEqual(WASTE_ROADS);
  });

  it('no Act 3 flat, uplift or trough reaches the Waste (the guarantee its old guard gave)', () => {
    const waste = boxOf('ashen-waste');
    for (const f of GREYFEN_FLATS) expect(overlaps(grow(f.box, f.blend), waste), f.id).toBe(false);
    for (const u of DRAGONSPINE_UPLIFTS) expect(overlaps(spineReach(u.spine, u.radius), waste), u.id).toBe(false);
    for (const t of [...GREYFEN_TROUGHS, ...DRAGONSPINE_TROUGHS]) expect(overlaps(spineReach(t.points, t.halfWidth + t.blend), waste), t.id).toBe(false);
  });

  it('no Act 4 flat or uplift reaches the Greyfen, the Dragonspine, Harrowmark or Oldsmoke', () => {
    const reaches = [...WASTE_FLATS.map((f) => ({ id: f.id, r: grow(f.box, f.blend) })), ...WASTE_UPLIFTS.map((u) => ({ id: u.id, r: spineReach(u.spine, u.radius) }))];
    for (const id of ['greyfen', 'dragonspine', 'harrowmark', 'oldsmoke', 'cinderreach', 'brightwater'] as const) {
      for (const { id: fid, r } of reaches) expect(overlaps(r, boxOf(id)), `${fid} into ${id}`).toBe(false);
    }
  });
});

describe('the Waste ground (25 m grid)', () => {
  it('stays inside the height range and over the kill plane in the open Waste', () => {
    let min = Infinity;
    let max = -Infinity;
    for (let x = WASTE_BOX.x0; x < WASTE_BOX.x1; x += 25) {
      for (let z = WASTE_BOX.z0; z < 10900; z += 25) {
        if (inCaldera(x, z)) continue;
        const h = heightAt(x, z);
        min = Math.min(min, h);
        max = Math.max(max, h);
      }
    }
    expect(min).toBeGreaterThan(ACT3_MIN_FLOOR);
    expect(max).toBeLessThan(640);
  });

  it('rises toward the rim: Rimfoot stands well above Ashgate, the crest inside the hole', () => {
    expect(heightAt(11000, 6200) - heightAt(ASHGATE[0], ASHGATE[1])).toBeGreaterThan(100);
    expect(heightAt(11000, 6650)).toBeGreaterThan(heightAt(11000, 6200) + 80);
  });

  it('keeps the glass-sand plain nearly flat round the Singing Slag', () => {
    const b = GLASSLANDS_PLAIN.box;
    let lo = Infinity;
    let hi = -Infinity;
    for (let x = b.minX + 100; x <= b.maxX - 100; x += 25) {
      for (let z = b.minZ + 100; z <= b.maxZ - 100; z += 25) {
        // The rope-lines grade into the plain in their own cuts.
        if (roadNear(x, z)) continue;
        const h = heightAt(x, z);
        lo = Math.min(lo, h);
        hi = Math.max(hi, h);
      }
    }
    expect(hi - lo).toBeLessThan(12);
    expect(Math.abs(heightAt(GLASSLANDS[0], GLASSLANDS[1]) - GLASSLANDS_PLAIN.level)).toBeLessThan(8);
  });
});

describe('the roads and rope-lines', () => {
  it('the Ash Road leaves the north-east gate at the city plateau and stays under a 10% grade', () => {
    expect(ASH_ROAD.points[0]).toEqual({ x: NE_GATE[0], z: NE_GATE[1] });
    expect(worldRoads.profile('ash-road', 0)).toBeCloseTo(20, 0);
    const len = worldRoads.length('ash-road');
    expect(len).toBeGreaterThan(2000);
    expect(len).toBeLessThan(2500);
  });

  it('every road and rope-line keeps its grade (5 m steps)', () => {
    for (const r of WASTE_ROADS) {
      const len = worldRoads.length(r.id);
      let worst = 0;
      for (let s = 0; s + 5 <= len; s += 5) worst = Math.max(worst, Math.abs(worldRoads.profile(r.id, s + 5) - worldRoads.profile(r.id, s)) / 5);
      expect(worst, r.id).toBeLessThanOrEqual(r.maxGrade + 1e-6);
    }
  });

  it('the six rope-lines run about 14 km, at most 14% steep, and never into the Caldera hole', () => {
    let total = 0;
    for (const id of ROPE_LINE_IDS) {
      const pts = ROPE_POINTS[id];
      for (let i = 1; i < pts.length; i++) {
        total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        for (let t = 0; t <= 1; t += 0.05) {
          const x = pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t;
          const z = pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t;
          expect(inCaldera(x, z), `${id} at (${x}, ${z})`).toBe(false);
        }
      }
    }
    expect(ROPE_MAX_GRADE).toBe(0.14);
    expect(total).toBeGreaterThan(13000);
    expect(total).toBeLessThan(15000);
  });

  it('every plateau is flat at its height under its own box (a road may grade across it)', () => {
    for (const p of WASTE_PLATEAUS) {
      for (let x = p.box.minX; x <= p.box.maxX; x += 10) {
        for (let z = p.box.minZ; z <= p.box.maxZ; z += 10) {
          if (roadNear(x, z)) continue;
          expect(heightAt(x, z), `${p.id} at (${x}, ${z})`).toBeCloseTo(p.height, 3);
        }
      }
    }
  });
});

describe('the dunes', () => {
  it('are 0 outside the Waste and inside the Caldera hole', () => {
    expect(wasteRelief(6900, 6000)).toBe(0);
    expect(wasteRelief(10000, 4400)).toBe(0);
    expect(wasteRelief(11000, 8000)).toBe(0);
    expect(wasteRelief(12000, 11050)).toBe(0);
  });

  it('are 0 on every lane and site, and stay inside the amplitude elsewhere', () => {
    for (const r of WASTE_ROADS) {
      for (let i = 1; i < r.points.length; i++) {
        const a = r.points[i - 1];
        const b = r.points[i];
        for (let t = 0; t <= 1; t += 0.1) {
          const x = a.x + (b.x - a.x) * t;
          const z = a.z + (b.z - a.z) * t;
          expect(wasteRelief(x, z), `${r.id}`).toBe(0);
          expect(duneOpenness(x + r.halfWidth + DUNE_KEEP_CLEAR - 1, z)).toBeLessThanOrEqual(1);
        }
      }
    }
    for (const p of WASTE_PLATEAUS) expect(wasteRelief((p.box.minX + p.box.maxX) / 2, (p.box.minZ + p.box.maxZ) / 2), p.id).toBe(0);
    let peak = 0;
    for (let x = 7500; x < 14500; x += 37) for (let z = 5000; z < 10500; z += 41) peak = Math.max(peak, Math.abs(wasteRelief(x, z)));
    expect(peak).toBeGreaterThan(DUNE_AMPLITUDE * 0.5);
    expect(peak).toBeLessThanOrEqual(DUNE_AMPLITUDE + 1e-9);
  });

  it('have a long windward rise and a short lee fall, never steeper than 0.6 on the ground', () => {
    expect(duneProfile(0)).toBeCloseTo(-1, 6);
    expect(duneProfile(0.75)).toBeCloseTo(1, 6);
    expect(duneProfile(1)).toBeCloseTo(-1, 6);
    let worst = 0;
    for (let x = 7600; x < 9200; x += 2) {
      const z = 9000;
      worst = Math.max(worst, Math.abs(wasteRelief(x + 2, z) - wasteRelief(x, z)) / 2);
    }
    expect(worst).toBeLessThan(0.6);
  });

  it('are deterministic (the same sample twice)', () => {
    expect(wasteRelief(8123.4, 9321.7)).toBe(wasteRelief(8123.4, 9321.7));
  });
});
