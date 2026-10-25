// Act 2 thread A1: the Cinder Road, its branches, the Oldsmoke pass and the Act 2 plateaus, fitted on the real ground.
// The grades are true by construction (core's shaper); what can fail is the fit: cut and fill, banks, junctions,
// plateau slopes, where things sit, and Act 1 ground that must not move.
import { describe, expect, it } from 'vitest';
import { WORLD_BOUNDS } from '../../config/constants';
import { engineBox, type RegionId } from '../../region/regions';
import { HEIGHT_RANGE, heightAt, shapeBaseHeight, worldRoads } from '../heightfield';
import { buildShaper, type PlateauDef, type RoadDef, type ShapeBox } from '../shaping';
import {
  CINDER_ROAD,
  CINDER_ROAD_POINTS,
  CINDERFORD_PLATEAU,
  CINDERREACH_FOOTHILLS,
  CINDERREACH_PLATEAUS,
  CINDERREACH_ROADS,
  FELLWALKER_PASTURE,
  FELLWALKER_TRACK,
  HUSHED_ANVIL_PATH,
  HUSHED_ANVIL_PLATEAU,
  SCORCHHOLD_PLATEAU,
  SCORCHHOLD_ROAD,
  STONEFOLD_DEN_SHELF,
  STONEFOLD_PLATEAU,
  STONEFOLD_ROAD,
} from './cinderRoad';
import { DEEPGATE_PLATEAU, OLDSMOKE_PASS_ROAD, OLDSMOKE_PLATEAUS, OLDSMOKE_ROADS, OLDSMOKE_STACKS } from './oldsmokePass';
import { detailRelief } from './detailRelief';
import { WORLD_SHAPE } from './index';
import { FEN_ROAD } from './greyfen';
import { roadLength, roadPoint } from './roadPoint';
import { DEAD_ROAD, DEAD_ROAD_PLATEAUS } from './deadRoad';
import { HARROWMARK_PLATEAU, HARROWMARK_RIDGES } from './harrowmark';

const ROADS: readonly RoadDef[] = [...CINDERREACH_ROADS, ...OLDSMOKE_ROADS];
const PLATEAUS: readonly PlateauDef[] = [...CINDERREACH_PLATEAUS, ...OLDSMOKE_PLATEAUS];
/** The ground without the Act 2 roads (suppressions and every plateau): what the roads cut into or fill over. */
const unroaded = buildShaper({ ...WORLD_SHAPE, roads: [DEAD_ROAD] }, shapeBaseHeight, { bounds: WORLD_BOUNDS, heightRange: HEIGHT_RANGE });

interface Sample {
  x: number;
  z: number;
  s: number;
  nx: number;
  nz: number;
}

function samples(road: RoadDef, step = 20): Sample[] {
  const out: Sample[] = [];
  let arc = 0;
  for (let i = 0; i < road.points.length - 1; i++) {
    const a = road.points[i];
    const b = road.points[i + 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const dx = (b.x - a.x) / len;
    const dz = (b.z - a.z) / len;
    for (let t = 0; t < len; t += step) out.push({ x: a.x + dx * t, z: a.z + dz * t, s: arc + t, nx: -dz, nz: dx });
    arc += len;
  }
  return out;
}

const inBox = (b: ShapeBox, x: number, z: number) => x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;
const inRegion = (id: RegionId, x: number, z: number) => {
  const b = engineBox(id);
  return x >= b.x0 && x < b.x1 && z >= b.z0 && z < b.z1;
};

/** Whether (x, z) is within `m` metres of any Act 2 road centreline. */
function nearRoad(x: number, z: number, m: number): boolean {
  for (const r of ROADS) {
    for (let i = 1; i < r.points.length; i++) {
      const a = r.points[i - 1];
      const b = r.points[i];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
      if (Math.hypot(a.x + dx * t - x, a.z + dz * t - z) <= m) return true;
    }
  }
  return false;
}

/** Measured worst cuts on the shipped polylines, plus a little slack: a later terrain change that breaks the fit fails here. */
const MAX_CUT: Record<string, number> = {
  'cinder-road': 30,
  'stonefold-road': 14,
  'fellwalker-track': 10,
  'hushed-anvil-path': 28,
  'scorchhold-road': 14,
  'oldsmoke-pass': 34,
};
/** The shaper's banks peak at 1.5 x maxSideSlope (0.9); measured worst 0.98 where a branch's bank meets its trunk's. */
const MAX_BANK_SLOPE = 1;

describe('the Act 2 shape is registered in the world shape', () => {
  it('lists the Cinder Road before its branches and after the Dead Road, and every plateau and the foothills', () => {
    const ids = WORLD_SHAPE.roads.map((r) => r.id);
    expect(ids[0]).toBe('dead-road');
    expect(ids.indexOf('cinder-road')).toBe(1);
    for (const r of ROADS) expect(ids).toContain(r.id);
    for (const b of [STONEFOLD_ROAD, FELLWALKER_TRACK, HUSHED_ANVIL_PATH, SCORCHHOLD_ROAD]) expect(ids.indexOf(b.id)).toBeGreaterThan(1);
    for (const p of PLATEAUS) expect(WORLD_SHAPE.plateaus).toContain(p);
    expect(WORLD_SHAPE.suppressions).toContain(CINDERREACH_FOOTHILLS);
  });

  it('every polyline export matches its road def', () => {
    expect(CINDER_ROAD.points.map((p) => [p.x, p.z])).toEqual(CINDER_ROAD_POINTS.map((p) => [...p]));
  });
});

describe('road ends and lengths', () => {
  it('the Cinder Road leaves just outside the River Gate and ends inside Cinderford', () => {
    const first = CINDER_ROAD.points[0];
    // River Gate at bearing 77.14 from (8500, 2000), radius 750: (9231.2, 2166.9). The road starts 14 m out.
    expect(Math.hypot(first.x - 9231.2, first.z - 2166.9)).toBeLessThan(20);
    const last = CINDER_ROAD.points[CINDER_ROAD.points.length - 1];
    expect(inBox(CINDERFORD_PLATEAU.box, last.x, last.z)).toBe(true);
    expect(heightAt(last.x, last.z)).toBeCloseTo(CINDERFORD_PLATEAU.height, 3);
  });

  it('the Cinder Road is about 13 to 14.5 km (design 4.2: a 14.2 km path) and the pass road 5 to 7 km', () => {
    expect(worldRoads.length('cinder-road')).toBeGreaterThan(13000);
    expect(worldRoads.length('cinder-road')).toBeLessThan(14500);
    expect(worldRoads.length('oldsmoke-pass')).toBeGreaterThan(5000);
    expect(worldRoads.length('oldsmoke-pass')).toBeLessThan(7000);
  });

  it('each branch starts on the Cinder Road centreline and ends at its place', () => {
    const onTrunk = (x: number, z: number) => {
      let best = Infinity;
      for (let i = 1; i < CINDER_ROAD_POINTS.length; i++) {
        const [ax, az] = CINDER_ROAD_POINTS[i - 1];
        const [bx, bz] = CINDER_ROAD_POINTS[i];
        const dx = bx - ax;
        const dz = bz - az;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
        best = Math.min(best, Math.hypot(ax + dx * t - x, az + dz * t - z));
      }
      return best;
    };
    for (const b of [STONEFOLD_ROAD, FELLWALKER_TRACK, HUSHED_ANVIL_PATH, SCORCHHOLD_ROAD]) expect(onTrunk(b.points[0].x, b.points[0].z), b.id).toBeLessThan(0.5);
    const end = (r: RoadDef) => r.points[r.points.length - 1];
    const near = (r: RoadDef, box: ShapeBox, m: number) => {
      const e = end(r);
      expect(inBox({ minX: box.minX - m, maxX: box.maxX + m, minZ: box.minZ - m, maxZ: box.maxZ + m }, e.x, e.z), r.id).toBe(true);
    };
    near(STONEFOLD_ROAD, STONEFOLD_PLATEAU.box, 0);
    near(FELLWALKER_TRACK, FELLWALKER_PASTURE.box, 0);
    near(HUSHED_ANVIL_PATH, HUSHED_ANVIL_PLATEAU.box, 0);
    near(SCORCHHOLD_ROAD, SCORCHHOLD_PLATEAU.box, 30);
    const p0 = OLDSMOKE_PASS_ROAD.points[0];
    expect(inBox(CINDERFORD_PLATEAU.box, p0.x, p0.z)).toBe(true);
    near(OLDSMOKE_PASS_ROAD, DEEPGATE_PLATEAU.box, 0);
  });

  it('roads stay inside the world and the main roads pass through the null land into their regions', () => {
    for (const r of ROADS) for (const p of r.points) expect(inBox({ minX: WORLD_BOUNDS.minX, maxX: WORLD_BOUNDS.maxX, minZ: WORLD_BOUNDS.minZ, maxZ: WORLD_BOUNDS.maxZ }, p.x, p.z)).toBe(true);
    const cr = samples(CINDER_ROAD, 50);
    expect(inRegion('harrowmark', cr[0].x, cr[0].z)).toBe(true);
    expect(cr.some((p) => !inRegion('harrowmark', p.x, p.z) && !inRegion('cinderreach', p.x, p.z))).toBe(true);
    expect(inRegion('cinderreach', cr[cr.length - 1].x, cr[cr.length - 1].z)).toBe(true);
    // The Ashen Waste is reserved: the road keeps at least 1 km south of its box.
    for (const p of cr) expect(inRegion('ashen-waste', p.x, p.z + 1000)).toBe(false);
    const pass = samples(OLDSMOKE_PASS_ROAD, 50);
    expect(inRegion('cinderreach', pass[0].x, pass[0].z)).toBe(true);
    const e = OLDSMOKE_PASS_ROAD.points[OLDSMOKE_PASS_ROAD.points.length - 1];
    expect(inRegion('oldsmoke', e.x, e.z)).toBe(true);
    for (const b of [STONEFOLD_ROAD, FELLWALKER_TRACK, HUSHED_ANVIL_PATH, SCORCHHOLD_ROAD]) {
      for (const p of samples(b, 10)) expect(inRegion('cinderreach', p.x, p.z), b.id).toBe(true);
    }
  });
});

describe('the road fit', () => {
  for (const road of ROADS) {
    describe(road.id, () => {
      const along = samples(road);

      it(`the centreline profile never climbs more than ${road.maxGrade} over a 5 m step`, () => {
        const len = worldRoads.length(road.id);
        for (let s = road.startTaper + 5; s <= len; s += 5) {
          const rise = Math.abs(worldRoads.profile(road.id, s) - worldRoads.profile(road.id, s - 5)) / 5;
          expect(rise).toBeLessThanOrEqual(road.maxGrade + 1e-6);
        }
      });

      it('the shaped ground on the centreline is the profile, and walking it never climbs much past the grade', () => {
        let worst = 0;
        const fine = samples(road, 4);
        for (let i = 1; i < fine.length; i++) {
          const a = fine[i - 1];
          const b = fine[i];
          if (a.s < road.startTaper) continue;
          worst = Math.max(worst, Math.abs(heightAt(b.x, b.z) - heightAt(a.x, a.z)) / Math.hypot(b.x - a.x, b.z - a.z));
        }
        // Bends blend two arc positions, and a branch's last metres meet its plateau's blend (measured at most 0.037
        // over the grade, on the Hushed Anvil path). Branches taper in over 36 m, so the trunk keeps its own profile.
        expect(worst, String(worst)).toBeLessThanOrEqual(road.maxGrade + 0.04);
      });

      it(`cuts or fills at most ${MAX_CUT[road.id]} m at the centre and both edges`, () => {
        for (const p of along) {
          const profile = worldRoads.profile(road.id, p.s);
          for (const off of [0, road.halfWidth, -road.halfWidth]) {
            const cut = Math.abs(profile - unroaded.heightAt(p.x + p.nx * off, p.z + p.nz * off));
            expect(cut, `at (${p.x.toFixed(0)}, ${p.z.toFixed(0)}) offset ${off}`).toBeLessThanOrEqual(MAX_CUT[road.id]);
          }
        }
      });

      it(`keeps every bank at most ${MAX_BANK_SLOPE} steep on 4 m samples out to the edge of the blend`, () => {
        let worst = 0;
        for (const p of samples(road, 40)) {
          const reach = road.halfWidth + Math.max(road.blend, 2.6 * Math.abs(worldRoads.profile(road.id, p.s) - unroaded.heightAt(p.x, p.z)) + 10);
          for (const side of [1, -1]) {
            for (let o = road.halfWidth; o < reach; o += 4) {
              const h0 = heightAt(p.x + p.nx * o * side, p.z + p.nz * o * side);
              const h1 = heightAt(p.x + p.nx * (o + 4) * side, p.z + p.nz * (o + 4) * side);
              worst = Math.max(worst, Math.abs(h1 - h0) / 4);
            }
          }
        }
        expect(worst).toBeLessThanOrEqual(MAX_BANK_SLOPE);
      });
    });
  }
});

describe('junctions', () => {
  for (const branch of [STONEFOLD_ROAD, FELLWALKER_TRACK, HUSHED_ANVIL_PATH, SCORCHHOLD_ROAD]) {
    it(`${branch.id} leaves the Cinder Road at the trunk's surface, with no step or cliff within 400 m`, () => {
      const j = branch.points[0];
      // The branch starts at the trunk's level: the shaped ground at the junction equals the branch profile's start.
      expect(Math.abs(heightAt(j.x, j.z) - worldRoads.profile(branch.id, 0))).toBeLessThan(0.6);
      let worst = 0;
      for (let x = j.x - 400; x <= j.x + 400; x += 8) {
        for (let z = j.z - 400; z <= j.z + 400; z += 8) {
          const h = heightAt(x, z);
          worst = Math.max(worst, Math.abs(heightAt(x + 2, z) - h) / 2, Math.abs(heightAt(x, z + 2) - h) / 2);
        }
      }
      // Worse than the natural ground around would mean a junction artefact; the cut banks themselves are up to 0.9.
      expect(worst).toBeLessThan(1.6);
    });
  }
});

describe('plateaus', () => {
  const regionOf: Record<string, RegionId> = {
    cinderford: 'cinderreach',
    stonefold: 'cinderreach',
    'stonefold-den': 'cinderreach',
    scorchhold: 'cinderreach',
    'hushed-anvil': 'cinderreach',
    deepgate: 'oldsmoke',
  };

  for (const p of PLATEAUS) {
    it(`${p.id} is flat at ${p.height} m across its box and lies inside ${regionOf[p.id]}`, () => {
      const b = p.box;
      // A road arrives on the box edge at the plateau's height; its banks reach a few metres in, so check 40 m inside
      // the edge where a road meets it and the whole box elsewhere.
      for (let x = b.minX; x <= b.maxX; x += (b.maxX - b.minX) / 8) {
        for (let z = b.minZ; z <= b.maxZ; z += (b.maxZ - b.minZ) / 8) {
          if (nearRoad(x, z, 40)) continue;
          expect(heightAt(x, z), `(${x}, ${z})`).toBeCloseTo(p.height, 1);
        }
      }
      for (const [x, z] of [[b.minX, b.minZ], [b.maxX - 1e-6, b.maxZ - 1e-6]]) expect(inRegion(regionOf[p.id], x, z)).toBe(true);
    });

    // Core's check bounds the average blend slope at 0.5, so the smoothstep's peak is at most 0.75 (road banks excluded).
    it(`${p.id} blends back to the ground no steeper than 0.75 on 4 m samples`, () => {
      const b = p.box;
      // Where the natural ground beyond the blend is already steeper (a hillside), the plateau must not make it worse.
      const without = buildShaper({ ...WORLD_SHAPE, plateaus: WORLD_SHAPE.plateaus.filter((q) => q !== p), roads: [DEAD_ROAD] }, shapeBaseHeight, {
        bounds: WORLD_BOUNDS,
        heightRange: HEIGHT_RANGE,
      });
      let worst = 0;
      const sweep = (x0: number, z0: number, dx: number, dz: number) => {
        for (let t = 0; t < p.blend; t += 4) {
          if (nearRoad(x0 + dx * t, z0 + dz * t, 60)) continue;
          const [ax, az, bx, bz] = [x0 + dx * t, z0 + dz * t, x0 + dx * (t + 4), z0 + dz * (t + 4)];
          const slope = Math.abs(heightAt(bx, bz) - heightAt(ax, az)) / 4;
          const natural = Math.abs(without.heightAt(bx, bz) - without.heightAt(ax, az)) / 4;
          worst = Math.max(worst, slope > natural + 0.05 ? slope : 0);
        }
      };
      const midX = (b.minX + b.maxX) / 2;
      const midZ = (b.minZ + b.maxZ) / 2;
      sweep(b.minX, midZ, -1, 0);
      sweep(b.maxX, midZ, 1, 0);
      sweep(midX, b.maxZ, 0, 1);
      sweep(midX, b.minZ, 0, -1);
      expect(worst).toBeLessThanOrEqual(0.75);
    });
  }

  it('A3 sizes fit: Scorchhold holds a 220 x 160 m fort, the den shelf is 60 x 60 m', () => {
    expect(SCORCHHOLD_PLATEAU.box.maxX - SCORCHHOLD_PLATEAU.box.minX).toBeGreaterThanOrEqual(220);
    expect(SCORCHHOLD_PLATEAU.box.maxZ - SCORCHHOLD_PLATEAU.box.minZ).toBeGreaterThanOrEqual(160);
    expect(STONEFOLD_DEN_SHELF.box.maxX - STONEFOLD_DEN_SHELF.box.minX).toBe(60);
    expect(STONEFOLD_DEN_SHELF.box.maxZ - STONEFOLD_DEN_SHELF.box.minZ).toBe(60);
    // The den sits above Stonefold, within a kilometre.
    expect(STONEFOLD_DEN_SHELF.height - STONEFOLD_PLATEAU.height).toBeGreaterThan(50);
  });

  it('the pasture is open ground inside Cinderreach, and the stacks stand on Deepgate', () => {
    const b = FELLWALKER_PASTURE.box;
    expect(inBox(b, FELLWALKER_PASTURE.centre.x, FELLWALKER_PASTURE.centre.z)).toBe(true);
    expect(inRegion('cinderreach', b.minX, b.minZ) && inRegion('cinderreach', b.maxX, b.maxZ)).toBe(true);
    for (const s of OLDSMOKE_STACKS) expect(inBox(DEEPGATE_PLATEAU.box, s.x, s.z)).toBe(true);
  });

  it('the foothill suppression lowers Cinderreach and leaves Oldsmoke and Harrowmark alone', () => {
    let max = -Infinity;
    for (let x = 15600; x <= 22400; x += 100) for (let z = -400; z <= 5400; z += 100) max = Math.max(max, heightAt(x, z));
    expect(max).toBeLessThan(350);
    const reach = CINDERREACH_FOOTHILLS.box.minX - CINDERREACH_FOOTHILLS.blend;
    expect(reach).toBeGreaterThan(engineBox('harrowmark').x1);
    expect(CINDERREACH_FOOTHILLS.box.maxZ + CINDERREACH_FOOTHILLS.blend).toBeLessThan(engineBox('oldsmoke').z0);
  });
});

describe('Act 1 ground is unchanged outside the Cinder Road reach', () => {
  const act1 = buildShaper(
    { suppressions: [HARROWMARK_RIDGES], plateaus: [HARROWMARK_PLATEAU, ...DEAD_ROAD_PLATEAUS], roads: [DEAD_ROAD] },
    shapeBaseHeight,
    { bounds: WORLD_BOUNDS, heightRange: HEIGHT_RANGE },
  );
  /** The Cinder Road's own influence (its points plus the widest blend), an intended change east of the city. */
  const reach = (() => {
    const pts = CINDER_ROAD.points;
    const m = CINDER_ROAD.halfWidth + 300;
    return { minX: Math.min(...pts.map((p) => p.x)) - m, maxX: Infinity, minZ: Math.min(...pts.map((p) => p.z)) - m, maxZ: Math.max(...pts.map((p) => p.z)) + m };
  })();

  /** v0.7 (Act 3, K1): the Fen Road leaves the North-west Gate (its points plus its widest blend), also intended. */
  const fenReach = (() => {
    const pts = FEN_ROAD.points;
    const m = FEN_ROAD.halfWidth + 300;
    return { minX: Math.min(...pts.map((p) => p.x)) - m, maxX: Math.max(...pts.map((p) => p.x)) + m, minZ: Math.min(...pts.map((p) => p.z)) - m, maxZ: Infinity };
  })();

  it('a 50 m grid over Brightwater, the Dead Road and Harrowmark matches the Act 1 shape exactly', () => {
    let compared = 0;
    for (let x = -1500; x <= 10500; x += 50) {
      for (let z = -1500; z <= 4000; z += 50) {
        if (inBox(reach, x, z) || inBox(fenReach, x, z)) continue;
        compared++;
        if (heightAt(x, z) !== act1.heightAt(x, z) + detailRelief(x, z)) throw new Error(`Act 1 ground moved at (${x}, ${z})`);
      }
    }
    expect(compared).toBeGreaterThan(20000);
  });

  it('the whole city (760 m round its centre, east side included) is untouched, every 10 m', () => {
    const c = { x: 8500, z: 2000 };
    let compared = 0;
    for (let x = c.x - 760; x <= c.x + 760; x += 10) {
      for (let z = c.z - 760; z <= c.z + 760; z += 10) {
        if (Math.hypot(x - c.x, z - c.z) > 760) continue;
        compared++;
        if (heightAt(x, z) !== act1.heightAt(x, z)) throw new Error(`the city's ground moved at (${x}, ${z})`);
      }
    }
    expect(compared).toBeGreaterThan(18000);
  });

  it('the city plateau and the Dead Road profile are untouched', () => {
    expect(heightAt(8500, 2000)).toBe(HARROWMARK_PLATEAU.height);
    for (let s = 0; s <= worldRoads.length('dead-road'); s += 50) expect(worldRoads.profile('dead-road', s)).toBe(act1.roadProfile('dead-road', s));
  });
});

describe('roadPoint', () => {
  it('walks the polyline by arc length, with the left side to the left of travel', () => {
    const p0 = roadPoint('cinder-road', 0);
    expect(p0.x).toBe(9245);
    expect(p0.z).toBe(2170);
    const len = roadLength('cinder-road');
    expect(len).toBeCloseTo(worldRoads.length('cinder-road'), 3);
    const end = roadPoint('cinder-road', len);
    expect(end.x).toBeCloseTo(21035.7, 6);
    expect(end.z).toBeCloseTo(2700, 6);
    // Heading east on the first segment, left is north (+Z).
    const left = roadPoint('cinder-road', 100, 10);
    const centre = roadPoint('cinder-road', 100);
    expect(left.z - centre.z).toBeGreaterThan(9);
    expect(centre.dirX).toBeGreaterThan(0.9);
  });

  it('clamps past either end and rejects an unknown road or non-finite input', () => {
    expect(roadPoint('oldsmoke-pass', -50)).toMatchObject({ x: 21400, z: 2600 });
    const e = roadPoint('oldsmoke-pass', 1e9);
    expect(e.x).toBeCloseTo(20565.6, 6);
    expect(e.z).toBeCloseTo(7750, 6);
    expect(() => roadPoint('nope' as never, 0)).toThrow(/unknown road/);
    expect(() => roadPoint('cinder-road', Number.NaN)).toThrow(/finite/);
  });
});
