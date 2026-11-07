// Act 5 thread N1 PR 1 (plans/act5-N1.md section 9): the Caldera's ground, places, routes, gates, beacon, sky and storm
// exclusion. The bowl is pinned against its own exports, every place sits where containment lets it be in its phase, every
// route is walkable and dry, and the ground outside the Caldera's own features is the ground Act 4 shipped.
import { readFileSync } from '../region/testing/nodeFs';
import { describe, expect, it, vi } from 'vitest';
import { flagConditionHolds } from '../core/flagCondition';
import { renderAnchorsDoc } from '../region/anchorsDoc';
import { ACT4_WORLD_LAYOUT } from '../region/act4/act4World.layout';
import { ACT4_FOG_FACES } from '../region/act4Fog';
import { RIM_GATE_HALF, RIM_GATE_X, RIM_SIDE_HALF, ACT4_FOG_FACE_POINTS } from '../region/act4/act4World';
import { ACT3_CORRIDORS, ACT3_HOLES, SUMMIT_OPEN_WHEN } from '../region/act3Containment';
import { ACT4_CORRIDORS, ACT4_HOLES, OCCUPIED_FLAG } from '../region/act4Containment';
import { ACT5_HOLES, ACT5_KEEPINS, SIEGE_KEEPIN } from '../region/act5Containment';
import { RIM_GATE_OPEN_WHEN } from '../region/act5Fog';
import { CALDERA_FLOOR_RADIUS, CALDERA_ANVIL_RADIUS } from '../region/act5Regions';
import { ACT2_CORRIDORS } from '../region/act2/act2World';
import { Containment, DEAD_ROAD_CORRIDOR } from '../region/containment';
import { engineBox, REGION_INFO, type RegionId } from '../region/regions';
import { resolveLayout } from '../region/resolveLayout';
import { validateLayout } from '../region/validateLayout';
import { heightAt, HEIGHT_RANGE, shapeBaseHeight, WORLD_SHAPER_OPTIONS } from '../terrain/heightfield';
import { buildShaper } from '../terrain/shaping';
import { detailRelief } from '../terrain/shape/detailRelief';
import { WORLD_SHAPE } from '../terrain/shape/index';
import { wasteRelief } from '../terrain/shape/waste';
import * as T from '../terrain/shape/caldera';
import { WASTE_LAYOUT } from '../waste/waste.layout';
import { WAYSTONE_LOCKS } from '../waystones/tuning';
import { inStormBand, stormBoxes, stormHoleFactor, STORM_HOLE_FADE } from '../weather/weight';
import { inLava, type LavaVolumeDef } from './lava';
import { CALDERA_DOC, CALDERA_DOOR_ANCHORS, CALDERA_LAYOUT, CALDERA_TRIGGERS, CALDERA_WAYSTONES } from './caldera.layout';
import { CALDERA_MAX_FOOTPRINT_SPREAD, CALDERA_STRINGS_EN } from './caldera.plugin';
import { CALDERA_GATES, GATE_MOVE_SECONDS, GateState, stepGate } from './calderaGates';
import { BOWL_HEIGHTS, CALDERA_FAUNA_SITES, CALDERA_PLACES, LAVA_LAKE, RIM_CAMP, SIEGE_POINTS, radiusOf, type XZ } from './calderaSites';
import { SKY_LOOKS, skyRegions, skyWeight } from './calderaSky';
import { RIM_BEACON_LIFT, RimBeacon, type RimBeaconPorts } from './rimBeacon';

const LAKE: LavaVolumeDef = {
  id: 'lava.caldera.lake',
  shape: { kind: 'ribbon', points: LAVA_LAKE.ribbon, halfWidth: LAVA_LAKE.halfWidth },
  surfaceY: LAVA_LAKE.surfaceY,
  damagePctPerS: 15,
  safeLips: LAVA_LAKE.safeLips.map(([x, z]) => ({ x, y: heightAt(x, z), z })),
};
const dry = (x: number, z: number, y = heightAt(x, z)) => !inLava(LAKE, { x, y, z });

describe('the bowl', () => {
  it('keeps every height in the world range and pins the floor, the lake, the island and the ring', () => {
    const at = (r: number, deg: number) => heightAt(T.ANVIL[0] + r * Math.sin((deg * Math.PI) / 180), T.ANVIL[1] + r * Math.cos((deg * Math.PI) / 180));
    // The causeway runs south from the island (deg 180); every other bearing is open lake.
    const bearings = [0, 45, 90, 135, 225, 270, 315];
    for (const d of [...bearings, 180]) {
      expect(at(0, d)).toBe(BOWL_HEIGHTS.island);
      expect(at(T.ISLAND_R - 20, d)).toBe(BOWL_HEIGHTS.island);
      // South (180) the Inner Gate's ramp comes down onto the floor at r 400.
      for (const r of d === 180 ? [320, 380] : [320, 380, 440]) expect(at(r, d), `floor r${r} ${d}`).toBe(BOWL_HEIGHTS.floor);
      for (const r of [560, 700, 900]) {
        const h = at(r, d);
        expect(h, `ring r${r} ${d}`).toBeGreaterThan(BOWL_HEIGHTS.ring - 12);
        expect(h, `ring r${r} ${d}`).toBeLessThan(BOWL_HEIGHTS.ring + 15);
      }
    }
    for (const d of bearings) for (const r of [T.LAKE_INNER_R + 10, T.LAKE_RING_R, T.LAKE_OUTER_R - 10]) expect(at(r, d)).toBe(T.LAKE_FLOOR);
    expect(T.LAKE_FLOOR).toBeLessThan(BOWL_HEIGHTS.lake);
    for (let x = 10000; x <= 12000; x += 40) {
      for (let z = 6200; z <= 9200; z += 40) {
        const h = heightAt(x, z);
        expect(h).toBeGreaterThanOrEqual(HEIGHT_RANGE.min);
        expect(h).toBeLessThanOrEqual(HEIGHT_RANGE.max);
      }
    }
  });

  it('puts the floor wall on the floor hole and the island inside the Anvil hole', () => {
    expect(T.FLOOR_WALL_RADIUS).toBe(CALDERA_FLOOR_RADIUS);
    expect(T.LAKE_OUTER_R).toBeLessThanOrEqual(CALDERA_ANVIL_RADIUS);
    expect(T.CAUSEWAY_POINTS[0][1]).toBeLessThan(T.ANVIL[1] - CALDERA_ANVIL_RADIUS);
    expect(T.ISLAND_R).toBeLessThan(CALDERA_ANVIL_RADIUS);
    expect(T.CAUSEWAY_POINTS[0][1]).toBe(T.ANVIL[1] - 300);
  });

  it('closes the lake ring, and the causeway stands above the surface the whole way', () => {
    expect(LAVA_LAKE.ribbon[0][0]).toBeCloseTo(LAVA_LAKE.ribbon[LAVA_LAKE.ribbon.length - 1][0], 6);
    expect(LAVA_LAKE.ribbon[0][1]).toBeCloseTo(LAVA_LAKE.ribbon[LAVA_LAKE.ribbon.length - 1][1], 6);
    for (let z = T.CAUSEWAY_POINTS[0][1]; z <= T.CAUSEWAY_POINTS[1][1]; z += 2) {
      for (const dx of [-T.CAUSEWAY_HALF_WIDTH + 1, 0, T.CAUSEWAY_HALF_WIDTH - 1]) {
        expect(heightAt(T.ANVIL[0] + dx, z), `causeway ${dx} ${z}`).toBeGreaterThanOrEqual(BOWL_HEIGHTS.island - 0.01);
        expect(dry(T.ANVIL[0] + dx, z)).toBe(true);
      }
    }
  });

  it('gives every safe lip dry ground, nearest the island, the causeway or the shore', () => {
    expect(LAVA_LAKE.safeLips).toHaveLength(8 + 2 + 24);
    for (const [x, z] of LAVA_LAKE.safeLips) {
      expect(dry(x, z), `${x}, ${z}`).toBe(true);
      expect(heightAt(x, z)).toBeGreaterThan(BOWL_HEIGHTS.lake);
    }
  });
});

/** The ground without the Caldera's shaping (the dune mask is today's, so this pins the shaper's layers). */
const shipped = buildShaper(
  {
    ...WORLD_SHAPE,
    plateaus: WORLD_SHAPE.plateaus.filter((p) => !T.CALDERA_PLATEAUS.includes(p) && !T.CALDERA_WASTE_SIDE_PLATEAUS.includes(p)),
    roads: WORLD_SHAPE.roads.filter((r) => !T.CALDERA_ROADS.includes(r)),
    flats: (WORLD_SHAPE.flats ?? []).filter((f) => !T.CALDERA_FLATS.includes(f)),
    troughs: (WORLD_SHAPE.troughs ?? []).filter((t) => !T.CALDERA_TROUGHS.includes(t)),
  },
  shapeBaseHeight,
  WORLD_SHAPER_OPTIONS,
);
const old = (x: number, z: number) => shipped.heightAt(x, z) + detailRelief(x, z) + wasteRelief(x, z);


describe('the ground outside the Caldera is the ground Act 4 shipped', () => {
  it("leaves N2's north crest pad unchanged", () => {
    for (let x = 9700; x <= 12300; x += 50) for (let z = 9250; z <= 9450; z += 50) expect(heightAt(x, z), `${x}, ${z}`).toBe(old(x, z));
  });

  it('leaves every Waste and Act 4 world anchor where it stood, but the Rim Gate face down in the cut', () => {
    // The face's anchor stands in the gate cut, so it sits on the cut's floor now; its wall is built from the anchor.
    const MOVED = new Set(['waste.fog.caldera-rim.s']);
    let compared = 0;
    for (const a of [...WASTE_LAYOUT.anchors, ...ACT4_WORLD_LAYOUT.anchors]) {
      const was = old(a.x, a.z);
      if (MOVED.has(a.id)) expect(heightAt(a.x, a.z), a.id).toBeLessThan(was);
      else expect(heightAt(a.x, a.z), a.id).toBe(was);
      compared++;
    }
    expect(compared).toBeGreaterThan(100);
  });
});

const CALDERA = engineBox('caldera');

describe("the Caldera's Waste-side ground", () => {
  // The rim stairs and the warhost camp are cut into the Waste's ground (and kept clear of its dunes): no cliff the
  // controller cannot climb (45 degrees) anywhere over them or their blends.
  const steepest = (x0: number, x1: number, z0: number, z1: number): number => {
    let worst = 0;
    for (let x = x0; x <= x1; x += 4) {
      for (let z = z0; z <= z1; z += 4) {
        const h = heightAt(x, z);
        worst = Math.max(worst, Math.abs(heightAt(x + 4, z) - h) / 4, Math.abs(heightAt(x, z + 4) - h) / 4);
      }
    }
    return worst;
  };
  it('the warhost camp and its blend', () => {
    const p = T.WARHOST_PLATEAU;
    expect(steepest(p.box.minX - p.blend - 20, p.box.maxX + p.blend + 20, p.box.minZ - p.blend - 20, p.box.maxZ + p.blend + 20)).toBeLessThan(1);
  });
  it('the rim stairs: steeper than 45 degrees only on their own rock-cut banks (maxBlend 12) and the gate cut, or where the crest was already that steep', () => {
    const xs = T.RIM_STAIRS_POINTS.map((q) => q[0]);
    const zs = T.RIM_STAIRS_POINTS.map((q) => q[1]);
    // The road's own reach: its half width and its cut and fill banks (the steepest measured 32 m out, between the legs).
    const bank = 45;
    const toStairs = (x: number, z: number) => {
      let d = Infinity;
      const p = T.RIM_STAIRS_POINTS;
      for (let i = 1; i < p.length; i++) {
        const [ax, az] = p[i - 1];
        const [bx, bz] = p[i];
        const dx = bx - ax;
        const dz = bz - az;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
        d = Math.min(d, Math.hypot(x - ax - dx * t, z - az - dz * t));
      }
      return d;
    };
    let steep = 0;
    for (let x = Math.min(...xs) - 40; x <= Math.max(...xs) + 40; x += 4) {
      for (let z = Math.min(...zs) - 40; z <= Math.max(...zs) + 10; z += 4) {
        const h = heightAt(x, z);
        // Steeper than the controller climbs (45 degrees, with 10% for the 4 m sampling).
        if (Math.max(Math.abs(heightAt(x + 4, z) - h), Math.abs(heightAt(x, z + 4) - h)) / 4 < 1.1) continue;
        steep++;
        // ... or the gate cut's own walls (half width 14, blend 25), where the stairs arrive.
        const inCut = Math.abs(x - T.RIM_GATE[0]) <= T.GATE_CUT_HALF_WIDTH + 25 + 6 && z >= 6440 - 25 - 6;
        // ... or ground the Act 4 crest already made that steep.
        const o = old(x, z);
        const wasSteep = Math.max(Math.abs(old(x + 4, z) - o), Math.abs(old(x, z + 4) - o)) / 4 >= 1;
        if (!inCut && !wasSteep) expect(toStairs(x, z), `steep ground at ${x}, ${z}`).toBeLessThanOrEqual(bank);
      }
    }
    expect(steep).toBeGreaterThan(0);
  });
});

describe('the plugin', () => {
  it("loads after dragonspine, which defines the Last Anvil's stone the Rim Beacon stands beside", async () => {
    const { default: plugin } = await import('./caldera.plugin');
    expect(plugin.dependsOn).toContain('dragonspine');
    const { DRAGONSPINE_LAYOUT } = await import('../dragonspine/dragonspine.layout');
    const { LAST_ANVIL } = await import('../shrine/act3/tuning');
    expect(DRAGONSPINE_LAYOUT.anchors.some((a) => a.id === LAST_ANVIL.waystoneAnchor)).toBe(true);
  }, 60_000);
});

describe('the routes', () => {
  const paths: [string, readonly XZ[]][] = [
    ['rim stairs', T.RIM_STAIRS_POINTS],
    ['landing to the camp', [T.RIM_STAIRS_POINTS[T.RIM_STAIRS_POINTS.length - 1], RIM_CAMP.fire]],
    ['camp to the lava stair', [RIM_CAMP.fire, T.LAVA_STAIR_POINTS[0]]],
    ['lava stair', T.LAVA_STAIR_POINTS],
    ['stair foot to the inner gate', [T.LAVA_STAIR_POINTS[T.LAVA_STAIR_POINTS.length - 1], T.INNER_GATE_RAMP_POINTS[0]]],
    ['inner gate ramp', T.INNER_GATE_RAMP_POINTS],
    ['ramp foot to the causeway', [T.INNER_GATE_RAMP_POINTS[1], T.CAUSEWAY_POINTS[0]]],
    ['causeway', T.CAUSEWAY_POINTS],
    ['tunnel path', T.TUNNEL_PATH_POINTS],
    ['terrace path', T.TERRACE_PATH_POINTS],
    ['terraces', T.TERRACES_POINTS],
  ];
  for (const [name, pts] of paths) {
    it(`${name}: grade at most 0.6 every 2 m and never in the lava`, () => {
      let worst = 0;
      for (let i = 1; i < pts.length; i++) {
        const [ax, az] = pts[i - 1];
        const [bx, bz] = pts[i];
        const len = Math.hypot(bx - ax, bz - az);
        const n = Math.max(1, Math.ceil(len / 2));
        let prev = heightAt(ax, az);
        for (let k = 1; k <= n; k++) {
          const x = ax + ((bx - ax) * k) / n;
          const z = az + ((bz - az) * k) / n;
          const h = heightAt(x, z);
          worst = Math.max(worst, Math.abs(h - prev) / (len / n));
          expect(dry(x, z, h), `${name} in lava at ${x}, ${z}`).toBe(true);
          prev = h;
        }
      }
      expect(worst, name).toBeLessThanOrEqual(0.6);
    });
  }
});

describe("the Caldera's places", () => {
  const resolved = resolveLayout(CALDERA_LAYOUT, heightAt);

  it('validates (no floating anchor, flat footprints) and keeps unique ids', () => {
    expect(validateLayout(CALDERA_LAYOUT, heightAt, { spawnId: null, maxFootprintSpread: CALDERA_MAX_FOOTPRINT_SPREAD })).toEqual([]);
    for (const list of [CALDERA_LAYOUT.anchors, CALDERA_LAYOUT.triggers, CALDERA_LAYOUT.structures]) {
      const ids = list.map((x) => x.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
    for (const t of Object.values(CALDERA_TRIGGERS)) expect(CALDERA_LAYOUT.triggers.some((x) => x.id === t), t).toBe(true);
  });

  it('puts no anchor, place, fauna site or siege point in the lava', () => {
    for (const a of resolved.anchors) expect(dry(a.position.x, a.position.z, a.position.y), a.id).toBe(true);
    for (const [k, [x, z]] of Object.entries(CALDERA_PLACES)) expect(dry(x, z), k).toBe(true);
    for (const s of CALDERA_FAUNA_SITES) expect(dry(s.at[0], s.at[1]), s.id).toBe(true);
    for (const [x, z] of [...SIEGE_POINTS.gate, ...SIEGE_POINTS.lanes, SIEGE_POINTS.court, SIEGE_POINTS.lee, SIEGE_POINTS.start]) expect(dry(x, z)).toBe(true);
  });

  it('keeps every trigger prop-free: no structure within 2 m of its sphere', () => {
    for (const t of CALDERA_LAYOUT.triggers) {
      const r = t.shape === 'sphere' ? (t.radius ?? 0) : 0;
      for (const st of CALDERA_LAYOUT.structures) {
        const half = Math.hypot(st.footprint[0], st.footprint[1]) / 2;
        expect(Math.hypot(st.x - t.x, st.z - t.z) - half - r, `${t.id} vs ${st.id}`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("stands every door on flat ground, so an interior's exit (1.6 m out, at the anchor's height) lands on it", () => {
    for (const id of Object.values(CALDERA_DOOR_ANCHORS)) {
      const a = resolved.anchors.find((x) => x.id === id);
      expect(a, id).toBeDefined();
      for (let r = 0.5; r <= 4; r += 0.5) {
        for (let deg = 0; deg < 360; deg += 15) {
          const x = a!.position.x + r * Math.sin((deg * Math.PI) / 180);
          const z = a!.position.z + r * Math.cos((deg * Math.PI) / 180);
          expect(Math.abs(heightAt(x, z) - a!.position.y), `${id} r${r} ${deg}`).toBeLessThanOrEqual(0.05);
        }
      }
    }
  });

  it('lights the Inner Gate stone only after M53, and has the three Caldera stones', () => {
    expect(Object.keys(CALDERA_WAYSTONES).sort()).toEqual(['inner-gate', 'rim-camp', 'wyrm-terraces']);
    expect(WAYSTONE_LOCKS['inner-gate']).toBe('story.m53.complete');
    for (const id of Object.keys(CALDERA_WAYSTONES)) expect(CALDERA_LAYOUT.anchors.some((a) => a.id === `waystone.${id}`), id).toBe(true);
  });

  it('CALDERA_ANCHORS.md matches the layout (regenerate with npx vite-node tools/gen-region-docs.ts)', () => {
    expect(readFileSync('src/caldera/CALDERA_ANCHORS.md', 'utf8')).toBe(renderAnchorsDoc(CALDERA_LAYOUT, CALDERA_DOC));
  });

  it('registers every string it prompts or toasts', () => {
    for (const k of ['caldera.beacon.prompt', 'caldera.beacon.refused', 'caldera.beacon.noTarget']) expect(CALDERA_STRINGS_EN[k], k).toBeTruthy();
  });
});

type Flags = Record<string, boolean>;
const ACT4_DONE: Flags = {
  'story.gate.a2': true,
  'story.d03.complete': true,
  'story.gate.a3': true,
  ...Object.fromEntries((SUMMIT_OPEN_WHEN.all ?? []).map((k) => [k, true])),
  'story.gate.a4': true,
  [OCCUPIED_FLAG]: true,
  'story.m41.complete': true,
  'story.m42.started': true,
  'story.phase.wasteOpen': true,
  'story.m46.complete': true,
  'story.d08.complete': true,
};
const PHASE_I: Flags = { ...ACT4_DONE, 'story.gate.a5': true, 'story.m47.complete': true, 'story.m47.rimGateOpen': true };
const SIEGE: Flags = { ...PHASE_I, 'story.m52.started': true };
const AFTER_M53: Flags = { ...PHASE_I, 'story.m52.complete': true, 'story.phase.foundryOpen': true, 'story.m53.complete': true };
const at = (c: Containment, p: XZ): boolean => c.isOpen(p[0], p[1]);
const reader = (flags: Flags) => ({ getFlag: (k: string) => flags[k] });
function containment(flags: Flags): Containment {
  const c = new Containment(reader(flags), [DEAD_ROAD_CORRIDOR, ...ACT3_CORRIDORS, ...ACT4_CORRIDORS], [...ACT3_HOLES, ...ACT4_HOLES, ...ACT5_HOLES]);
  for (const def of ACT2_CORRIDORS) c.addCorridor(def);
  for (const k of ACT5_KEEPINS) c.addKeepIn(k);
  return c;
}

describe('the places against containment', () => {
  const PHASE_I_OPEN: (keyof typeof CALDERA_PLACES)[] = [
    'rimfoot', 'rimStairsFoot', 'rimStairsHairpin', 'rimGateLanding', 'siegeCourt', 'rimCamp', 'rimCampWaystone', 'stokersPost',
    'tunnelMouth', 'lavaStairHead', 'lavaStairFoot', 'coolingHall', 'wyrmTerraces', 'innerGateWaystone', 'warhostCamp',
  ];
  const BEHIND_INNER_GATE: (keyof typeof CALDERA_PLACES)[] = ['foundry', 'hammerHall'];

  it('opens the rim, the camp, the terraces and the Inner Gate head in Phase I, and nothing behind the face', () => {
    const c = containment(PHASE_I);
    for (const k of PHASE_I_OPEN) expect(at(c, CALDERA_PLACES[k]), k).toBe(true);
    for (const k of [...BEHIND_INNER_GATE, 'anvil'] as const) expect(at(c, CALDERA_PLACES[k]), k).toBe(false);
    for (const k of BEHIND_INNER_GATE) expect(radiusOf(CALDERA_PLACES[k])).toBeLessThan(CALDERA_FLOOR_RADIUS);
    expect(radiusOf(CALDERA_PLACES.innerGateWaystone)).toBeGreaterThan(CALDERA_FLOOR_RADIUS);
  });

  it('opens the floor after M53 but holds the Anvil until D10', () => {
    const c = containment(AFTER_M53);
    for (const k of BEHIND_INNER_GATE) expect(at(c, CALDERA_PLACES[k]), k).toBe(true);
    expect(at(c, CALDERA_PLACES.anvil)).toBe(false);
    expect(at(containment({ ...AFTER_M53, 'story.d10.started': true }), CALDERA_PLACES.anvil)).toBe(true);
  });

  it("keeps the siege's points inside the keep-in, and the camp's working ones too", () => {
    const b = SIEGE_KEEPIN.box!;
    const inside = ([x, z]: XZ) => x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1;
    // The lane heads are the waves' (out on the stairs, past the keep-in, so the player never camps them).
    for (const p of [...SIEGE_POINTS.gate, SIEGE_POINTS.ram, SIEGE_POINTS.court, SIEGE_POINTS.lee, SIEGE_POINTS.banner, SIEGE_POINTS.orders, SIEGE_POINTS.crates, SIEGE_POINTS.aid, SIEGE_POINTS.start, SIEGE_POINTS.wallLeft, SIEGE_POINTS.wallRight]) {
      expect(inside(p), `${p}`).toBe(true);
    }
    const c = containment(SIEGE);
    expect(at(c, SIEGE_POINTS.start)).toBe(true);
    expect(at(c, CALDERA_PLACES.wyrmTerraces)).toBe(false);
  });
});

describe('the Rim Gate faces', () => {
  it('splits the south rim into three contiguous faces on one line, only the middle (28 m) one opening', () => {
    const byId = Object.fromEntries(ACT4_FOG_FACES.map((f) => [f.id, f]));
    expect(RIM_GATE_HALF).toBe(T.GATE_CUT_HALF_WIDTH);
    expect(RIM_GATE_X).toBe(T.RIM_GATE[0]);
    const s = ACT4_FOG_FACE_POINTS['fog.caldera-rim.s'];
    const sw = ACT4_FOG_FACE_POINTS['fog.caldera-rim.sw'];
    const se = ACT4_FOG_FACE_POINTS['fog.caldera-rim.se'];
    expect(sw.z).toBe(s.z);
    expect(se.z).toBe(s.z);
    expect(sw.x + RIM_SIDE_HALF).toBeCloseTo(s.x - RIM_GATE_HALF, 6);
    expect(se.x - RIM_SIDE_HALF).toBeCloseTo(s.x + RIM_GATE_HALF, 6);
    expect(byId['fog.caldera-rim.s'].openWhen).toEqual(RIM_GATE_OPEN_WHEN);
    for (const id of ['fog.caldera-rim.sw', 'fog.caldera-rim.se']) {
      for (const f of [PHASE_I, AFTER_M53]) expect(flagConditionHolds(byId[id].openWhen!, reader(f)), id).toBe(false);
    }
    expect(flagConditionHolds(byId['fog.caldera-rim.s'].openWhen!, reader(PHASE_I))).toBe(true);
    expect(flagConditionHolds(byId['fog.caldera-rim.s'].openWhen!, reader({ ...PHASE_I, 'story.m47.rimGateOpen': false }))).toBe(false);
  });
});

describe('the gates', () => {
  it('step at 1 / GATE_MOVE_SECONDS and clamp', () => {
    expect(stepGate(0, 1, GATE_MOVE_SECONDS / 2)).toBeCloseTo(0.5, 9);
    expect(stepGate(0.9, 1, 1)).toBe(1);
    expect(stepGate(0.1, 0, 1)).toBe(0);
    expect(stepGate(0.4, 1, 0)).toBe(0.4);
    expect(stepGate(0.4, 1, NaN)).toBe(0.4);
  });

  it('snap on a load and move on a live flag', () => {
    const g = new GateState();
    g.set(true, 'load');
    expect(g.open).toBe(1);
    g.set(false, 'flag');
    expect(g.open).toBe(1);
    g.tick(GATE_MOVE_SECONDS);
    expect(g.open).toBe(0);
  });

  it('take their rules from the faces they stand in', () => {
    const rim = CALDERA_GATES.find((d) => d.id === 'rim-gate')!;
    const inner = CALDERA_GATES.find((d) => d.id === 'inner-gate')!;
    expect(rim.when).toEqual(RIM_GATE_OPEN_WHEN);
    expect(flagConditionHolds(inner.when, reader(PHASE_I))).toBe(false);
    expect(flagConditionHolds(inner.when, reader(AFTER_M53))).toBe(true);
  });
});

describe('the Rim Beacon', () => {
  const ports = (flags: Flags, over: Partial<RimBeaconPorts> = {}): RimBeaconPorts & { teleport: ReturnType<typeof vi.fn>; toast: ReturnType<typeof vi.fn> } =>
    ({
      flag: (k: string) => !!flags[k],
      blocked: () => null,
      target: () => ({ x: 10965, y: 0, z: 6735, yaw: 1 }),
      heightAt: () => 295,
      teleport: vi.fn(async () => ({ ok: true })),
      toast: vi.fn(),
      ...over,
    }) as never;
  const both = { 'story.gate.a5': true, 'story.m47.rimGateOpen': true, 'world.last-anvil.rimBeacon': true };

  it('is offered only with Act 5 open, the Rim Gate opened and the Last Anvil restored', async () => {
    const partial = Object.keys(both).flatMap((k) => [{ [k]: true }, Object.fromEntries(Object.keys(both).filter((j) => j !== k).map((j) => [j, true]))]);
    for (const f of [{}, ...partial] as Flags[]) {
      const p = ports(f);
      const b = new RimBeacon(p);
      expect(b.offered()).toBe(false);
      expect(await b.use()).toBe('not-offered');
      expect(p.teleport).not.toHaveBeenCalled();
    }
    expect(new RimBeacon(ports(both)).offered()).toBe(true);
  });

  it('teleports to the ground under the Rim Camp stone plus the lift', async () => {
    const p = ports(both);
    expect(await new RimBeacon(p).use()).toBe('travelled');
    expect(p.teleport).toHaveBeenCalledWith({ x: 10965, y: 295 + RIM_BEACON_LIFT, z: 6735 }, 1);
  });

  it('is refused when fast travel is (combat, the siege), and says why', async () => {
    const p = ports(both, { blocked: () => 'movement' });
    expect(await new RimBeacon(p).use()).toBe('refused');
    expect(p.toast).toHaveBeenCalledWith('caldera.beacon.refused');
    expect(p.teleport).not.toHaveBeenCalled();
  });

  it('reports a missing target, a failed teleport and a second press while travelling', async () => {
    const none = ports(both, { target: () => null });
    expect(await new RimBeacon(none).use()).toBe('no-target');
    expect(none.toast).toHaveBeenCalledWith('caldera.beacon.noTarget');
    expect(await new RimBeacon(ports(both, { teleport: vi.fn(async () => ({ ok: false })) })).use()).toBe('failed');
    let release!: () => void;
    const slow = ports(both, { teleport: vi.fn(() => new Promise<{ ok: boolean }>((r) => (release = () => r({ ok: true })))) });
    const b = new RimBeacon(slow);
    const first = b.use();
    expect(await b.use()).toBe('busy');
    release();
    expect(await first).toBe('travelled');
  });
});

describe('the sky', () => {
  it("paints the Caldera's box only, fading in from 100 m inside, after the storm has faded out", () => {
    const regions = skyRegions();
    expect(regions.map((r) => r.id)).toEqual(['caldera']);
    const b = regions[0].box;
    const midX = (b.x0 + b.x1) / 2;
    const { fadeStart, fadeIn } = SKY_LOOKS['caldera-orange'];
    const w = (z: number, gate = true, indoors = false) => skyWeight(b, fadeStart, fadeIn, midX, z, gate, indoors);
    expect(w(b.z0 - 10)).toBe(0);
    expect(w(b.z0 + fadeStart)).toBe(0);
    expect(w(b.z0 + fadeStart + fadeIn / 2)).toBeCloseTo(0.5, 6);
    expect(w((b.z0 + b.z1) / 2)).toBe(1);
    expect(w((b.z0 + b.z1) / 2, false)).toBe(0);
    expect(w((b.z0 + b.z1) / 2, true, true)).toBe(0);
    // The two blenders never share a band: wherever the storm look still has weight, the sky has none.
    for (let d = 0; d <= 400; d += 5) {
      const storm = stormHoleFactor([b], midX, b.z0 + d);
      if (storm > 0) expect(w(b.z0 + d), `${d} m in`).toBe(0);
    }
  });
});

describe('the storm clock leaves the Caldera out', () => {
  const ids = Object.keys(REGION_INFO) as RegionId[];
  const { boxes, holes } = stormBoxes(ids, (id) => REGION_INFO[id as RegionId], (id) => engineBox(id as RegionId));

  it('finds the Caldera as a hole in the Waste', () => {
    expect(holes).toContainEqual(CALDERA);
    expect(boxes).toContainEqual(engineBox('ashen-waste'));
  });

  it('fades the storm over the first 100 m inside the Caldera, and drops the clock deep inside it', () => {
    const midX = (CALDERA.x0 + CALDERA.x1) / 2;
    expect(stormHoleFactor(holes, midX, CALDERA.z0 - 50)).toBe(1);
    expect(stormHoleFactor(holes, midX, CALDERA.z0 + STORM_HOLE_FADE / 2)).toBeCloseTo(0.5, 6);
    expect(stormHoleFactor(holes, midX, CALDERA.z0 + STORM_HOLE_FADE + 10)).toBe(0);
    expect(inStormBand(boxes, holes, 9000, 7000)).toBe(true);
    expect(inStormBand(boxes, holes, T.ANVIL[0], T.ANVIL[1])).toBe(false);
  });
});
