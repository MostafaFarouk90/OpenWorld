import { describe, expect, it } from 'vitest';
import { WORLD_BOUNDS } from '../config/constants';
import { DENSITY_LAYOUT_HM } from '../harrowmark/density.layout';
import { HARROWMARK_LAYOUT } from '../harrowmark/harrowmark.layout';
import { BRIGHTWATER_LAYOUT } from './brightwater.layout';
import { DEADROAD_LAYOUT } from './deadroad.layout';
import { CONTAINMENT_INSET, Containment, DEAD_ROAD_CORRIDOR } from './containment';
import { CONTAINMENT_SYSTEM_ID, CONTAINMENT_TOAST_KEY, EDGE_CAP_METRES, EDGE_CAP_MIN, edgeSpeedCap, installContainment } from './containmentSystem';
import { DEAD_ROAD_FULL } from './deadRoad';
import { PHASE_HOLDS } from './regions';
import { createFakeCore } from './testing/fakeCore';

// The oracle: engine boxes written out by hand from design 4.2 (engine = map - 1000), independent of regions.ts.
const BOX = {
  brightwater: { x0: -500, z0: -500, x1: 5500, z1: 4500 },
  harrowmark: { x0: 6500, z0: 0, x1: 10500, z1: 4000 },
  cinderreach: { x0: 15500, z0: -500, x1: 22500, z1: 5500 },
  oldsmoke: { x0: 17000, z0: 7000, x1: 22000, z1: 12000 },
} as const;
type Box = (typeof BOX)[keyof typeof BOX];
const inBox = (b: Box, x: number, z: number) => x >= b.x0 && x < b.x1 && z >= b.z0 && z < b.z1;

const STATES = {
  act1: {},
  phaseC: { 'story.gate.a2': true },
  // D03 done: the Phase C hold is retired, so D03 alone opens Oldsmoke.
  phaseCAfterD03: { 'story.gate.a2': true, 'story.d03.complete': true },
  phaseD: { 'story.gate.a2': true, 'story.d03.complete': true },
} as const;
const OPEN_BOXES: Record<keyof typeof STATES, Box[]> = {
  act1: [BOX.brightwater, BOX.harrowmark],
  phaseC: [BOX.brightwater, BOX.harrowmark, BOX.cinderreach],
  phaseCAfterD03: [BOX.brightwater, BOX.harrowmark, BOX.cinderreach, BOX.oldsmoke],
  phaseD: [BOX.brightwater, BOX.harrowmark, BOX.cinderreach, BOX.oldsmoke],
};

const stateOf = (flags: Record<string, boolean>) => ({ getFlag: (k: string) => flags[k] });
const nearDeadRoad = (x: number, z: number) => {
  let best = Infinity;
  for (let i = 1; i < DEAD_ROAD_FULL.length; i++) {
    const [ax, az] = DEAD_ROAD_FULL[i - 1];
    const [bx, bz] = DEAD_ROAD_FULL[i];
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
  }
  return best;
};

describe('containment: the open area under each flag state', () => {
  for (const [name, flags] of Object.entries(STATES) as [keyof typeof STATES, Record<string, boolean>][]) {
    it(`${name}: a 250 m grid over the whole map matches the hand-written boxes and the Dead Road corridor`, () => {
      const c = new Containment(stateOf(flags));
      let checked = 0;
      for (let x = WORLD_BOUNDS.minX - 500; x <= WORLD_BOUNDS.maxX + 500; x += 250) {
        for (let z = WORLD_BOUNDS.minZ - 500; z <= WORLD_BOUNDS.maxZ + 500; z += 250) {
          const inside = x >= WORLD_BOUNDS.minX && x <= WORLD_BOUNDS.maxX && z >= WORLD_BOUNDS.minZ && z <= WORLD_BOUNDS.maxZ;
          const expected = inside && (OPEN_BOXES[name].some((b) => inBox(b, x, z)) || nearDeadRoad(x, z) <= 40);
          expect(c.isOpen(x, z), `(${x}, ${z})`).toBe(expected);
          // Every refused point is put back somewhere open, and an open one is left alone.
          const q = c.nearestOpen(x, z);
          expect(c.isOpen(q.x, q.z), `nearestOpen(${x}, ${z})`).toBe(true);
          if (expected) expect(q).toEqual({ x, z });
          checked++;
        }
      }
      expect(checked).toBeGreaterThan(7000);
    });
  }

  it('names the open regions per state; reserved regions are never open', () => {
    expect(new Containment(stateOf(STATES.act1)).openRegions()).toEqual(['brightwater', 'harrowmark']);
    expect(new Containment(stateOf(STATES.phaseC)).openRegions()).toEqual(['brightwater', 'harrowmark', 'cinderreach']);
    expect(new Containment(stateOf(STATES.phaseCAfterD03)).openRegions()).toContain('oldsmoke');
    const all = { ...STATES.phaseD, 'region.never': true, 'story.gate.a3': true };
    expect(new Containment(stateOf(all)).openRegions()).toEqual(['brightwater', 'harrowmark', 'cinderreach', 'oldsmoke']);
    expect(PHASE_HOLDS).toEqual([]);
  });

  it('named points: the spawn, Harrowmark, the null strip on and off the road, Cinderreach, Oldsmoke, the Caldera', () => {
    const act1 = new Containment(stateOf(STATES.act1));
    const d = new Containment(stateOf(STATES.phaseD));
    expect(act1.isOpen(0, 0)).toBe(true);
    expect(act1.isOpen(8500, 2000)).toBe(true);
    expect(act1.isOpen(6000, 2000)).toBe(false); // null strip, off the road
    expect(act1.isOpen(20000, 3000)).toBe(false);
    expect(d.isOpen(20000, 3000)).toBe(true);
    expect(d.isOpen(19000, 9000)).toBe(true);
    expect(d.isOpen(12000, 9000)).toBe(false); // the Caldera (reserved)
    expect(d.isOpen(13000, 3000)).toBe(false); // the unnamed country until A1's Cinder Road corridor
  });

  it('the far (exclusive) edge of a box clamps 1 m inside, and the result is open', () => {
    const c = new Containment(stateOf(STATES.act1));
    expect(c.isOpen(10500, 2000)).toBe(false);
    const q = c.nearestOpen(10500.5, 2000);
    expect(q.x).toBeCloseTo(10500 - CONTAINMENT_INSET, 6);
    expect(c.isOpen(q.x, q.z)).toBe(true);
    const r = c.nearestOpen(3000, 4600);
    expect(r.z).toBeCloseTo(4500 - CONTAINMENT_INSET, 6);
  });

  it('a corridor clamps 1 m inside its half width; corridors are added, refused when duplicated, and undone', () => {
    const c = new Containment(stateOf({}), []);
    expect(c.isOpen(6000, 5000 - 1000)).toBe(false);
    const off = c.addCorridor({ id: 'test.road', points: [[13000, 3000], [15000, 3000]], openWhen: {} });
    expect(c.isOpen(14000, 3039)).toBe(true);
    expect(c.isOpen(14000, 3041)).toBe(false);
    const q = c.nearestOpen(14000, 3100);
    expect(q.z).toBeCloseTo(3000 + 40 - CONTAINMENT_INSET, 6);
    expect(() => c.addCorridor({ id: 'test.road', points: [[0, 0], [1, 1]], openWhen: {} })).toThrow(/already/);
    expect(() => c.addCorridor({ id: 'short', points: [[0, 0]], openWhen: {} })).toThrow(/two points/);
    off();
    expect(c.isOpen(14000, 3000)).toBe(false);
  });

  it('a corridor with a condition opens with it, read live with no re-derive', () => {
    const flags: Record<string, boolean> = {};
    const c = new Containment(stateOf(flags));
    c.addCorridor({ id: 'cinder', points: [[10500, 1000], [15500, 1000]], openWhen: { all: ['story.gate.a2'] } });
    expect(c.isOpen(13000, 1000)).toBe(false);
    flags['story.gate.a2'] = true;
    expect(c.isOpen(13000, 1000)).toBe(true);
  });

  it('every Act 1 anchor and trigger is open under the Act 1 flags (min clearance reported)', () => {
    const c = new Containment(stateOf(STATES.act1));
    const layouts = [BRIGHTWATER_LAYOUT, DEADROAD_LAYOUT, HARROWMARK_LAYOUT, DENSITY_LAYOUT_HM];
    let minClear = Infinity;
    let worst = '';
    for (const layout of layouts) {
      for (const a of layout.anchors) {
        expect(c.isOpen(a.x, a.z), a.id).toBe(true);
        const clear = c.edgeDistance(a.x, a.z, 200);
        if (clear < minClear) [minClear, worst] = [clear, a.id];
      }
    }
    // Known: the Hollin Ford end of the Dead Road sits about 20 m inside Brightwater's west edge (accepted in review).
    expect(minClear, worst).toBeGreaterThanOrEqual(10);
  });

  it('the drawn Dead Road is open every 5 m from end to end, and reports its clearance', () => {
    const c = new Containment(stateOf(STATES.act1));
    let samples = 0;
    for (let i = 1; i < DEAD_ROAD_CORRIDOR.points.length; i++) {
      const [ax, az] = DEAD_ROAD_CORRIDOR.points[i - 1];
      const [bx, bz] = DEAD_ROAD_CORRIDOR.points[i];
      const len = Math.hypot(bx - ax, bz - az);
      for (let s = 0; s <= len; s += 5) {
        const t = len > 0 ? s / len : 0;
        const x = ax + (bx - ax) * t;
        const z = az + (bz - az) * t;
        // The whole 6 m road surface, both edges.
        expect(c.isOpen(x, z + 3) && c.isOpen(x, z - 3), `(${x}, ${z})`).toBe(true);
        samples++;
      }
    }
    expect(samples).toBeGreaterThan(1000);
  });

  it('non-finite input is closed and clamps into the open area', () => {
    const c = new Containment(stateOf({}));
    expect(c.isOpen(Number.NaN, 0)).toBe(false);
    const q = c.nearestOpen(Number.NaN, Infinity);
    expect(c.isOpen(q.x, q.z)).toBe(true);
  });

  it('clamp returns the same object when open and a moved copy when not', () => {
    const c = new Containment(stateOf({}));
    const at = { x: 10, y: 5, z: 10 };
    expect(c.clamp(at)).toBe(at);
    const out = c.clamp({ x: 20000, y: 7, z: 3000 });
    expect(out.y).toBe(7);
    expect(c.isOpen(out.x, out.z)).toBe(true);
  });
});

describe('containment: the push-back system', () => {
  function rig(flags: Record<string, boolean> = {}) {
    const fc = createFakeCore();
    for (const [k, v] of Object.entries(flags)) fc.flags.set(k, v);
    const installed = installContainment(fc.ctx, () => 0);
    return { fc, installed };
  }

  it('provides the service and runs at intent order -95, before the region tracker', () => {
    const { fc } = rig();
    expect(fc.services.get('containment')).toBeDefined();
    const sys = fc.systems.get(CONTAINMENT_SYSTEM_ID)!;
    expect(sys.fixedPhase).toBe('intent');
    expect(sys.order).toBe(-95);
  });

  it('puts a player outside back inside in one tick, with one toast', () => {
    const { fc } = rig();
    Object.assign(fc.playerFeet, { x: 20000, y: 0, z: 3000 });
    fc.tick('intent');
    expect(fc.teleports).toHaveLength(1);
    const to = fc.teleports[0].feet;
    expect((fc.services.get('containment') as Containment).isOpen(to.x, to.z)).toBe(true);
    fc.tick('intent');
    expect(fc.emitted.filter((e) => e.type === 'hud.toast' && (e.payload as { textKey: string }).textKey === CONTAINMENT_TOAST_KEY)).toHaveLength(1);
  });

  it('leaves an open player alone, and a Phase C player inside Cinderreach stays put from the first tick of a load', () => {
    const { fc } = rig({ 'story.gate.a2': true });
    Object.assign(fc.playerFeet, { x: 20000, y: 0, z: 3000 });
    fc.tick('intent');
    expect(fc.teleports).toHaveLength(0);
  });

  it('does nothing inside an interior, while a save loads or during waystone travel', () => {
    const { fc } = rig();
    Object.assign(fc.playerFeet, { x: 20000, y: 150, z: 3000 });
    fc.services.set('interiors', { current: 'scorchhold.keep' });
    fc.tick('intent');
    fc.services.set('interiors', { current: null });
    fc.services.set('save', { loading: true });
    fc.tick('intent');
    fc.services.set('save', { loading: false });
    fc.services.set('waystones', { travelling: true });
    fc.tick('intent');
    expect(fc.teleports).toHaveLength(0);
    fc.services.set('waystones', { travelling: false });
    fc.tick('intent');
    expect(fc.teleports).toHaveLength(1);
  });

  it('a mounted push-back is a short move (under the mount 5 m ride break), and the horse gets a soft cap near edges', () => {
    const { fc } = rig();
    const caps: ((x: number, z: number) => number)[] = [];
    fc.services.set('mount', { addSpeedCap: (f: (x: number, z: number) => number) => (caps.push(f), () => caps.splice(caps.indexOf(f), 1)) });
    // A gallop tick (12 m/s) carries the rider 0.2 m past the east edge of Harrowmark's box.
    Object.assign(fc.playerFeet, { x: 10500.2, y: 0, z: 2000 });
    fc.tick('intent');
    const to = fc.teleports[0].feet;
    expect(Math.hypot(to.x - 10500.2, to.z - 2000)).toBeLessThan(5);
    expect(caps).toHaveLength(1);
    expect(caps[0](10495, 2000)).toBeLessThan(12);
    expect(caps[0](8500, 2000)).toBe(Infinity);
  });

  it('dispose removes the service, the system and the speed cap', () => {
    const { fc, installed } = rig();
    let capped = 0;
    fc.services.set('mount', { addSpeedCap: () => (capped++, () => capped--) });
    fc.tick('intent');
    expect(capped).toBe(1);
    installed.dispose();
    expect(capped).toBe(0);
    expect(fc.systems.has(CONTAINMENT_SYSTEM_ID)).toBe(false);
  });
});

describe('edgeSpeedCap', () => {
  it('is no cap beyond the band, the walk speed at the edge, rising in between', () => {
    expect(edgeSpeedCap(EDGE_CAP_METRES)).toBe(Infinity);
    expect(edgeSpeedCap(0)).toBe(EDGE_CAP_MIN);
    expect(edgeSpeedCap(10)).toBeGreaterThan(EDGE_CAP_MIN);
    expect(edgeSpeedCap(Number.NaN)).toBe(Infinity);
  });
});
