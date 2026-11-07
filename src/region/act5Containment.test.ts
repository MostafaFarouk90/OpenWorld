// v0.9 item 3: Act 5 containment over a grid of states (the Caldera from `story.gate.a5`, the Rim Gate, the siege's keep-in,
// the bowl floor's round hole behind M53 and the Phase I hold, the world after the ending), the rim faces' rules, the round
// hole and the keep-in on the shared service, and item 1's region (regionAt answers the Caldera before the Waste).
import { describe, expect, it } from 'vitest';
import { flagConditionHolds } from '../core/flagCondition';
import { ACT2_CORRIDORS, ACT2_WORLD_STRINGS_EN } from './act2/act2World';
import { ACT3_CORRIDORS, ACT3_HOLES, SUMMIT_OPEN_WHEN } from './act3Containment';
import { ACT4_CORRIDORS, ACT4_HOLES, CALDERA_HOLE, OCCUPIED_FLAG, harrowmarkOccupied, HARROWMARK_OCCUPIED_WHEN } from './act4Containment';
import { ACT4_FOG_FACES, CITY_HELD_OPEN_WHEN, FOG_TOAST_CALDERA_RIM } from './act4Fog';
import { ACT5_HOLES, ACT5_KEEPINS, CALDERA_FLOOR_HOLE, SIEGE_KEEPIN, SIEGE_KEEPIN_TOAST } from './act5Containment';
import { ACT5_FOG_STRINGS_EN, FOG_TOAST_CALDERA_RIM_SHEER, FOG_TOAST_INNER_GATE, FOG_TOAST_RIM_GATE_BARRED, INNER_GATE_FACE, innerGateFaceDef } from './act5Fog';
import { AFTER_ENDING_FLAG, CALDERA_CENTRE, CALDERA_FLOOR_RADIUS, RIM_CAMP_POINT, RIMFOOT_POINT } from './act5Regions';
import { Containment, DEAD_ROAD_CORRIDOR, type ContainmentKeepInDef } from './containment';
import { fogToastKey } from './fogWall';
import { regionAt } from './regionMask';
import { PHASE_HOLDS, REGION_INFO, engineBox, regionRefusesMount } from './regions';
import { WAYSTONE_DARK } from '../waystones/tuning';

type Flags = Record<string, boolean>;
const ACT3_DONE: Flags = {
  'story.gate.a2': true,
  'story.d03.complete': true,
  'story.gate.a3': true,
  ...Object.fromEntries((SUMMIT_OPEN_WHEN.all ?? []).map((k) => [k, true])),
  'story.gate.a4': true,
};
const ACT4_DONE: Flags = {
  ...ACT3_DONE,
  [OCCUPIED_FLAG]: true,
  'story.m41.complete': true,
  'story.m42.started': true,
  'story.phase.wasteOpen': true,
  'story.m46.complete': true,
  'story.d08.complete': true,
};
const GATE: Flags = { ...ACT4_DONE, 'story.gate.a5': true };
const PHASE_I: Flags = { ...GATE, 'story.m47.complete': true, 'story.m47.rimGateOpen': true };
const SIEGE: Flags = { ...PHASE_I, 'story.m52.started': true };
const AFTER_SIEGE: Flags = { ...SIEGE, 'story.m52.complete': true };
const PHASE_J: Flags = { ...AFTER_SIEGE, 'story.phase.foundryOpen': true };
const AFTER_M53: Flags = { ...PHASE_J, 'story.m53.complete': true };
const AFTER_ENDING: Flags = { ...AFTER_M53, 'story.m56.complete': true, 'story.gate.end': true, [AFTER_ENDING_FLAG]: true };

const reader = (flags: Flags) => ({ getFlag: (k: string) => flags[k] });
function containment(flags: Flags): Containment {
  const c = new Containment(reader(flags), [DEAD_ROAD_CORRIDOR, ...ACT3_CORRIDORS, ...ACT4_CORRIDORS], [...ACT3_HOLES, ...ACT4_HOLES, ...ACT5_HOLES]);
  for (const def of ACT2_CORRIDORS) c.addCorridor(def);
  for (const k of ACT5_KEEPINS) c.addKeepIn(k);
  return c;
}

const P = {
  rimfoot: RIMFOOT_POINT,
  gateOut: { x: 11000, z: 6450 },
  gateIn: { x: 11000, z: 6560 },
  camp: RIM_CAMP_POINT,
  terraces: { x: 11000, z: 7050 },
  floor: { x: 11000, z: 7600 },
  anvil: CALDERA_CENTRE,
  beyondEast: { x: 12600, z: 8000 },
} as const;
type Row = Record<keyof typeof P, boolean>;
const GRID: readonly [string, Flags, Row][] = [
  ['Act 4 complete before the gate', ACT4_DONE, { rimfoot: true, gateOut: true, gateIn: false, camp: false, terraces: false, floor: false, anvil: false, beyondEast: true }],
  ['story.gate.a5, the winch shut', GATE, { rimfoot: true, gateOut: true, gateIn: true, camp: true, terraces: true, floor: false, anvil: false, beyondEast: true }],
  ['Phase I, the Rim Gate open', PHASE_I, { rimfoot: true, gateOut: true, gateIn: true, camp: true, terraces: true, floor: false, anvil: false, beyondEast: true }],
  ['M52 running (the keep-in)', SIEGE, { rimfoot: false, gateOut: true, gateIn: true, camp: true, terraces: false, floor: false, anvil: false, beyondEast: false }],
  ['Phase I after M52 (the hold)', AFTER_SIEGE, { rimfoot: true, gateOut: true, gateIn: true, camp: true, terraces: true, floor: false, anvil: false, beyondEast: true }],
  ['Phase J before M53', PHASE_J, { rimfoot: true, gateOut: true, gateIn: true, camp: true, terraces: true, floor: false, anvil: false, beyondEast: true }],
  ['Phase J after M53', AFTER_M53, { rimfoot: true, gateOut: true, gateIn: true, camp: true, terraces: true, floor: true, anvil: true, beyondEast: true }],
  ['after the ending', AFTER_ENDING, { rimfoot: true, gateOut: true, gateIn: true, camp: true, terraces: true, floor: true, anvil: true, beyondEast: true }],
];

describe('item 1: the Caldera region', () => {
  it('is built at 35 to 40 with its track, sky and refused mount, and regionAt answers it before the Waste', () => {
    const r = REGION_INFO.caldera;
    expect(r.reserved).toBe(false);
    expect(r.levelBand).toEqual({ min: 35, max: 40 });
    expect(r.track).toBe('heart-of-the-anvil');
    expect(r.sky).toBe('caldera-orange');
    expect(r.weather).toBeUndefined();
    expect(r.openWhen).toEqual({ all: ['story.gate.a5'] });
    expect(regionAt(CALDERA_CENTRE.x, CALDERA_CENTRE.z)?.id).toBe('caldera');
    expect(regionAt(P.camp.x, P.camp.z)?.id).toBe('caldera');
    // the edges: the Caldera's box is min inclusive, max exclusive; the Waste keeps everything round it
    const b = engineBox('caldera');
    expect(regionAt(b.x0, b.z0)?.id).toBe('caldera');
    expect(regionAt(b.x1, b.z0)?.id).toBe('ashen-waste');
    expect(regionAt(P.rimfoot.x, P.rimfoot.z)?.id).toBe('ashen-waste');
    expect(regionRefusesMount(CALDERA_CENTRE.x, CALDERA_CENTRE.z)).toBe(true);
  });
  it('the Caldera floor hold is the only new hold, and it is not spread into the region', () => {
    expect(PHASE_HOLDS.caldera).toEqual(['story.phase.foundryOpen']);
    expect(JSON.stringify(REGION_INFO.caldera.openWhen)).not.toContain('foundryOpen');
    expect(CALDERA_FLOOR_HOLE.openWhen).toEqual({ all: ['story.m53.complete', 'story.phase.foundryOpen'] });
  });
});

describe('item 3: the containment grid across Act 4 end, Phase I, the siege, Phase J and after the ending', () => {
  it.each(GRID)('%s', (_name, flags, row) => {
    const c = containment(flags);
    for (const [k, want] of Object.entries(row)) {
      const p = P[k as keyof typeof P];
      expect(c.isOpen(p.x, p.z), k).toBe(want);
    }
  });
  it('the shipped Caldera hole retires on story.gate.a5 only', () => {
    expect(flagConditionHolds(CALDERA_HOLE.openWhen, reader(ACT4_DONE))).toBe(false);
    expect(flagConditionHolds(CALDERA_HOLE.openWhen, reader(GATE))).toBe(true);
  });
});

describe('item 3: the Rim Gate, the sheer faces and the Inner Gate', () => {
  const face = (id: string) => ACT4_FOG_FACES.find((f) => f.id === id)!;
  it('the south face opens on the gate plus the winch; before the winch it says the gate is barred', () => {
    const s = face('fog.caldera-rim.s');
    expect(flagConditionHolds(s.openWhen, reader(GATE))).toBe(false);
    expect(flagConditionHolds(s.openWhen, reader(PHASE_I))).toBe(true);
    expect(flagConditionHolds(s.openWhen, reader({ 'story.m47.rimGateOpen': true }))).toBe(false); // the gate first
    expect(fogToastKey(s, reader(ACT4_DONE))).toBe(FOG_TOAST_CALDERA_RIM); // Act 4's own text stays before the gate
    expect(fogToastKey(s, reader(GATE))).toBe(FOG_TOAST_RIM_GATE_BARRED);
  });
  it('the n, e and w faces never open and from the gate point to the Rim Gate', () => {
    for (const d of ['n', 'e', 'w']) {
      const f = face(`fog.caldera-rim.${d}`);
      expect(flagConditionHolds(f.openWhen, reader(AFTER_ENDING)), d).toBe(false);
      expect(fogToastKey(f, reader(ACT4_DONE)), d).toBe(FOG_TOAST_CALDERA_RIM);
      expect(fogToastKey(f, reader(GATE)), d).toBe(FOG_TOAST_CALDERA_RIM_SHEER);
    }
  });
  it('the Inner Gate face shares the floor hole condition and builds on a placement', () => {
    expect(INNER_GATE_FACE.openWhen).toEqual(CALDERA_FLOOR_HOLE.openWhen);
    expect(INNER_GATE_FACE.toastKey).toBe(FOG_TOAST_INNER_GATE);
    const def = innerGateFaceDef({ axis: 'z', halfLength: 20, blockedSide: 1 });
    expect(def).toMatchObject({ id: 'fog.caldera.inner', anchorId: 'caldera.fog.inner', pushBackTo: 1, axis: 'z' });
  });
  it('every Act 5 toast has its words and rides with the world strings', () => {
    expect(ACT5_FOG_STRINGS_EN[FOG_TOAST_RIM_GATE_BARRED]).toBe('The Rim Gate is barred from within. The winch is on the gatehouse stair.');
    expect(ACT5_FOG_STRINGS_EN[FOG_TOAST_CALDERA_RIM_SHEER]).toBe('The rim is sheer here. The way in is the Rim Gate above Rimfoot.');
    expect(ACT5_FOG_STRINGS_EN[FOG_TOAST_INNER_GATE]).toBe("Vey's household holds the Inner Gate.");
    expect(ACT5_FOG_STRINGS_EN[SIEGE_KEEPIN_TOAST]).toBe('Hold the gate. The wave is on the stairs.');
    for (const k of Object.keys(ACT5_FOG_STRINGS_EN)) expect(ACT2_WORLD_STRINGS_EN[k], k).toBeTruthy();
  });
});

describe('item 3: the round hole and the keep-in on the shared service', () => {
  it('a circle hole closes its disc and pushes a point inside to just outside its edge', () => {
    const c = containment(PHASE_I);
    expect(c.isOpen(CALDERA_CENTRE.x, CALDERA_CENTRE.z - CALDERA_FLOOR_RADIUS + 1)).toBe(false);
    expect(c.isOpen(CALDERA_CENTRE.x, CALDERA_CENTRE.z - CALDERA_FLOOR_RADIUS - 1)).toBe(true);
    const q = c.nearestOpen(P.floor.x, P.floor.z);
    expect(c.isOpen(q.x, q.z)).toBe(true);
    expect(Math.hypot(q.x - CALDERA_CENTRE.x, q.z - CALDERA_CENTRE.z)).toBeCloseTo(CALDERA_FLOOR_RADIUS + 1, 3);
    expect(c.closedHoles()).toContain('hole.caldera.floor');
    // the centre itself has no direction: any open point outside the edge will do
    const fromCentre = c.nearestOpen(CALDERA_CENTRE.x, CALDERA_CENTRE.z);
    expect(c.isOpen(fromCentre.x, fromCentre.z)).toBe(true);
  });
  it('refuses an empty circle, a box and circle together, and a duplicate keep-in', () => {
    const c = new Containment(reader({}));
    expect(() => c.addHole({ id: 'h', circle: { x: 0, z: 0, r: 0 }, openWhen: {} })).toThrow(/empty/);
    expect(() => c.addHole({ id: 'h2', circle: { x: 0, z: 0, r: 5 }, box: { x0: 0, z0: 0, x1: 1, z1: 1 }, openWhen: {} } as never)).toThrow(/empty/);
    const k: ContainmentKeepInDef = { id: 'k', circle: { x: 0, z: 0, r: 10 }, liveWhen: {}, toastKey: 't' };
    const off = c.addKeepIn(k);
    expect(() => c.addKeepIn(k)).toThrow(/already/);
    off();
    expect(c.liveKeepIns()).toEqual([]);
  });
  it('the siege keep-in holds the player at the gate while M52 runs, with its own toast, and lets go when it ends', () => {
    const siege = containment(SIEGE);
    expect(siege.liveKeepIns()).toEqual([SIEGE_KEEPIN.id]);
    expect(siege.pushToastKey(P.rimfoot.x, P.rimfoot.z)).toBe(SIEGE_KEEPIN_TOAST);
    expect(siege.pushToastKey(P.camp.x, P.camp.z)).toBeNull();
    const back = siege.nearestOpen(P.rimfoot.x, P.rimfoot.z);
    expect(siege.isOpen(back.x, back.z)).toBe(true);
    expect(back.z).toBeGreaterThanOrEqual(SIEGE_KEEPIN.box!.z0);
    const after = containment(AFTER_SIEGE);
    expect(after.liveKeepIns()).toEqual([]);
    expect(after.pushToastKey(P.rimfoot.x, P.rimfoot.z)).toBeNull();
  });
  it('a circle keep-in clamps radially inside its edge', () => {
    const c = new Containment(reader({ on: true }));
    c.addKeepIn({ id: 'k', circle: { x: 100, z: 100, r: 20 }, liveWhen: { all: ['on'] }, toastKey: 't' });
    expect(c.isOpen(100, 100)).toBe(true);
    expect(c.isOpen(100, 150)).toBe(false);
    const q = c.nearestOpen(100, 150);
    expect(q.x).toBeCloseTo(100, 6);
    expect(q.z).toBeCloseTo(119, 6);
  });
});

describe('item 10: the occupation lifts only after the ending', () => {
  it('harrowmarkOccupied, the gate faces, the gate stone and the flat condition agree in every state', () => {
    for (const [name, flags] of [['act3', ACT3_DONE], ['occupied', ACT4_DONE], ['phaseJ', AFTER_M53], ['after', AFTER_ENDING]] as const) {
      const held = harrowmarkOccupied(reader(flags));
      expect(flagConditionHolds(HARROWMARK_OCCUPIED_WHEN, reader(flags)), name).toBe(held);
      expect(flagConditionHolds(CITY_HELD_OPEN_WHEN, reader(flags)), name).toBe(!held);
      expect(flagConditionHolds(WAYSTONE_DARK['harrowmark-gate'], reader(flags)), name).toBe(held);
    }
    expect(harrowmarkOccupied(reader(ACT3_DONE))).toBe(false);
    expect(harrowmarkOccupied(reader(AFTER_M53))).toBe(true);
    expect(harrowmarkOccupied(reader(AFTER_ENDING))).toBe(false);
  });
});
