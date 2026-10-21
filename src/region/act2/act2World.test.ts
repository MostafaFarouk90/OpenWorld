// Act 2 thread A1: the corridors and fog wall faces under the four flag states (Act 1, Phase C, D03 done with the hold
// still unset, Phase D), the plugin's wiring, the stacks' stand-in maths, the road ribbons and the anchors doc.
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { flagConditionHolds, type FlagCondition } from '../../core/flagCondition';
import { MOUNT_TUNING } from '../../mount/tuning';
import { PhysicsWorld } from '../../physics/PhysicsWorld';
import { ACT2_PLATEAUS } from '../../terrain/shape/act2';
import { roadLength, roadPoint } from '../../terrain/shape/roadPoint';
import { renderAnchorsDoc } from '../anchorsDoc';
import { Containment } from '../containment';
import { distanceToWall, fogWallForTrigger, fogWalls, needsPushBackDef, PUSH_BACK_PAST } from '../fogWall';
import { PHASE_HOLDS, REGION_INFO, engineBox } from '../regions';
import { readFileSync } from '../testing/nodeFs';
import { createFakeCore } from '../testing/fakeCore';
import { drawnWidth, pieces } from './act2Roads';
import {
  ACT2_CORRIDORS,
  ACT2_FOG_WALLS,
  ACT2_ROAD_STRIPS,
  ACT2_WORLD_STRINGS_EN,
  CINDER_ROAD_CORRIDOR,
  M11_CORRIDOR,
  M11_STATION_ARC,
  OLDSMOKE_PASS_CORRIDOR,
  WALL_CULL,
} from './act2World';
import { ACT2_WORLD_DOC, ACT2_WORLD_LAYOUT } from './act2World.layout';
import { ACT2_STACKS_SYSTEM_ID, createAct2WorldPlugin } from './act2World.plugin';
import { hazeFor, PROXY_FAR_FRACTION, stackPlacement, STACKS_ORIGIN } from './oldsmokeStacks';
import { sampleStations } from '../ribbon';

type Flags = Record<string, boolean>;
const ACT1: Flags = {};
const PHASE_C: Flags = { 'story.gate.a2': true };
const D03_HOLD_UNSET: Flags = { 'story.gate.a2': true, 'story.d03.complete': true };
const PHASE_D: Flags = { 'story.gate.a2': true, 'story.d03.complete': true, 'story.phase.oldsmokeOpen': true };

const reader = (flags: Flags) => ({ getFlag: (k: string) => flags[k] });
function containment(flags: Flags): Containment {
  const c = new Containment(reader(flags));
  for (const def of ACT2_CORRIDORS) c.addCorridor(def);
  return c;
}

function along(id: Parameters<typeof roadPoint>[0], step = 10): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  const len = roadLength(id);
  for (let s = 0; s <= len; s += step) out.push(roadPoint(id, s));
  return out;
}

const anchor = (id: string) => {
  const a = ACT2_WORLD_LAYOUT.anchors.find((x) => x.id === id);
  if (!a) throw new Error(`no anchor ${id}`);
  return a;
};

describe('the Act 2 corridors', () => {
  it('open on the regions’ own conditions, so the Phase C hold applies and A16 retires it in one place', () => {
    expect(CINDER_ROAD_CORRIDOR.openWhen).toBe(REGION_INFO.cinderreach.openWhen);
    expect(M11_CORRIDOR.openWhen).toBe(REGION_INFO.cinderreach.openWhen);
    expect(OLDSMOKE_PASS_CORRIDOR.openWhen).toBe(REGION_INFO.oldsmoke.openWhen);
  });

  it('Act 1: the Cinder Road is open only inside Harrowmark; past x 10500 the push-back holds', () => {
    const c = containment(ACT1);
    for (const p of along('cinder-road')) expect(c.isOpen(p.x, p.z), `(${p.x}, ${p.z})`).toBe(p.x < engineBox('harrowmark').x1);
  });

  it('Phase C: a ride along the whole Cinder Road and every branch stays open, every 10 m', () => {
    const c = containment(PHASE_C);
    for (const id of ['cinder-road', 'stonefold-road', 'fellwalker-track', 'hushed-anvil-path', 'scorchhold-road'] as const) {
      for (const p of along(id)) expect(c.isOpen(p.x, p.z), `${id} (${p.x.toFixed(0)}, ${p.z.toFixed(0)})`).toBe(true);
    }
  });

  it('the joins overlap by at least 50 m: x 10500 and x 15500 in Phase C, z 5500 and z 7000 in Phase D', () => {
    const c = containment(PHASE_C);
    for (const p of along('cinder-road', 5)) if (Math.abs(p.x - 10500) <= 60 || Math.abs(p.x - 15500) <= 60) expect(c.isOpen(p.x, p.z)).toBe(true);
    const d = containment(PHASE_D);
    for (const p of along('oldsmoke-pass', 5)) {
      expect(d.isOpen(p.x, p.z), `(${p.x.toFixed(0)}, ${p.z.toFixed(0)})`).toBe(true);
      if (Math.abs(p.z - 5500) <= 60 || Math.abs(p.z - 7000) <= 60) expect(d.isOpen(p.x, p.z)).toBe(true);
    }
    // The corridor itself reaches 50 m or more into each box it joins.
    const [sx, sz] = OLDSMOKE_PASS_CORRIDOR.points[0];
    const [ex, ez] = OLDSMOKE_PASS_CORRIDOR.points[OLDSMOKE_PASS_CORRIDOR.points.length - 1];
    expect(engineBox('cinderreach').z1 - sz).toBeGreaterThanOrEqual(50);
    expect(ez - engineBox('oldsmoke').z0).toBeGreaterThanOrEqual(50);
    expect(sx).toBeGreaterThan(0);
    expect(ex).toBeGreaterThan(0);
    const cr = CINDER_ROAD_CORRIDOR.points;
    expect(cr[cr.length - 1][0] - engineBox('cinderreach').x0).toBeGreaterThanOrEqual(50);
    expect(engineBox('harrowmark').x1 - cr[0][0]).toBeGreaterThanOrEqual(50);
  });

  it('the pass is closed in Phase C and with D03 done but the hold unset; open in Phase D', () => {
    const inGap = along('oldsmoke-pass').filter((p) => p.z > engineBox('cinderreach').z1 + 5 && p.z < engineBox('oldsmoke').z0 - 5);
    expect(inGap.length).toBeGreaterThan(50);
    for (const flags of [ACT1, PHASE_C, D03_HOLD_UNSET]) {
      const c = containment(flags);
      for (const p of inGap) expect(c.isOpen(p.x, p.z)).toBe(false);
    }
    const d = containment(PHASE_D);
    for (const p of inGap) expect(d.isOpen(p.x, p.z)).toBe(true);
  });

  it('with the Phase C hold retired (the list emptied), D03 alone opens the pass', () => {
    const retired: FlagCondition = { all: (REGION_INFO.oldsmoke.openWhen.all ?? []).filter((k) => !PHASE_HOLDS.includes(k)) };
    expect(retired.all).toEqual(['story.d03.complete']);
    expect(flagConditionHolds(retired, reader(D03_HOLD_UNSET))).toBe(true);
    expect(flagConditionHolds(retired, reader(PHASE_C))).toBe(false);
  });

  it('a step 200 m off the road toward the Ashen Waste is pushed back onto the corridor', () => {
    const c = containment(PHASE_C);
    const p = roadPoint('cinder-road', 4000);
    const off = { x: p.x, z: p.z + 200 };
    expect(c.isOpen(off.x, off.z)).toBe(false);
    const q = c.nearestOpen(off.x, off.z);
    expect(c.isOpen(q.x, q.z)).toBe(true);
    // Onto the corridor's edge: within its 40 m half width of the road, and closer to the road than before.
    let toRoad = Infinity;
    for (let s = 3000; s <= 5000; s += 2) {
      const r = roadPoint('cinder-road', s);
      toRoad = Math.min(toRoad, Math.hypot(q.x - r.x, q.z - r.z));
    }
    expect(toRoad).toBeLessThanOrEqual(40.5);
  });

  it('is 60 m wide for 100 m either side of the M11 station and 40 m elsewhere', () => {
    const c = containment(PHASE_C);
    const at = roadPoint('cinder-road', M11_STATION_ARC, 55);
    expect(c.isOpen(at.x, at.z)).toBe(true);
    const away = roadPoint('cinder-road', M11_STATION_ARC - 400, 55);
    expect(c.isOpen(away.x, away.z)).toBe(false);
    expect(Math.hypot(anchor('cinderroad.m11-station').x - roadPoint('cinder-road', M11_STATION_ARC).x, 0)).toBeLessThan(0.01);
  });

  it('registering twice throws (duplicate ids), and the undo removes a corridor', () => {
    const c = new Containment(reader(PHASE_C));
    const undo = c.addCorridor(CINDER_ROAD_CORRIDOR);
    expect(() => c.addCorridor(CINDER_ROAD_CORRIDOR)).toThrow(/already registered/);
    const p = roadPoint('cinder-road', 3000);
    expect(c.isOpen(p.x, p.z)).toBe(true);
    undo();
    expect(c.isOpen(p.x, p.z)).toBe(false);
  });
});

describe('the Act 2 fog walls', () => {
  /** The first state in which each wall stands where a player can reach it. */
  const firstState: Record<string, Flags> = {
    'fog.cinder-road': ACT1,
    'fog.oldsmoke-pass': PHASE_C,
    'fog.greyfen': ACT1,
    'fog.ashen-waste': ACT1,
    'fog.dragonspine': PHASE_D,
    'fog.caldera': PHASE_C,
  };

  it('has six faces with their own toasts and text, never the Dead Road’s', () => {
    expect(ACT2_FOG_WALLS.map((w) => w.id).sort()).toEqual(Object.keys(firstState).sort());
    for (const w of ACT2_FOG_WALLS) {
      expect(w.toastKey).not.toBe('hud.fog.toast');
      expect(ACT2_WORLD_STRINGS_EN[w.toastKey]).toMatch(/\w/);
    }
  });

  it('opens on the right states: the Cinder Road on story.gate.a2, the pass only in Phase D, the faces never', () => {
    const open = (id: string, flags: Flags) => flagConditionHolds(ACT2_FOG_WALLS.find((w) => w.id === id)!.openWhen, reader(flags));
    expect([ACT1, PHASE_C, D03_HOLD_UNSET, PHASE_D].map((f) => open('fog.cinder-road', f))).toEqual([false, true, true, true]);
    expect([ACT1, PHASE_C, D03_HOLD_UNSET, PHASE_D].map((f) => open('fog.oldsmoke-pass', f))).toEqual([false, false, false, true]);
    for (const id of ['fog.greyfen', 'fog.ashen-waste', 'fog.dragonspine', 'fog.caldera']) {
      expect(open(id, { ...PHASE_D, 'story.gate.a3': true })).toBe(false);
    }
  });

  it('each wall stands at least 30 m inside the open area of the first state in which it stands', () => {
    for (const w of ACT2_FOG_WALLS) {
      const a = anchor(w.anchorId);
      const c = containment(firstState[w.id]);
      expect(c.isOpen(a.x, a.z), w.id).toBe(true);
      // 30 m back from the wall on its open side is open too.
      const back = w.axis === 'x' ? { x: a.x - 30 * w.blockedSide, z: a.z } : { x: a.x, z: a.z - 30 * w.blockedSide };
      expect(c.isOpen(back.x, back.z), w.id).toBe(true);
    }
  });

  it('while a wall stands, its push band covers no open plateau, road or cinderroad anchor (its own road beyond it aside)', () => {
    const points: { what: string; x: number; z: number }[] = [];
    for (const p of ACT2_PLATEAUS) {
      const b = p.box;
      for (const [x, z] of [[b.minX, b.minZ], [b.maxX, b.minZ], [b.minX, b.maxZ], [b.maxX, b.maxZ], [(b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2]]) points.push({ what: p.id, x, z });
    }
    for (const road of ACT2_ROAD_STRIPS) for (const s of sampleStations(road.points, 20)) points.push({ what: road.id, x: s.x, z: s.z });
    for (const a of ACT2_WORLD_LAYOUT.anchors) points.push({ what: a.id, x: a.x, z: a.z });
    let checked = 0;
    for (const flags of [ACT1, PHASE_C, D03_HOLD_UNSET, PHASE_D]) {
      const c = containment(flags);
      for (const w of ACT2_FOG_WALLS) {
        if (flagConditionHolds(w.openWhen, reader(flags))) continue;
        const a = anchor(w.anchorId);
        for (const p of points) {
          if (p.what === w.anchorId || !c.isOpen(p.x, p.z)) continue;
          // A wall across its own road holds that road beyond it: its job.
          if ((w.id === 'fog.cinder-road' && p.what === 'cinder-road') || (w.id === 'fog.oldsmoke-pass' && p.what === 'oldsmoke-pass')) continue;
          checked++;
          expect(needsPushBackDef(w, p, a), `${w.id} on ${p.what} at (${p.x.toFixed(0)}, ${p.z.toFixed(0)})`).toBe(false);
        }
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });

  it('a mounted push-back at every face is a short move, under the mount’s ride break', () => {
    for (const w of ACT2_FOG_WALLS) {
      const a = anchor(w.anchorId);
      // A gallop tick (12 m/s at 60 Hz) past the push threshold.
      const past = PUSH_BACK_PAST + MOUNT_TUNING.gallopSpeed / 60;
      const feet = w.axis === 'x' ? { x: a.x + past * w.blockedSide, z: a.z } : { x: a.x, z: a.z + past * w.blockedSide };
      expect(needsPushBackDef(w, feet, a)).toBe(true);
      const to = w.pushBackTo ?? 4;
      const back = w.axis === 'x' ? { x: a.x - to * w.blockedSide, z: feet.z } : { x: feet.x, z: a.z - to * w.blockedSide };
      expect(Math.hypot(back.x - feet.x, back.z - feet.z), w.id).toBeLessThan(MOUNT_TUNING.teleportJump);
    }
  });
});

describe('the act2-world plugin', () => {
  let physics: PhysicsWorld;
  beforeAll(async () => {
    physics = new PhysicsWorld();
    await physics.init();
  });

  function rig(flags: Flags) {
    const fc = createFakeCore();
    fc.useRapier(physics.rapier);
    for (const [k, v] of Object.entries(flags)) fc.flags.set(k, v);
    const c = new Containment(fc.ctx.state);
    fc.services.set('containment', c);
    const plugin = createAct2WorldPlugin({ heightAt: () => 10 });
    plugin.setup(fc.ctx);
    return { fc, c, plugin };
  }

  it('defines the anchors, adds the corridors, strings and walls, and raises the closed ones (Act 1)', () => {
    const { fc, c, plugin } = rig(ACT1);
    for (const a of ACT2_WORLD_LAYOUT.anchors) expect(fc.anchors.has(a.id), a.id).toBe(true);
    expect(fc.anchors.get('cinderroad.start')!.position.y).toBe(10);
    for (const k of Object.keys(ACT2_WORLD_STRINGS_EN)) expect(fc.strings.has(k)).toBe(true);
    for (const w of ACT2_FOG_WALLS) {
      expect(fogWalls()).toContain(w);
      expect(fogWallForTrigger(`trg.${w.id}`)).toBe(w);
      // Every Act 2 wall stands in Act 1.
      expect(fc.triggers.has(`trg.${w.id}`), w.id).toBe(true);
    }
    expect(fc.systems.has(ACT2_STACKS_SYSTEM_ID)).toBe(true);
    // The corridor is registered (closed in Act 1).
    expect(() => c.addCorridor(CINDER_ROAD_CORRIDOR)).toThrow(/already registered/);
    plugin.dispose?.();
    expect(fogWalls().some((w) => w.id.startsWith('fog.cinder'))).toBe(false);
    expect(fc.triggers.size).toBe(0);
    expect(fc.anchors.size).toBe(0);
    expect(fc.systems.has(ACT2_STACKS_SYSTEM_ID)).toBe(false);
    c.addCorridor(CINDER_ROAD_CORRIDOR);
  });

  it('Phase D: the Cinder Road and pass walls are down, the shut faces stand; a load back to Act 1 raises them again', () => {
    const { fc, plugin } = rig(PHASE_D);
    expect(fc.triggers.has('trg.fog.cinder-road')).toBe(false);
    expect(fc.triggers.has('trg.fog.oldsmoke-pass')).toBe(false);
    for (const id of ['fog.greyfen', 'fog.ashen-waste', 'fog.dragonspine', 'fog.caldera']) expect(fc.triggers.has(`trg.${id}`)).toBe(true);
    fc.flags.clear();
    fc.fire('save.loaded', {});
    expect(fc.triggers.has('trg.fog.cinder-road')).toBe(true);
    expect(fc.triggers.has('trg.fog.oldsmoke-pass')).toBe(true);
    plugin.dispose?.();
  });

  it('a standing wall pushes a player back, but not inside an interior or while a save loads', () => {
    const { fc, plugin } = rig(ACT1);
    const a = fc.anchors.get('cinderroad.fog.cinder-road')!.position;
    Object.assign(fc.playerFeet, { x: a.x + 3, y: 10, z: a.z });
    fc.services.set('interiors', { current: 'some.room' });
    fc.tick('intent');
    expect(fc.teleports).toHaveLength(0);
    fc.services.set('interiors', { current: null, transitioning: true });
    fc.tick('intent');
    expect(fc.teleports).toHaveLength(0);
    fc.services.set('interiors', { current: null, transitioning: false });
    fc.services.set('save', { loading: true });
    fc.tick('intent');
    expect(fc.teleports).toHaveLength(0);
    fc.services.set('save', { loading: false });
    fc.tick('intent');
    expect(fc.teleports).toHaveLength(1);
    expect(fc.teleports[0].feet.x).toBeCloseTo(a.x - 1, 6);
    plugin.dispose?.();
  });

  it('hides a wall and stills its ash beyond the cull distance, and shows it again on the way back', () => {
    const { fc, plugin } = rig(ACT1);
    const a = fc.anchors.get('cinderroad.fog.cinder-road')!.position;
    const wallGroup = () => fc.scene.getObjectByName('fog-wall:fog.cinder-road') ?? null;
    Object.assign(fc.playerFeet, { x: a.x - WALL_CULL - 50, y: 10, z: a.z });
    fc.tick('intent');
    const far = wallGroup();
    expect(far).not.toBeNull();
    expect(far!.visible).toBe(false);
    Object.assign(fc.playerFeet, { x: a.x - 100, y: 10, z: a.z });
    fc.tick('intent');
    expect(wallGroup()!.visible).toBe(true);
    // The slice wall has no cull and the Act 2 walls all do.
    for (const w of ACT2_FOG_WALLS) expect(w.cullBeyond).toBe(WALL_CULL);
    plugin.dispose?.();
  });

  it('measures distance to a wall’s segment, past its ends too', () => {
    const def = ACT2_FOG_WALLS[0];
    const at = { x: 100, z: 200 };
    expect(distanceToWall(def, { x: 130, z: 200 }, at)).toBeCloseTo(30, 9);
    expect(distanceToWall(def, { x: 100, z: 200 + def.halfLength + 40 }, at)).toBeCloseTo(40, 9);
    expect(distanceToWall(def, { x: 130, z: 200 - def.halfLength - 40 }, at)).toBeCloseTo(50, 9);
  });

  it('fails cleanly without the containment service', () => {
    const fc = createFakeCore();
    fc.useRapier(physics.rapier);
    const plugin = createAct2WorldPlugin({ heightAt: () => 0 });
    expect(() => plugin.setup(fc.ctx)).toThrow(/containment/);
    expect(fc.anchors.size).toBe(0);
    expect(fc.strings.size).toBe(0);
  });

  it('hides the stacks inside an interior and shows them outside', () => {
    const { fc, plugin } = rig(PHASE_C);
    const cam = new THREE.PerspectiveCamera(60, 1, 0.1, 5040);
    cam.position.set(15000, 40, 3000);
    (fc.ctx as { camera: THREE.PerspectiveCamera | null }).camera = cam;
    const sys = fc.systems.get(ACT2_STACKS_SYSTEM_ID)!;
    const group = fc.scene.getObjectByName('oldsmoke-stacks')!;
    sys.render!(1, 1 / 60, fc.ctx);
    expect(group.visible).toBe(true);
    expect(group.scale.x).toBeLessThan(1);
    fc.services.set('interiors', { current: 'room' });
    sys.render!(1, 1 / 60, fc.ctx);
    expect(group.visible).toBe(false);
    plugin.dispose?.();
    expect(fc.scene.getObjectByName('oldsmoke-stacks')).toBeUndefined();
  });
});

describe('the Oldsmoke stacks stand-in', () => {
  const cam = { x: 15000, y: 40, z: 3000 };

  it('draws at the real place within 0.9 of the far plane', () => {
    const near = { x: STACKS_ORIGIN.x - 1000, y: 20, z: STACKS_ORIGIN.z - 1000 };
    const p = stackPlacement(near, STACKS_ORIGIN, 5040);
    expect(p).toMatchObject({ x: STACKS_ORIGIN.x, y: STACKS_ORIGIN.y, z: STACKS_ORIGIN.z, scale: 1 });
  });

  it('beyond it, sits on the true line of sight at 0.9 x far with the same angular size (medium and low quality)', () => {
    for (const far of [5040, 3360]) {
      const p = stackPlacement(cam, STACKS_ORIGIN, far);
      const d = Math.hypot(p.x - cam.x, p.y - cam.y, p.z - cam.z);
      expect(d).toBeCloseTo(PROXY_FAR_FRACTION * far, 6);
      // Same direction.
      const real = Math.hypot(STACKS_ORIGIN.x - cam.x, STACKS_ORIGIN.y - cam.y, STACKS_ORIGIN.z - cam.z);
      expect((p.x - cam.x) / d).toBeCloseTo((STACKS_ORIGIN.x - cam.x) / real, 9);
      expect((p.z - cam.z) / d).toBeCloseTo((STACKS_ORIGIN.z - cam.z) / real, 9);
      // Angular size: scale over distance is 1 over the real distance.
      expect(p.scale / d).toBeCloseTo(1 / real, 12);
      expect(p.distance).toBeCloseTo(real, 6);
    }
  });

  it('takes more of the sky with distance, never more than 0.75, none near', () => {
    expect(hazeFor(0)).toBe(0);
    expect(hazeFor(5000)).toBeGreaterThan(hazeFor(2000));
    expect(hazeFor(50000)).toBeCloseTo(0.75, 9);
  });
});

describe('the road ribbons', () => {
  it('cut each road into overlapping pieces that cover every station', () => {
    const st = sampleStations(ACT2_ROAD_STRIPS[0].points, 3);
    const ps = pieces(st, 200);
    expect(ps[0][0]).toBe(st[0]);
    expect(ps[ps.length - 1][ps[ps.length - 1].length - 1]).toBe(st[st.length - 1]);
    for (let i = 1; i < ps.length; i++) expect(ps[i][0]).toBe(ps[i - 1][ps[i - 1].length - 1]);
    expect(drawnWidth(6)).toBe(6);
    expect(drawnWidth(2.5)).toBe(2.5);
    expect(drawnWidth(1)).toBe(2.5);
  });
});

describe('ACT2_WORLD_ANCHORS.md', () => {
  it('matches the layout exactly (regenerate with tools/gen-region-docs.ts)', () => {
    expect(readFileSync('src/region/act2/ACT2_WORLD_ANCHORS.md', 'utf8')).toBe(renderAnchorsDoc(ACT2_WORLD_LAYOUT, ACT2_WORLD_DOC));
  });

  it('uses only the cinderroad. prefix and dotted ids', () => {
    for (const a of ACT2_WORLD_LAYOUT.anchors) expect(a.id).toMatch(/^cinderroad\.[a-z0-9.-]+$/);
  });
});
