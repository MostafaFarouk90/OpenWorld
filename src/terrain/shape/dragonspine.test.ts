// Act 3 thread K1: the Dragonspine fitted on the real ground (plans/act3-K1.md section 2 and 3). The grades are true by
// construction (core's shaper); what can fail is the fit: pad heights, the summit, the height range, road lengths and
// banks, the chasm, the cliffs, and shipped ground that must not move.
import { describe, expect, it } from 'vitest';
import { heightAt, shapeBaseHeight, WORLD_SHAPER_OPTIONS, worldRoads } from '../heightfield';
import { buildShaper, type RoadDef, type ShapeBox } from '../shaping';
import { detailRelief } from './detailRelief';
import { ACT3_MIN_FLOOR, ACT3_PROTECTED_BOXES } from './act3';
import {
  DEEPGATE_TRACK,
  DEEPGATE_TRACK_POINTS,
  DRAGONSPINE_PLATEAUS,
  DRAGONSPINE_ROADS,
  DRAGONSPINE_SITES,
  DRAGONSPINE_TROUGHS,
  DRAGONSPINE_UPLIFTS,
  FROSTFANG_AERIE_PLATEAU,
  FROSTFANG_CHASM,
  FROSTFANG_KEEP_PLATEAU,
  FROSTFANG_WAYSTONE,
  HAWK_CLIFFS_FOOT_PLATEAU,
  HAWK_NEST_SHELF,
  RIME_PASS,
  RIME_PASS_POINTS,
  SKYHOLD_SPUR,
  SKYHOLD_SPUR_POINTS,
  SPINE_ROAD,
  SPINE_ROAD_EAST_POINTS,
  SPINE_ROAD_POINTS,
  WYRMS_HEARTH_PLATEAU,
  WYRMWATCH_HALL_PAD,
  WYRMWATCH_LODGE_PLATEAU,
} from './dragonspine';
import { WORLD_SHAPE } from './index';

/** The Dragonspine box (engine metres) and its 600 m blend ring (the world ends at z 17000). */
const RING: ShapeBox = { minX: 9400, maxX: 17600, minZ: 10400, maxZ: 17000 };
const WASTE: ShapeBox = { minX: 7000, maxX: 15000, minZ: 4500, maxZ: 11000 };
const inBox = (b: ShapeBox, x: number, z: number) => x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;
const inProtected = (x: number, z: number) => ACT3_PROTECTED_BOXES.some((b) => inBox(b, x, z));

/** Distance from (x, z) to a polyline. */
function lineGap(points: readonly { x: number; z: number }[], x: number, z: number): number {
  let best = Infinity;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(a.x + dx * t - x, a.z + dz * t - z));
  }
  return best;
}
const nearRoad = (x: number, z: number, m: number) => DRAGONSPINE_ROADS.some((r) => lineGap(r.points, x, z) <= m);

describe('the Dragonspine shape is registered in the world shape', () => {
  it('lists every uplift, the chasm, every plateau and the roads in order (Spine Road, Deepgate Track, Rime Pass, Skyhold spur, the Hawk Cliffs path and shelf)', () => {
    expect(WORLD_SHAPE.uplifts).toEqual(DRAGONSPINE_UPLIFTS);
    expect(WORLD_SHAPE.troughs).toEqual(expect.arrayContaining([...DRAGONSPINE_TROUGHS]));
    expect(WORLD_SHAPE.plateaus).toEqual(expect.arrayContaining([...DRAGONSPINE_PLATEAUS]));
    const order = ['spine-road', 'deepgate-track', 'rime-pass', 'skyhold-spur', 'hawk-cliffs-path', 'hawk-nest-shelf'];
    expect(DRAGONSPINE_ROADS.map((r) => r.id)).toEqual(order);
    const ids = WORLD_SHAPE.roads.map((r) => r.id);
    expect(ids.slice(-order.length)).toEqual(order);
  });

  it('keeps the uplifts few (they run for every terrain vertex) and the spines short', () => {
    expect(DRAGONSPINE_UPLIFTS.length).toBeLessThan(15);
    for (const u of DRAGONSPINE_UPLIFTS) expect(u.spine.length, u.id).toBeLessThanOrEqual(8);
  });

  it('every polyline export matches its road def', () => {
    const pairs: [RoadDef, readonly (readonly [number, number])[]][] = [
      [SPINE_ROAD, SPINE_ROAD_POINTS],
      [DEEPGATE_TRACK, DEEPGATE_TRACK_POINTS],
      [RIME_PASS, RIME_PASS_POINTS],
      [SKYHOLD_SPUR, SKYHOLD_SPUR_POINTS],
    ];
    for (const [road, pts] of pairs) expect(road.points).toEqual(pts.map(([x, z]) => ({ x, z })));
  });
});

describe('plateaus', () => {
  for (const p of DRAGONSPINE_PLATEAUS) {
    it(`${p.id} is flat at ${p.height} m across its box (40 m clear of a road arriving on its edge)`, () => {
      const b = p.box;
      expect(heightAt((b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2)).toBeCloseTo(p.height, 3);
      for (let x = b.minX; x <= b.maxX; x += (b.maxX - b.minX) / 8) {
        for (let z = b.minZ; z <= b.maxZ; z += (b.maxZ - b.minZ) / 8) {
          if (nearRoad(x, z, 40)) continue;
          expect(Math.abs(heightAt(x, z) - p.height), `(${x}, ${z})`).toBeLessThanOrEqual(0.5);
        }
      }
    });
  }

  it('DRAGONSPINE_SITES gives every plateau its centre and height', () => {
    const sites = Object.values(DRAGONSPINE_SITES);
    expect(sites).toHaveLength(DRAGONSPINE_PLATEAUS.length);
    for (const p of DRAGONSPINE_PLATEAUS) {
      expect(sites).toContainEqual({ x: (p.box.minX + p.box.maxX) / 2, z: (p.box.minZ + p.box.maxZ) / 2, height: p.height });
    }
  });

  it('the agreed heights: lodge about 120, shelter about 250, Anvil about 380, summit gate 560 to 580, Skyhold 560 to 590, Aerie 520 to 560', () => {
    const s = DRAGONSPINE_SITES;
    expect(Math.abs(s.wyrmwatchLodge.height - 120)).toBeLessThanOrEqual(10);
    expect(Math.abs(s.rimePassShelter.height - 250)).toBeLessThanOrEqual(15);
    expect(Math.abs(s.lastAnvil.height - 380)).toBeLessThanOrEqual(15);
    // M28's crag stands above the lodge, 430 to 520 m off the Rime Pass (K4's 1 km climb).
    expect(s.m28Crag.height).toBeGreaterThan(s.wyrmwatchLodge.height + 30);
    const off = Math.min(...RIME_PASS_POINTS.slice(1).map((b, i) => {
      const a = RIME_PASS_POINTS[i];
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((s.m28Crag.x - a[0]) * dx + (s.m28Crag.z - a[1]) * dz) / (dx * dx + dz * dz)));
      return Math.hypot(s.m28Crag.x - a[0] - dx * t, s.m28Crag.z - a[1] - dz * t);
    }));
    expect(off).toBeGreaterThan(430);
    expect(off).toBeLessThan(520);
    expect(s.summitGate.height).toBeGreaterThanOrEqual(560);
    expect(s.summitGate.height).toBeLessThanOrEqual(580);
    expect(s.skyholdTop.height).toBeGreaterThanOrEqual(560);
    expect(s.skyholdTop.height).toBeLessThanOrEqual(590);
    expect(s.frostfangAerie.height).toBeGreaterThanOrEqual(520);
    expect(s.frostfangAerie.height).toBeLessThanOrEqual(560);
  });

  it("the summit: the Wyrm's Hearth is a 300 x 250 m plateau at 600 m, and crown crags stand above it to the north", () => {
    const b = WYRMS_HEARTH_PLATEAU.box;
    expect(b.maxX - b.minX).toBeGreaterThanOrEqual(300);
    expect(b.maxZ - b.minZ).toBeGreaterThanOrEqual(250);
    expect(heightAt(13600, 15600)).toBe(600);
    let crown = -Infinity;
    for (let x = 12300; x <= 14500; x += 25) for (let z = 15800; z <= 16700; z += 25) crown = Math.max(crown, heightAt(x, z));
    expect(crown).toBeGreaterThan(600);
    expect(crown).toBeLessThanOrEqual(630);
  });

  it('the Frostfang keep pad (40 x 50 m) varies by at most 1 m, and the waystone stands on the Aerie shelf', () => {
    const b = FROSTFANG_KEEP_PLATEAU.box;
    expect(b.maxX - b.minX).toBe(40);
    expect(b.maxZ - b.minZ).toBe(50);
    let lo = Infinity;
    let hi = -Infinity;
    for (let x = b.minX; x <= b.maxX; x += 2) {
      for (let z = b.minZ; z <= b.maxZ; z += 2) {
        lo = Math.min(lo, heightAt(x, z));
        hi = Math.max(hi, heightAt(x, z));
      }
    }
    expect(hi - lo).toBeLessThanOrEqual(1);
    expect(inBox(FROSTFANG_AERIE_PLATEAU.box, FROSTFANG_WAYSTONE.x, FROSTFANG_WAYSTONE.z)).toBe(true);
    expect(heightAt(FROSTFANG_WAYSTONE.x, FROSTFANG_WAYSTONE.z)).toBeCloseTo(FROSTFANG_AERIE_PLATEAU.height, 3);
  });

  it('the Wyrmwatch hall pad (30 x 20 m) lies inside the lodge plateau', () => {
    expect(WYRMWATCH_HALL_PAD.maxX - WYRMWATCH_HALL_PAD.minX).toBe(30);
    expect(WYRMWATCH_HALL_PAD.maxZ - WYRMWATCH_HALL_PAD.minZ).toBe(20);
    const l = WYRMWATCH_LODGE_PLATEAU.box;
    expect(WYRMWATCH_HALL_PAD.minX >= l.minX && WYRMWATCH_HALL_PAD.maxX <= l.maxX && WYRMWATCH_HALL_PAD.minZ >= l.minZ && WYRMWATCH_HALL_PAD.maxZ <= l.maxZ).toBe(true);
  });

  it('a 40 to 60 m cliff face rises directly north of the Hawk Cliffs foot', () => {
    const p = HAWK_CLIFFS_FOOT_PLATEAU;
    const x = (p.box.minX + p.box.maxX) / 2;
    // The face: at least 35 m of rise inside 25 m, starting within 70 m of the pad's north edge.
    let face = 0;
    for (let z = p.box.maxZ; z <= p.box.maxZ + 70; z += 5) face = Math.max(face, heightAt(x, z + 25) - heightAt(x, z));
    expect(face).toBeGreaterThanOrEqual(35);
    const top = heightAt(x, p.box.maxZ + 70) - p.height;
    expect(top).toBeGreaterThanOrEqual(40);
    expect(top).toBeLessThanOrEqual(65);
  });
});

describe('the height range over the Dragonspine and its ring (50 m grid)', () => {
  it('no ground above 640 m', () => {
    let max = -Infinity;
    for (let x = RING.minX; x <= RING.maxX; x += 50) for (let z = RING.minZ; z <= RING.maxZ; z += 50) max = Math.max(max, heightAt(x, z));
    expect(max).toBeLessThanOrEqual(640);
    expect(max).toBeGreaterThan(600);
  });

  it(`no ground at or under ${ACT3_MIN_FLOOR} m outside the shipped boxes (the Waste and Oldsmoke keep their own ground)`, () => {
    let min = Infinity;
    let at = '';
    for (let x = RING.minX; x <= RING.maxX; x += 50) {
      for (let z = RING.minZ; z <= RING.maxZ; z += 50) {
        if (inProtected(x, z)) continue;
        const h = heightAt(x, z);
        if (h < min) {
          min = h;
          at = `(${x}, ${z})`;
        }
      }
    }
    expect(min, at).toBeGreaterThan(ACT3_MIN_FLOOR);
  });
});

describe('the Frostfang chasm', () => {
  it('runs between x 14500 and 15000, its floor at x 14750 more than 150 m under both rims beside the Aerie shelf', () => {
    for (const p of FROSTFANG_CHASM.points) {
      expect(p.x).toBeGreaterThanOrEqual(14500);
      expect(p.x).toBeLessThanOrEqual(15000);
    }
    const rim = (x0: number, x1: number, z: number) => {
      let m = -Infinity;
      for (let x = x0; x <= x1; x += 10) m = Math.max(m, heightAt(x, z));
      return m;
    };
    for (let z = 15800; z <= 16200; z += 50) {
      const floor = heightAt(14750, z);
      expect(floor, `floor at z ${z}`).toBeLessThan(320);
      expect(rim(14250, 14550, z) - floor, `west rim at z ${z}`).toBeGreaterThan(150);
      expect(rim(14950, 15250, z) - floor, `east rim at z ${z}`).toBeGreaterThan(150);
    }
  });

  it('no walkable slope (45 degrees, the controller limit, on a 10 m grid) leads from the summit onto the Aerie shelf: it is glide-only', () => {
    const area = { minX: 12000, maxX: 17600, minZ: 13000, maxZ: 17000 };
    const step = 10;
    const nx = (area.maxX - area.minX) / step + 1;
    const nz = (area.maxZ - area.minZ) / step + 1;
    const h = new Float64Array(nx * nz);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) h[j * nx + i] = heightAt(area.minX + i * step, area.minZ + j * step);
    const cell = (x: number, z: number) => Math.round((z - area.minZ) / step) * nx + Math.round((x - area.minX) / step);
    const seen = new Uint8Array(nx * nz);
    const queue = [cell(13600, 15600)];
    seen[queue[0]] = 1;
    while (queue.length) {
      const k = queue.pop()!;
      const i = k % nx;
      const j = (k - i) / nx;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ii = i + di;
        const jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
        const kk = jj * nx + ii;
        if (!seen[kk] && Math.abs(h[kk] - h[k]) <= step) {
          seen[kk] = 1;
          queue.push(kk);
        }
      }
    }
    expect(seen[cell(13600, 13500)], 'the walk reaches the lower slopes').toBe(1);
    expect(seen[cell(FROSTFANG_WAYSTONE.x, FROSTFANG_WAYSTONE.z)], 'the Aerie').toBe(0);
  });
});

describe('roads', () => {
  // The Spine Road: plan 3.3's 7.2 km from the Greyfen's edge, plus about 1 km from Mireweather Hut to the edge.
  const TARGET: Record<string, number> = { 'spine-road': 8200, 'deepgate-track': 8600, 'rime-pass': 6000, 'skyhold-spur': 1500, 'hawk-cliffs-path': 270, 'hawk-nest-shelf': 25 };

  for (const r of DRAGONSPINE_ROADS) {
    it(`${r.id} never climbs more than ${r.maxGrade} over a 5 m step`, () => {
      const len = worldRoads.length(r.id);
      for (let s = 0; s + 5 <= len; s += 5) {
        expect(Math.abs(worldRoads.profile(r.id, s + 5) - worldRoads.profile(r.id, s)) / 5).toBeLessThanOrEqual(r.maxGrade + 1e-9);
      }
    });

    it(`${r.id} is within 10% of ${TARGET[r.id]} m`, () => {
      expect(Math.abs(worldRoads.length(r.id) - TARGET[r.id]) / TARGET[r.id]).toBeLessThanOrEqual(0.1);
    });

    it(`${r.id}: the shaped ground on the centreline is the profile`, () => {
      const len = worldRoads.length(r.id);
      let arc = 0;
      for (let i = 1; i < r.points.length; i++) {
        const a = r.points[i - 1];
        const b = r.points[i];
        const sl = Math.hypot(b.x - a.x, b.z - a.z);
        // Bends mix two arc positions; check the straights.
        for (let t = 40; t < sl - 40; t += 50) {
          const x = a.x + ((b.x - a.x) * t) / sl;
          const z = a.z + ((b.z - a.z) * t) / sl;
          expect(Math.abs(heightAt(x, z) - worldRoads.profile(r.id, Math.min(arc + t, len))), `${r.id} s ${arc + t}`).toBeLessThan(0.5);
        }
        arc += sl;
      }
    });
  }

  it('the Spine Road starts on Mireweather Hut, crosses the Greyfen east edge at (6500, 12800), ends on the lodge plateau, and stays 80 m clear of the Waste', () => {
    expect(SPINE_ROAD.points).toContainEqual({ x: 6500, z: 12800 });
    expect(SPINE_ROAD_POINTS.slice(-SPINE_ROAD_EAST_POINTS.length)).toEqual(SPINE_ROAD_EAST_POINTS);
    expect(SPINE_ROAD.points[0]).toEqual({ x: 5640, z: 12320 });
    const end = SPINE_ROAD.points[SPINE_ROAD.points.length - 1];
    expect(inBox(WYRMWATCH_LODGE_PLATEAU.box, end.x, end.z)).toBe(true);
    const pts = SPINE_ROAD.points;
    for (let i = 1; i < pts.length; i++) {
      for (let t = 0; t <= 1; t += 0.01) {
        const x = pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t;
        const z = pts[i - 1].z + (pts[i].z - pts[i - 1].z) * t;
        const dx = Math.max(WASTE.minX - x, 0, x - WASTE.maxX);
        const dz = Math.max(WASTE.minZ - z, 0, z - WASTE.maxZ);
        expect(Math.hypot(dx, dz)).toBeGreaterThanOrEqual(80);
      }
    }
  });

  it("the Deepgate Track leaves Deepgate's north gate (20660, 8250) due north, clear of the town for 300 m, crosses the seam inside the fog face and ends on the lodge", () => {
    const pts = DEEPGATE_TRACK.points;
    expect(pts[0]).toEqual({ x: 20660, z: 8250 });
    expect(pts[1].x).toBe(20660);
    expect(pts[1].z - pts[0].z).toBeGreaterThanOrEqual(60);
    let arc = 0;
    for (let i = 1; i < pts.length && arc < 300; i++) {
      expect(pts[i].z).toBeGreaterThan(8250);
      arc += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    }
    // Where it crosses x 17000, inside the shipped fog.dragonspine face (z 11000 to 12000).
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      if ((a.x - 17000) * (b.x - 17000) > 0) continue;
      const z = a.z + ((b.z - a.z) * (17000 - a.x)) / (b.x - a.x || 1);
      expect(z).toBeGreaterThan(11000);
      expect(z).toBeLessThan(12000);
    }
    const end = pts[pts.length - 1];
    expect(inBox(WYRMWATCH_LODGE_PLATEAU.box, end.x, end.z)).toBe(true);
    expect(worldRoads.profile('deepgate-track', 0)).toBeCloseTo(6, 3);
  });

  it("the Rime Pass climbs from the lodge to the Wyrm's Hearth through the shelter, the Anvil and the summit gate; the spur ends on Skyhold", () => {
    const at = (r: RoadDef, s: number) => worldRoads.profile(r.id, s);
    expect(at(RIME_PASS, 0)).toBeCloseTo(DRAGONSPINE_SITES.wyrmwatchLodge.height, 3);
    expect(at(RIME_PASS, worldRoads.length('rime-pass'))).toBeCloseTo(DRAGONSPINE_SITES.wyrmsHearth.height, 3);
    for (const site of [DRAGONSPINE_SITES.rimePassShelter, DRAGONSPINE_SITES.lastAnvil, DRAGONSPINE_SITES.summitGate]) {
      expect(lineGap(RIME_PASS.points, site.x, site.z), JSON.stringify(site)).toBeLessThanOrEqual(80);
    }
    const spurEnd = SKYHOLD_SPUR.points[SKYHOLD_SPUR.points.length - 1];
    expect(inBox(DRAGONSPINE_PLATEAUS.find((p) => p.id === 'skyhold-top')!.box, spurEnd.x, spurEnd.z)).toBe(true);
    expect(lineGap(RIME_PASS.points, SKYHOLD_SPUR.points[0].x, SKYHOLD_SPUR.points[0].z)).toBeLessThanOrEqual(40);
  });

  for (const r of [RIME_PASS, SKYHOLD_SPUR]) {
    it(`${r.id}: the rock-cut sides are at most 45 degrees within 6 m of the road edge`, () => {
      let worst = 0;
      for (let i = 1; i < r.points.length; i++) {
        const a = r.points[i - 1];
        const b = r.points[i];
        const sl = Math.hypot(b.x - a.x, b.z - a.z);
        const dx = (b.x - a.x) / sl;
        const dz = (b.z - a.z) / sl;
        for (let t = 30; t < sl - 30; t += 10) {
          const x = a.x + dx * t;
          const z = a.z + dz * t;
          for (const side of [1, -1]) {
            for (let o = r.halfWidth; o < r.halfWidth + 6; o++) {
              const h0 = heightAt(x - dz * side * o, z + dx * side * o);
              const h1 = heightAt(x - dz * side * (o + 1), z + dx * side * (o + 1));
              worst = Math.max(worst, Math.abs(h1 - h0));
            }
          }
        }
      }
      expect(worst).toBeLessThanOrEqual(1);
    });
  }
});

describe('shipped ground', () => {
  // The world without any Dragonspine feature: what the shipped boxes must still match.
  const uplifts = new Set(DRAGONSPINE_UPLIFTS);
  const troughs = new Set(DRAGONSPINE_TROUGHS);
  const plateaus = new Set(DRAGONSPINE_PLATEAUS);
  const roads = new Set(DRAGONSPINE_ROADS);
  const without = buildShaper(
    {
      ...WORLD_SHAPE,
      uplifts: (WORLD_SHAPE.uplifts ?? []).filter((u) => !uplifts.has(u)),
      troughs: (WORLD_SHAPE.troughs ?? []).filter((t) => !troughs.has(t)),
      plateaus: WORLD_SHAPE.plateaus.filter((p) => !plateaus.has(p)),
      roads: WORLD_SHAPE.roads.filter((r) => !roads.has(r)),
    },
    shapeBaseHeight,
    WORLD_SHAPER_OPTIONS,
  );

  it('every protected box matches on a 50 m grid, except Oldsmoke under the Deepgate Track (its own cut and fill)', () => {
    for (const b of ACT3_PROTECTED_BOXES) {
      for (let x = b.minX; x <= b.maxX; x += 50) {
        for (let z = b.minZ; z <= b.maxZ; z += 50) {
          if (lineGap(DEEPGATE_TRACK.points, x, z) <= DEEPGATE_TRACK.halfWidth + (DEEPGATE_TRACK.maxBlend ?? 300)) continue;
          expect(heightAt(x, z), `(${x}, ${z})`).toBe(without.heightAt(x, z) + detailRelief(x, z));
        }
      }
    }
  });
});

describe('the Hawk Cliffs footpath and nest shelf (K4, R18)', () => {
  it('climbs from the foot plateau to the shelf at 25% or less, about 270 m of path', () => {
    const len = worldRoads.length('hawk-cliffs-path');
    expect(len).toBeGreaterThan(240);
    expect(len).toBeLessThan(320);
    let worst = 0;
    for (let s = 0; s + 2 <= len; s += 2) worst = Math.max(worst, Math.abs(worldRoads.profile('hawk-cliffs-path', s + 2) - worldRoads.profile('hawk-cliffs-path', s)) / 2);
    expect(worst).toBeLessThanOrEqual(0.25 + 1e-6);
    expect(worldRoads.profile('hawk-cliffs-path', 0)).toBeCloseTo(DRAGONSPINE_SITES.hawkCliffsFoot.height, 0);
  });

  it('the shelf is a level 25 x 15 m bench 40 to 60 m over the foot', () => {
    const foot = DRAGONSPINE_SITES.hawkCliffsFoot.height;
    let lo = Infinity;
    let hi = -Infinity;
    for (let x = HAWK_NEST_SHELF.x - HAWK_NEST_SHELF.w / 2 + 1; x <= HAWK_NEST_SHELF.x + HAWK_NEST_SHELF.w / 2 - 1; x += 1) {
      for (let z = HAWK_NEST_SHELF.z - HAWK_NEST_SHELF.d / 2 + 1; z <= HAWK_NEST_SHELF.z + HAWK_NEST_SHELF.d / 2 - 1; z += 1) {
        const h = heightAt(x, z);
        lo = Math.min(lo, h);
        hi = Math.max(hi, h);
      }
    }
    expect(hi - lo).toBeLessThan(2.5);
    expect(lo - foot).toBeGreaterThan(40);
    expect(hi - foot).toBeLessThan(60);
  });
});
