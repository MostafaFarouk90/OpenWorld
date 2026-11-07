// v0.8 item 3: Act 4 containment (the Ash Road corridor, the Waste behind its Phase G hold, the Caldera hole, L1's north
// band) and the Act 4 fog faces' rules, over a grid of Act 4 states.
import { beforeAll, describe, expect, it } from 'vitest';
import { flagConditionHolds } from '../core/flagCondition';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { ACT2_CORRIDORS, ACT2_FOG_WALLS, ACT2_WORLD_STRINGS_EN } from './act2/act2World';
import { ACT3_CORRIDORS, ACT3_HOLES, SUMMIT_OPEN_WHEN } from './act3Containment';
import { ACT3_FOG_WALLS } from './act3/act3World';
import { renderAnchorsDoc } from './anchorsDoc';
import {
  ACT4_CORRIDORS,
  ACT4_HOLES,
  ASHGATE_POINT,
  ASH_ROAD_CORRIDOR,
  CALDERA_HOLE,
  OCCUPIED_FLAG,
  WASTE_NORTH_BAND_HOLE,
} from './act4Containment';
import {
  ACT4_FOG_FACES,
  CITY_HELD_OPEN_WHEN,
  FOG_TOAST_ASHGATE_ONLY,
  FOG_TOAST_CALDERA_RIM,
  FOG_TOAST_WASTE_HILD,
  FOG_TOAST_WASTE_PHASE_G,
  HARROWMARK_GATE_FACES,
  cityGateFaceDef,
  ACT4_FOG_STRINGS_EN,
} from './act4Fog';
import { ACT4_FOG_FACE_ANCHORS, ACT4_FOG_FACE_POINTS, ACT4_FOG_WALLS } from './act4/act4World';
import { ACT4_WORLD_DOC, ACT4_WORLD_LAYOUT } from './act4/act4World.layout';
import { createAct4WorldPlugin } from './act4/act4World.plugin';
import { Containment, DEAD_ROAD_CORRIDOR } from './containment';
import { fogToastKey, fogWalls } from './fogWall';
import { regionAt } from './regionMask';
import { PHASE_HOLDS, engineBox } from './regions';
import { createFakeCore } from './testing/fakeCore';
import { readFileSync } from './testing/nodeFs';

type Flags = Record<string, boolean>;
const ACT3_DONE: Flags = {
  'story.gate.a2': true,
  'story.d03.complete': true,
  'story.gate.a3': true,
  ...Object.fromEntries((SUMMIT_OPEN_WHEN.all ?? []).map((k) => [k, true])),
  'story.gate.a4': true,
};
const STATES = {
  actStart: ACT3_DONE,
  occupied: { ...ACT3_DONE, [OCCUPIED_FLAG]: true },
  phaseG: { ...ACT3_DONE, [OCCUPIED_FLAG]: true, 'story.m41.complete': true, 'story.m42.started': true },
  phaseH: { ...ACT3_DONE, [OCCUPIED_FLAG]: true, 'story.m41.complete': true, 'story.m42.started': true, 'story.phase.wasteOpen': true },
  actComplete: {
    ...ACT3_DONE,
    [OCCUPIED_FLAG]: true,
    'story.m41.complete': true,
    'story.m42.started': true,
    'story.phase.wasteOpen': true,
    'story.m46.complete': true,
    'story.d08.complete': true,
    'story.gate.a5': true,
  },
} as const satisfies Record<string, Flags>;
const reader = (flags: Flags) => ({ getFlag: (k: string) => flags[k] });
function containment(flags: Flags): Containment {
  const c = new Containment(reader(flags), [DEAD_ROAD_CORRIDOR, ...ACT3_CORRIDORS, ...ACT4_CORRIDORS], [...ACT3_HOLES, ...ACT4_HOLES]);
  for (const def of ACT2_CORRIDORS) c.addCorridor(def);
  return c;
}
const WASTE = engineBox('ashen-waste');
const CALDERA = engineBox('caldera');
const roadMid = (i: number) => {
  const [ax, az] = ASH_ROAD_CORRIDOR.points[i];
  const [bx, bz] = ASH_ROAD_CORRIDOR.points[i + 1];
  return { x: (ax + bx) / 2, z: (az + bz) / 2 };
};

describe('Act 4 containment over the states', () => {
  it('the Ash Road is closed until M41, then open in every later state', () => {
    for (const [name, flags] of Object.entries(STATES)) {
      const open = Boolean((flags as Flags)['story.m41.complete']);
      const c = containment(flags);
      for (let i = 0; i < ASH_ROAD_CORRIDOR.points.length - 1; i++) {
        const p = roadMid(i);
        // The first point lies inside Harrowmark (always open); test the stretch north of the city's box.
        if (p.z < 4000) continue;
        expect(c.isOpen(p.x, p.z), `${name} road ${i}`).toBe(open);
      }
    }
  });

  it('the Waste opens only in Phase H (M42 accepted and the Phase G hold retired), never on M42 alone', () => {
    expect(PHASE_HOLDS['ashen-waste']).toEqual(['story.phase.wasteOpen']);
    const deep = { x: 9000, z: 7000 };
    for (const [name, flags] of Object.entries(STATES)) {
      const open = Boolean((flags as Flags)['story.phase.wasteOpen'] && (flags as Flags)['story.m42.started']);
      expect(containment(flags).isOpen(deep.x, deep.z), name).toBe(open);
    }
    expect(containment({ ...STATES.phaseG, 'story.phase.wasteOpen': false }).isOpen(deep.x, deep.z)).toBe(false);
  });

  it('the Caldera stays a closed hole in every Act 4 state, with its rim ground open around it in Phase H', () => {
    expect(CALDERA_HOLE.box).toEqual(CALDERA);
    for (const [name, flags] of Object.entries(STATES)) {
      // v0.9: the Act 4 ending writes `story.gate.a5`, which opens the Caldera (act5Containment.test.ts has that grid).
      if (name === 'actComplete') continue;
      const c = containment(flags);
      expect(c.isOpen((CALDERA.x0 + CALDERA.x1) / 2, (CALDERA.z0 + CALDERA.z1) / 2), name).toBe(false);
      expect(flagConditionHolds(CALDERA_HOLE.openWhen, reader(flags)), name).toBe(false);
    }
    const h = containment(STATES.phaseH);
    expect(h.isOpen(CALDERA.x0 - 5, (CALDERA.z0 + CALDERA.z1) / 2)).toBe(CALDERA.x0 - 5 >= WASTE.x0);
    // A player inside the Caldera is placed back on Waste ground.
    const back = h.nearestOpen((CALDERA.x0 + CALDERA.x1) / 2, CALDERA.z0 + 10);
    expect(h.isOpen(back.x, back.z)).toBe(true);
    // v0.9: the Caldera is built, so regionAt names it (containment, not the region table, keeps Act 4 out).
    expect(regionAt((CALDERA.x0 + CALDERA.x1) / 2, (CALDERA.z0 + CALDERA.z1) / 2)?.id).toBe('caldera');
    const done = containment(STATES.actComplete);
    expect(flagConditionHolds(CALDERA_HOLE.openWhen, reader(STATES.actComplete))).toBe(true);
    expect(done.isOpen(11000, 6750)).toBe(true);
  });

  it("L1's north band: the Waste's north edge is closed both ways in every state, so the only way in is Ashgate", () => {
    expect(WASTE_NORTH_BAND_HOLE.box).toEqual({ x0: 10000, z0: 10900, x1: 15000, z1: 11000 });
    for (const [name, flags] of Object.entries(STATES)) {
      const c = containment(flags);
      for (const x of [10010, 10750, 11500, 13250, 14990]) expect(c.isOpen(x, 10950), `${name} (${x})`).toBe(false);
    }
    const h = containment(STATES.phaseH);
    // Dragonspine ground north of the band and Waste ground south of it stay open; walking across is pushed back.
    expect(h.isOpen(10750, 11010)).toBe(true);
    expect(h.isOpen(10750, 10890)).toBe(true);
    const fromNorth = h.nearestOpen(10750, 10990);
    expect(fromNorth.z).toBeGreaterThanOrEqual(11000);
  });

  it('the Ash Road ends at Ashgate, just south of the Waste, and keeps 80 m from the Caldera', () => {
    const end = ASH_ROAD_CORRIDOR.points[ASH_ROAD_CORRIDOR.points.length - 1];
    expect(end).toEqual([ASHGATE_POINT.x, ASHGATE_POINT.z]);
    expect(ASHGATE_POINT.z).toBeLessThan(WASTE.z0);
    for (const [x, z] of ASH_ROAD_CORRIDOR.points) {
      const d = Math.hypot(Math.max(CALDERA.x0 - x, 0, x - CALDERA.x1), Math.max(CALDERA.z0 - z, 0, z - CALDERA.z1));
      expect(d).toBeGreaterThanOrEqual(80);
    }
  });
});

describe('Act 4 fog faces', () => {
  const faceOpen = (id: string, flags: Flags) => flagConditionHolds(ACT2_FOG_WALLS.find((w) => w.id === id)!.openWhen, reader(flags));

  it('fog.ashen-waste opens on M41; the shipped never-open Waste faces say "only Ashgate" from the Act 4 gate', () => {
    expect(faceOpen('fog.ashen-waste', STATES.occupied)).toBe(false);
    expect(faceOpen('fog.ashen-waste', STATES.phaseG)).toBe(true);
    for (const id of ['fog.caldera', 'fog.wyrmwatch-waste', 'fog.fen-waste']) {
      const def = [...ACT2_FOG_WALLS, ...ACT3_FOG_WALLS].find((w) => w.id === id)!;
      expect(def, id).toBeTruthy();
      for (const flags of Object.values(STATES)) expect(flagConditionHolds(def.openWhen, reader(flags)), id).toBe(false);
      expect(fogToastKey(def, reader(STATES.phaseH)), id).toBe(FOG_TOAST_ASHGATE_ONLY);
      expect(fogToastKey(def, reader({ 'story.gate.a3': true })), id).not.toBe(FOG_TOAST_ASHGATE_ONLY);
    }
  });

  it('fog.waste-edge: Hild before M41, the "not yet open" text in Phase G, open in Phase H', () => {
    const def = ACT4_FOG_WALLS.find((w) => w.id === 'fog.waste-edge')!;
    expect(fogToastKey(def, reader(STATES.occupied))).toBe(FOG_TOAST_WASTE_HILD);
    expect(fogToastKey(def, reader(STATES.phaseG))).toBe(FOG_TOAST_WASTE_PHASE_G);
    expect(flagConditionHolds(def.openWhen, reader(STATES.phaseG))).toBe(false);
    expect(flagConditionHolds(def.openWhen, reader(STATES.phaseH))).toBe(true);
  });

  it('the Caldera rim and the north face never open; every new toast has English text', () => {
    for (const f of ACT4_FOG_FACES.filter((x) => x.id !== 'fog.waste-edge')) {
      for (const flags of Object.values(STATES)) expect(flagConditionHolds(f.openWhen, reader(flags)), f.id).toBe(false);
    }
    expect(ACT4_FOG_FACES.find((f) => f.id === 'fog.caldera-rim.s')!.toastKey).toBe(FOG_TOAST_CALDERA_RIM);
    for (const f of [...ACT4_FOG_FACES, ...HARROWMARK_GATE_FACES]) {
      expect(ACT2_WORLD_STRINGS_EN[f.toastKey], f.toastKey).toBeTruthy();
      for (const t of ('toastWhen' in f ? f.toastWhen : undefined) ?? []) expect(ACT2_WORLD_STRINGS_EN[t.key], t.key).toBeTruthy();
    }
  });

  it('the rim faces stand on Waste ground outside the Caldera, blocking toward it', () => {
    const h = containment(STATES.phaseH);
    for (const d of ['n', 'e', 's', 'w'] as const) {
      const id = `fog.caldera-rim.${d}` as const;
      const p = ACT4_FOG_FACE_POINTS[id];
      const w = ACT4_FOG_WALLS.find((x) => x.id === id)!;
      const inside = (CALDERA.x0 <= p.x && p.x < CALDERA.x1 && CALDERA.z0 <= p.z && p.z < CALDERA.z1);
      expect(inside, id).toBe(false);
      // One step toward the blocked side moves toward the Caldera's centre.
      const step = w.axis === 'x' ? { x: p.x + w.blockedSide * 10, z: p.z } : { x: p.x, z: p.z + w.blockedSide * 10 };
      const cx = (CALDERA.x0 + CALDERA.x1) / 2;
      const cz = (CALDERA.z0 + CALDERA.z1) / 2;
      expect(Math.hypot(step.x - cx, step.z - cz), id).toBeLessThan(Math.hypot(p.x - cx, p.z - cz));
      // The south face (Rimfoot) lies in the open Waste.
      if (d === 's') expect(h.isOpen(p.x, p.z)).toBe(true);
    }
  });

  it("the occupied city's gate faces close from M38; cityGateFaceDef builds a full face for L2", () => {
    expect(flagConditionHolds(CITY_HELD_OPEN_WHEN, reader(STATES.actStart))).toBe(true);
    expect(flagConditionHolds(CITY_HELD_OPEN_WHEN, reader(STATES.occupied))).toBe(false);
    expect(new Set(HARROWMARK_GATE_FACES.map((f) => f.anchorId)).size).toBe(HARROWMARK_GATE_FACES.length);
    const def = cityGateFaceDef(HARROWMARK_GATE_FACES[0].gate, { axis: 'x', halfLength: 8, blockedSide: -1 });
    expect(def.anchorId).toBe(`harrowmark.a4.gate.${HARROWMARK_GATE_FACES[0].gate}.face`);
    expect(def.halfLength).toBe(8);
    expect(() => cityGateFaceDef('nowhere' as never, { axis: 'x', halfLength: 8, blockedSide: 1 })).toThrow();
  });
});

describe('ACT4_WORLD_ANCHORS.md and the act4-world plugin', () => {
  it('matches the layout (regenerate with npx vite-node tools/gen-region-docs.ts), one anchor per face', () => {
    expect(readFileSync('src/region/act4/ACT4_WORLD_ANCHORS.md', 'utf8')).toBe(renderAnchorsDoc(ACT4_WORLD_LAYOUT, ACT4_WORLD_DOC));
    const ids = ACT4_WORLD_LAYOUT.anchors.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const w of ACT4_FOG_WALLS) expect(ids).toContain(w.anchorId);
    expect(Object.values(ACT4_FOG_FACE_ANCHORS).every((a) => a.startsWith('ashroad.') || a.startsWith('waste.'))).toBe(true);
  });

  let physics: PhysicsWorld;
  beforeAll(async () => {
    physics = new PhysicsWorld();
    await physics.init();
  });

  it('registers the faces and anchors, closed before Phase H; dispose removes them all', () => {
    const fc = createFakeCore();
    fc.useRapier(physics.rapier);
    for (const [k, v] of Object.entries(STATES.phaseG)) fc.flags.set(k, v);
    const plugin = createAct4WorldPlugin({ heightAt: () => 10 });
    plugin.setup(fc.ctx);
    for (const w of ACT4_FOG_WALLS) {
      expect(fogWalls()).toContain(w);
      expect(fc.triggers.has(`trg.${w.id}`), w.id).toBe(true);
    }
    plugin.dispose?.();
    for (const w of ACT4_FOG_WALLS) expect(fogWalls()).not.toContain(w);
    expect(fc.triggers.size).toBe(0);
    expect(fc.anchors.size).toBe(0);
  });

  it('in Phase H the Waste edge face is down and the rim stands', () => {
    const fc = createFakeCore();
    fc.useRapier(physics.rapier);
    for (const [k, v] of Object.entries(STATES.phaseH)) fc.flags.set(k, v);
    const plugin = createAct4WorldPlugin({ heightAt: () => 10 });
    plugin.setup(fc.ctx);
    expect(fc.triggers.has('trg.fog.waste-edge')).toBe(false);
    expect(fc.triggers.has('trg.fog.caldera-rim.s')).toBe(true);
    plugin.dispose?.();
  });
});

describe('Act 4 fog text (ruling C)', () => {
  it('never dates itself: the Phase G toast matches the card ("the way in is not yet open")', () => {
    expect(ACT4_FOG_STRINGS_EN[FOG_TOAST_WASTE_PHASE_G]).toContain('the way in is not yet open');
    for (const [k, v] of Object.entries(ACT4_FOG_STRINGS_EN)) expect(v, k).not.toMatch(/later update/i);
  });
});
