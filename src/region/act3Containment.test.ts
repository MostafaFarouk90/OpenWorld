// v0.7 items 2 and 3: Act 3 containment (the Greyfen, the held Dragonspine, the summit hole, the Fen and Spine Road
// corridors) and the Act 3 fog faces' rules.
import { describe, expect, it } from 'vitest';
import { WORLD_BOUNDS } from '../config/constants';
import { flagConditionHolds } from '../core/flagCondition';
import { ACT2_CORRIDORS, ACT2_FOG_WALLS, ACT2_WORLD_STRINGS_EN } from './act2/act2World';
import { ACT3_CORRIDORS, ACT3_HOLES, CORRIDOR_RESERVED_CLEARANCE, SUMMIT_HOLE, SUMMIT_OPEN_WHEN } from './act3Containment';
import { ACT3_FOG_FACES, ACT3_FOG_STRINGS_EN, act3FogFace } from './act3Fog';
import { AREA_BANDS, SUMMIT_BOX, areaAt } from './areas';
import { CORRIDOR_HALF_WIDTH, Containment, DEAD_ROAD_CORRIDOR, type CorridorDef } from './containment';
import { installContainment } from './containmentSystem';
import { PUSH_BACK_MAX_DEPTH, fogOpenById, fogToastKey, fogWallForTrigger, needsPushBackDef } from './fogWall';
import { ACT2_WORLD_LAYOUT } from './act2/act2World.layout';
import { regionAt } from './regionMask';
import { PHASE_HOLDS, REGION_IDS, REGION_INFO, engineBox } from './regions';
import { createFakeCore } from './testing/fakeCore';

// The oracle: engine boxes written out by hand from the plan (Part 3.1), independent of regions.ts.
const BOX = {
  brightwater: { x0: -500, z0: -500, x1: 5500, z1: 4500 },
  harrowmark: { x0: 6500, z0: 0, x1: 10500, z1: 4000 },
  cinderreach: { x0: 15500, z0: -500, x1: 22500, z1: 5500 },
  oldsmoke: { x0: 17000, z0: 7000, x1: 22000, z1: 12000 },
  greyfen: { x0: -500, z0: 9500, x1: 6500, z1: 15500 },
  dragonspine: { x0: 10000, z0: 11000, x1: 17000, z1: 17000 },
  summit: { x0: 11500, z0: 14800, x1: 16500, z1: 16900 },
  waste: { x0: 7000, z0: 4500, x1: 15000, z1: 11000 },
} as const;
type Box = { x0: number; z0: number; x1: number; z1: number };
const inBox = (b: Box, x: number, z: number) => x >= b.x0 && x < b.x1 && z >= b.z0 && z < b.z1;

const PHASE_D = { 'story.gate.a2': true, 'story.d03.complete': true };
const SUMMIT_FLAGS = Object.fromEntries((SUMMIT_OPEN_WHEN.all ?? []).map((k) => [k, true]));
const STATES = {
  phaseE: { ...PHASE_D, 'story.gate.a3': true },
  phaseF: { ...PHASE_D, 'story.gate.a3': true, 'story.phase.dragonspineOpen': true },
  actComplete: { ...PHASE_D, 'story.gate.a3': true, 'story.phase.dragonspineOpen': true, ...SUMMIT_FLAGS, 'story.gate.a4': true },
} as const;
type StateName = keyof typeof STATES;
const OPEN: Record<StateName, { boxes: Box[]; spine: boolean; summit: boolean }> = {
  phaseE: { boxes: [BOX.brightwater, BOX.harrowmark, BOX.cinderreach, BOX.oldsmoke, BOX.greyfen], spine: false, summit: false },
  phaseF: { boxes: [BOX.brightwater, BOX.harrowmark, BOX.cinderreach, BOX.oldsmoke, BOX.greyfen, BOX.dragonspine], spine: true, summit: false },
  actComplete: { boxes: [BOX.brightwater, BOX.harrowmark, BOX.cinderreach, BOX.oldsmoke, BOX.greyfen, BOX.dragonspine], spine: true, summit: true },
};

const stateOf = (flags: Record<string, boolean>) => ({ getFlag: (k: string) => flags[k] });
const distToLine = (pts: readonly (readonly [number, number])[], x: number, z: number) => {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1];
    const [bx, bz] = pts[i];
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
  }
  return best;
};
const distToBox = (b: Box, x: number, z: number) => Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.z0 - z, 0, z - b.z1));
/** Shortest distance from a polyline to a box (sampled every 5 m; a centreline inside the box reads 0). */
const lineToBox = (pts: readonly (readonly [number, number])[], b: Box) => {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1];
    const [bx, bz] = pts[i];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 5));
    for (let k = 0; k <= n; k++) {
      const x = ax + ((bx - ax) * k) / n;
      const z = az + ((bz - az) * k) / n;
      best = Math.min(best, inBox(b, x, z) ? 0 : distToBox(b, x, z));
    }
  }
  return best;
};

function containment(flags: Record<string, boolean>): Containment {
  const c = new Containment(stateOf(flags), [DEAD_ROAD_CORRIDOR, ...ACT3_CORRIDORS], ACT3_HOLES);
  for (const def of ACT2_CORRIDORS) c.addCorridor(def);
  return c;
}

const ALL_CORRIDORS: readonly CorridorDef[] = [DEAD_ROAD_CORRIDOR, ...ACT2_CORRIDORS, ...ACT3_CORRIDORS];

describe('Act 3 containment: the map-wide grid in Phase E, Phase F and act complete', () => {
  for (const name of Object.keys(STATES) as StateName[]) {
    it(`${name}: a 250 m grid matches the hand-written boxes, the holes and the corridors`, () => {
      const flags = STATES[name];
      const c = containment(flags);
      const openCorridors = ALL_CORRIDORS.filter((k) => flagConditionHolds(k.openWhen, stateOf(flags)));
      expect(openCorridors.some((k) => k.id === 'corridor.spine-road')).toBe(OPEN[name].spine);
      let checked = 0;
      for (let x = WORLD_BOUNDS.minX - 500; x <= WORLD_BOUNDS.maxX + 500; x += 250) {
        for (let z = WORLD_BOUNDS.minZ - 500; z <= WORLD_BOUNDS.maxZ + 500; z += 250) {
          const inside = x >= WORLD_BOUNDS.minX && x <= WORLD_BOUNDS.maxX && z >= WORLD_BOUNDS.minZ && z <= WORLD_BOUNDS.maxZ;
          const holed = !OPEN[name].summit && inBox(BOX.summit, x, z);
          const expected =
            inside &&
            !holed &&
            (OPEN[name].boxes.some((b) => inBox(b, x, z)) || openCorridors.some((k) => distToLine(k.points, x, z) <= (k.halfWidth ?? CORRIDOR_HALF_WIDTH)));
          expect(c.isOpen(x, z), `${name} (${x}, ${z})`).toBe(expected);
          const q = c.nearestOpen(x, z);
          expect(c.isOpen(q.x, q.z), `${name} nearestOpen(${x}, ${z})`).toBe(true);
          checked++;
        }
      }
      expect(checked).toBeGreaterThan(7000);
    });
  }

  it('the Ashen Waste and the Caldera stay closed in every Act 3 state', () => {
    for (const flags of Object.values(STATES)) {
      const c = containment(flags);
      for (let x = BOX.waste.x0 + 100; x < BOX.waste.x1; x += 200) {
        for (let z = BOX.waste.z0 + 100; z < BOX.waste.z1; z += 200) expect(c.isOpen(x, z), `(${x}, ${z})`).toBe(false);
      }
    }
  });

  it('the summit hole: closed until its ten flags hold, and missing any one keeps it closed', () => {
    const c = containment(STATES.phaseF);
    expect(c.closedHoles()).toEqual(['hole.dragonspine.summit']);
    expect(c.isOpen(13600, 15600)).toBe(false);
    expect(c.isOpen(13600, 12500)).toBe(true);
    for (const k of SUMMIT_OPEN_WHEN.all ?? []) {
      const partial = { ...STATES.actComplete, [k]: false };
      expect(containment(partial).isOpen(13600, 15600), k).toBe(false);
    }
    expect(containment(STATES.actComplete).closedHoles()).toEqual([]);
    expect(containment(STATES.actComplete).isOpen(13600, 15600)).toBe(true);
  });

  it('a player inside the closed hole is put just outside its nearest edge, in the open lower slopes', () => {
    const c = containment(STATES.phaseF);
    const q = c.nearestOpen(13600, 14850); // 50 m inside the south edge
    expect(q).toEqual({ x: 13600, z: SUMMIT_BOX.z0 - 1 });
    expect(c.isOpen(q.x, q.z)).toBe(true);
  });

  it('holes: added, refused when duplicated or empty, and undone', () => {
    const c = new Containment(stateOf(STATES.phaseF), [], []);
    const undo = c.addHole(SUMMIT_HOLE);
    expect(() => c.addHole(SUMMIT_HOLE)).toThrow(/already registered/);
    expect(() => c.addHole({ id: 'h.empty', box: { x0: 5, z0: 5, x1: 5, z1: 9 }, openWhen: {} })).toThrow(/empty box/);
    expect(c.closedHoles()).toEqual(['hole.dragonspine.summit']);
    undo();
    expect(c.closedHoles()).toEqual([]);
    expect(c.isOpen(13600, 15600)).toBe(true);
  });

  it('a hole never opens land outside the open regions', () => {
    const c = new Containment(stateOf({}), [], [{ id: 'h.open', box: { x0: 20000, z0: 0, x1: 21000, z1: 1000 }, openWhen: {} }]);
    expect(c.isOpen(20500, 500)).toBe(false);
  });
});

describe('Act 3 containment: holds and regions', () => {
  it('the Dragonspine hold never touches Oldsmoke or Cinderreach', () => {
    for (const hold of [false, true]) {
      const flags = { ...PHASE_D, 'story.gate.a3': true, 'story.phase.dragonspineOpen': hold };
      const c = containment(flags);
      expect(c.isOpen(19500, 9500)).toBe(true); // Oldsmoke
      expect(c.isOpen(19000, 2500)).toBe(true); // Cinderreach
    }
    expect(REGION_INFO.oldsmoke.openWhen).toEqual({ all: ['story.d03.complete'] });
    expect(PHASE_HOLDS).toEqual({ dragonspine: ['story.phase.dragonspineOpen'] });
    for (const id of REGION_IDS) if (id !== 'dragonspine') expect(JSON.stringify(REGION_INFO[id].openWhen)).not.toContain('dragonspineOpen');
  });

  it('the Greyfen and the Dragonspine are built; the Ashen Waste and the Caldera stay reserved', () => {
    expect(REGION_INFO.greyfen.reserved).toBe(false);
    expect(REGION_INFO.dragonspine.reserved).toBe(false);
    expect(REGION_INFO['ashen-waste'].reserved).toBe(true);
    expect(REGION_INFO.caldera.reserved).toBe(true);
    expect(REGION_INFO.greyfen.track).toBe('peat-and-pitch');
    expect(REGION_INFO.dragonspine.track).toBe('wing-over-rime');
    expect(engineBox('greyfen')).toEqual(BOX.greyfen);
    expect(engineBox('dragonspine')).toEqual(BOX.dragonspine);
    expect(regionAt(3000, 12500)?.id).toBe('greyfen');
    expect(regionAt(13600, 15600)?.id).toBe('dragonspine');
    expect(regionAt(3000, 12500)?.levelBand).toEqual({ min: 18, max: 26 });
  });

  it('areas: the summit first, then the region-wide areas; outside Act 3 land there is none', () => {
    expect(areaAt(13600, 15600)).toBe('dragonspine-summit');
    expect(areaAt(SUMMIT_BOX.x0, SUMMIT_BOX.z0)).toBe('dragonspine-summit');
    expect(areaAt(SUMMIT_BOX.x0 - 0.01, SUMMIT_BOX.z0)).toBe('dragonspine-lower');
    expect(areaAt(13600, 16950)).toBe('dragonspine-lower'); // the strip between the summit and the world edge
    expect(areaAt(3000, 12500)).toBe('greyfen');
    expect(areaAt(0, 0)).toBeNull();
    expect(areaAt(NaN, 0)).toBeNull();
    expect(AREA_BANDS['dragonspine-summit'].band).toEqual({ min: 26, max: 28 });
    expect(SUMMIT_BOX.z1).toBeLessThan(WORLD_BOUNDS.maxZ);
  });
});

describe('Act 3 corridors: the 80 m rule', () => {
  it('every corridor centreline (shipped and Act 3) keeps 80 m from every reserved box', () => {
    const reserved = REGION_IDS.filter((id) => REGION_INFO[id].reserved);
    expect(reserved).toEqual(['ashen-waste', 'caldera']);
    for (const k of ALL_CORRIDORS) {
      for (const id of reserved) {
        const d = lineToBox(k.points, engineBox(id));
        expect(d, `${k.id} to ${id}: ${d.toFixed(0)} m`).toBeGreaterThanOrEqual(CORRIDOR_RESERVED_CLEARANCE);
      }
    }
  });

  it('the Fen Road clears the Waste corner (7000, 4500) by at least 80 m, and its 40 m edge stays outside the box', () => {
    const fen = ACT3_CORRIDORS.find((k) => k.id === 'corridor.fen-road')!;
    expect(distToLine(fen.points, 7000, 4500)).toBeGreaterThanOrEqual(80);
    const c = containment(STATES.phaseE);
    for (let x = BOX.waste.x0; x < BOX.waste.x0 + 300; x += 5) {
      for (let z = BOX.waste.z0; z < BOX.waste.z0 + 300; z += 5) expect(c.isOpen(x, z), `(${x}, ${z})`).toBe(false);
    }
  });

  it('the Fen Road opens with Act 3 and the Spine Road with the Dragonspine hold', () => {
    const fen = (f: Record<string, boolean>) => containment(f).isOpen(6450, 7000);
    expect(fen(PHASE_D)).toBe(false);
    expect(fen(STATES.phaseE)).toBe(true);
    const spine = (f: Record<string, boolean>) => containment(f).isOpen(8300, 12650);
    expect(spine(STATES.phaseE)).toBe(false);
    expect(spine(STATES.phaseF)).toBe(true);
  });
});

describe('the containment system: containment.pushed', () => {
  it('emits containment.pushed with from and to when it puts the player back', () => {
    const fc = createFakeCore();
    installContainment(fc.ctx, () => 0);
    Object.assign(fc.playerFeet, { x: 12000, y: 0, z: 9000 });
    fc.tick('intent');
    const pushed = fc.emitted.filter((e) => e.type === 'containment.pushed');
    expect(pushed).toHaveLength(1);
    const p = pushed[0].payload as { from: { x: number; z: number }; to: { x: number; z: number } };
    expect(p.from).toMatchObject({ x: 12000, z: 9000 });
    expect(p.to).toMatchObject({ x: fc.teleports[0].feet.x, z: fc.teleports[0].feet.z });
  });

  it('a player standing in the summit when a load leaves its flags unset is put back to the lower slopes', () => {
    const fc = createFakeCore();
    for (const [k, v] of Object.entries(STATES.phaseF)) fc.flags.set(k, v);
    installContainment(fc.ctx, () => 0);
    Object.assign(fc.playerFeet, { x: 13600, y: 600, z: 15600 });
    fc.tick('intent');
    expect(fc.teleports).toHaveLength(1);
    expect(areaAt(fc.teleports[0].feet.x, fc.teleports[0].feet.z)).toBe('dragonspine-lower');
    expect(fc.emitted.some((e) => e.type === 'containment.pushed')).toBe(true);
  });
});

describe('Act 3 fog faces (rules only; K1 places and registers them)', () => {
  it('every face has a condition and a toast string', () => {
    expect(ACT3_FOG_FACES.map((f) => f.id).sort()).toEqual(['fog.fen-waste', 'fog.spine-road', 'fog.summit', 'fog.wyrmwatch-waste']);
    const strings = { ...ACT2_WORLD_STRINGS_EN, ...ACT3_FOG_STRINGS_EN };
    for (const f of ACT3_FOG_FACES) {
      expect(f.openWhen, f.id).toBeDefined();
      expect(strings[f.toastKey], `${f.id} ${f.toastKey}`).toBeTruthy();
      for (const t of f.toastWhen ?? []) expect(strings[t.key], t.key).toBeTruthy();
    }
    expect(() => act3FogFace('fog.nope' as never)).toThrow(/unknown face/);
  });

  it('a face that is not registered is inert: never open, no trigger', () => {
    for (const f of ACT3_FOG_FACES) {
      expect(fogOpenById(f.id, stateOf(STATES.actComplete))).toBe(false);
      expect(fogWallForTrigger(`trg.${f.id}`)).toBeUndefined();
    }
  });

  it('conditions: the Spine Road face opens with the Dragonspine, the summit face with the summit, the Waste faces never', () => {
    const open = (id: Parameters<typeof act3FogFace>[0], f: Record<string, boolean>) => flagConditionHolds(act3FogFace(id).openWhen, stateOf(f));
    expect([STATES.phaseE, STATES.phaseF].map((f) => open('fog.spine-road', f))).toEqual([false, true]);
    expect([STATES.phaseF, STATES.actComplete].map((f) => open('fog.summit', f))).toEqual([false, true]);
    for (const f of Object.values(STATES)) {
      expect(open('fog.fen-waste', f)).toBe(false);
      expect(open('fog.wyrmwatch-waste', f)).toBe(false);
    }
  });

  it('the shipped Dragonspine face shows its gate text before Act 3 and its Phase E text after', () => {
    const wall = ACT2_FOG_WALLS.find((w) => w.id === 'fog.dragonspine')!;
    expect(fogToastKey(wall, stateOf(PHASE_D))).toBe('region.fog.dragonspine.toast');
    expect(fogToastKey(wall, stateOf(STATES.phaseE))).toBe('region.fog.dragonspine.phaseE.toast');
    const greyfen = ACT2_FOG_WALLS.find((w) => w.id === 'fog.greyfen')!;
    expect(fogToastKey(greyfen, stateOf(PHASE_D))).toBe('region.fog.greyfen.toast');
    const shut = ACT2_FOG_WALLS.find((w) => w.id === 'fog.caldera')!;
    expect(fogToastKey(shut, stateOf(STATES.actComplete))).toBe('region.fog.shut.toast');
  });
});

describe('held Act 2 fog faces never push an open Act 3 point (K7 found the Mere pushed 14 km)', () => {
  const anchorAt = (id: string) => {
    const a = ACT2_WORLD_LAYOUT.anchors.find((x) => x.id === id)!;
    return { x: a.x, z: a.z };
  };

  it('in every Act 3 state, every open point of the Greyfen, the Dragonspine and the Act 3 corridors is left alone', () => {
    const points: { x: number; z: number }[] = [];
    for (const b of [BOX.greyfen, BOX.dragonspine]) for (let x = b.x0 + 10; x < b.x1; x += 50) for (let z = b.z0 + 10; z < b.z1; z += 50) points.push({ x, z });
    for (const c of ACT3_CORRIDORS) {
      for (let i = 1; i < c.points.length; i++) {
        const [ax, az] = c.points[i - 1];
        const [bx, bz] = c.points[i];
        const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 20);
        for (let k = 0; k <= n; k++) points.push({ x: ax + ((bx - ax) * k) / n, z: az + ((bz - az) * k) / n });
      }
    }
    points.push({ x: 3150, z: 11900 }, { x: 3000, z: 12050 }); // the Mere ferry landing, the Mere shrine
    let checked = 0;
    for (const name of Object.keys(STATES) as StateName[]) {
      const flags = STATES[name];
      const c = new Containment(stateOf(flags), [DEAD_ROAD_CORRIDOR, ...ACT2_CORRIDORS, ...ACT3_CORRIDORS], ACT3_HOLES);
      for (const w of ACT2_FOG_WALLS) {
        if (flagConditionHolds(w.openWhen, stateOf(flags))) continue;
        const a = anchorAt(w.anchorId);
        for (const p of points) {
          if (!c.isOpen(p.x, p.z)) continue;
          checked++;
          expect(needsPushBackDef(w, p, a), `${name}: ${w.id} pushes (${p.x.toFixed(0)}, ${p.z.toFixed(0)})`).toBe(false);
        }
      }
    }
    expect(checked).toBeGreaterThan(10_000);
  });

  it('a held face still pushes just behind it, and not beyond PUSH_BACK_MAX_DEPTH', () => {
    const w = ACT2_FOG_WALLS.find((f) => f.id === 'fog.dragonspine')!;
    const a = anchorAt(w.anchorId);
    expect(needsPushBackDef(w, { x: a.x - 5, z: a.z }, a)).toBe(true);
    expect(needsPushBackDef(w, { x: a.x - PUSH_BACK_MAX_DEPTH, z: a.z }, a)).toBe(true);
    expect(needsPushBackDef(w, { x: a.x - PUSH_BACK_MAX_DEPTH - 1, z: a.z }, a)).toBe(false);
    expect(needsPushBackDef(w, { x: 3150, z: 11900 }, a)).toBe(false);
  });
});
