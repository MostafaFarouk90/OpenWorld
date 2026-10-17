import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { CombatSystem } from './CombatSystem';
import { DamageBus } from './DamageBus';
import { HurtboxSet } from './HurtboxSet';
import { WeaponTracer, bladeFromGeometry } from './WeaponTracer';
import { closestSegmentSegment, sweepBlade } from './sweep';
import type { AttackWindowSource, HurtboxDef } from './types';

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** A character with named single-capsule hurtboxes; each box is a vertical capsule of height 1 at `x`. */
function character(boxes: Array<{ name: string; x: number; r?: number; h?: number }>, owner: unknown = {}) {
  const root = new THREE.Group();
  const defs: HurtboxDef[] = [];
  for (const b of boxes) {
    const bone = new THREE.Bone();
    bone.name = `bone_${b.name}`;
    bone.position.set(b.x, 0, 0);
    root.add(bone);
    defs.push({
      name: b.name,
      bone: bone.name,
      start: { x: 0, y: 0, z: 0 },
      end: { x: 0, y: b.h ?? 1, z: 0 },
      radius: b.r ?? 0.2,
    });
  }
  root.updateMatrixWorld(true);
  const set = new HurtboxSet(root, defs, owner);
  set.update();
  return { root, set, owner };
}

/** Sweeps a horizontal blade (length 1 along x) at height y from z0 to z1. */
function sweepZ(set: HurtboxSet, y: number, z0: number, z1: number, x = 0) {
  return sweepBlade(v(x - 0.5, y, z0), v(x + 0.5, y, z0), v(x - 0.5, y, z1), v(x + 0.5, y, z1), set);
}

describe('sweepBlade', () => {
  it('hits a capsule crossed by the swept quad, with point and normal against the motion', () => {
    const { set } = character([{ name: 'torso', x: 0 }]);
    const hit = sweepZ(set, 0.5, -1, 1);
    expect(hit).not.toBeNull();
    expect(hit!.bone).toBe('torso');
    expect(hit!.normal.z).toBeLessThan(-0.5); // moving +z, normal faces -z
    expect(Math.abs(hit!.point.z)).toBeLessThan(0.3);
    expect(hit!.s).toBeGreaterThan(0.2);
    expect(hit!.s).toBeLessThan(0.5);
  });

  it('misses when the sweep passes beside, above or short of the capsule', () => {
    const { set } = character([{ name: 'torso', x: 0 }]);
    expect(sweepZ(set, 0.5, -1, 1, 2)).toBeNull(); // beside
    expect(sweepZ(set, 2, -1, 1)).toBeNull(); // above
    expect(sweepZ(set, 0.5, -1, -0.5)).toBeNull(); // stops short
  });

  it('distinguishes a graze just inside the radius from just outside', () => {
    const { set } = character([{ name: 'torso', x: 0, r: 0.2 }]);
    // Blade moves along x at z offset; capsule axis at z=0.
    const along = (z: number) => sweepBlade(v(-1, 0.5, z), v(-1, 0.6, z), v(1, 0.5, z), v(1, 0.6, z), set);
    expect(along(0.15)).not.toBeNull();
    expect(along(0.3)).toBeNull();
  });

  it('detects a blade that starts inside the hurtbox (sweep fraction 0)', () => {
    const { set } = character([{ name: 'torso', x: 0 }]);
    const hit = sweepBlade(v(-0.05, 0.4, 0), v(0.05, 0.6, 0), v(0.3, 0.4, 0), v(0.4, 0.6, 0), set);
    expect(hit).not.toBeNull();
    expect(hit!.s).toBe(0);
    expect(hit!.bone).toBe('torso');
  });

  it('does not tunnel through a thin hurtbox in one huge frame', () => {
    const { set } = character([{ name: 'torso', x: 0, r: 0.02 }]);
    expect(sweepZ(set, 0.5, -50, 50)).not.toBeNull();
  });

  it('handles zero-length frames: stationary inside hits, outside does not', () => {
    const { set } = character([{ name: 'torso', x: 0 }]);
    expect(sweepBlade(v(-0.5, 0.5, 0), v(0.5, 0.5, 0), v(-0.5, 0.5, 0), v(0.5, 0.5, 0), set)).not.toBeNull();
    expect(sweepBlade(v(-0.5, 0.5, 3), v(0.5, 0.5, 3), v(-0.5, 0.5, 3), v(0.5, 0.5, 3), set)).toBeNull();
  });

  it('handles a blade sliding along its own axis (degenerate quad)', () => {
    const { set } = character([{ name: 'torso', x: 0 }]);
    const hit = sweepBlade(v(-3, 0.5, 0), v(-2, 0.5, 0), v(-1.5, 0.5, 0), v(-0.5, 0.5, 0), set);
    expect(hit).toBeNull();
    const hit2 = sweepBlade(v(-3, 0.5, 0), v(-2, 0.5, 0), v(-0.5, 0.5, 0), v(0.5, 0.5, 0), set);
    expect(hit2).not.toBeNull();
  });

  it('ignores zero-length blades and NaN-free output for them', () => {
    const { set } = character([{ name: 'torso', x: 0 }]);
    expect(sweepBlade(v(0, 0.5, 0), v(0, 0.5, 0), v(0, 0.5, 0), v(0, 0.5, 0), set)).toBeNull();
  });

  it('returns null for a set without hurtboxes', () => {
    const { set } = character([]);
    expect(set.count).toBe(0);
    expect(sweepZ(set, 0.5, -1, 1)).toBeNull();
  });

  it('reports the sweep fraction at which the hit occurs (later box, larger fraction)', () => {
    const a = character([{ name: 'head', x: 0 }]);
    a.root.children[0].position.z = 2;
    a.root.updateMatrixWorld(true);
    a.set.update();
    const hit = sweepZ(a.set, 0.5, -1, 4);
    expect(hit!.bone).toBe('head');
    expect(hit!.s).toBeGreaterThan(0.5); // reached after the origin
  });

  it('follows bones after a refit', () => {
    const { root, set } = character([{ name: 'torso', x: 0 }]);
    expect(sweepZ(set, 0.5, -1, 1, 5)).toBeNull();
    root.children[0].position.x = 5;
    root.updateMatrixWorld(true);
    set.update();
    expect(sweepZ(set, 0.5, -1, 1, 5)).not.toBeNull();
    expect(sweepZ(set, 0.5, -1, 1, 0)).toBeNull();
  });
});

describe('closestSegmentSegment', () => {
  it('handles crossing, parallel and degenerate segments', () => {
    const o1 = v(0, 0, 0);
    const o2 = v(0, 0, 0);
    expect(closestSegmentSegment(v(-1, 0, 0), v(1, 0, 0), v(0, 1, -1), v(0, 1, 1), o1, o2)).toBeCloseTo(1);
    expect(closestSegmentSegment(v(0, 0, 0), v(1, 0, 0), v(0, 2, 0), v(1, 2, 0), o1, o2)).toBeCloseTo(2);
    expect(closestSegmentSegment(v(0, 0, 0), v(0, 0, 0), v(3, 0, 0), v(3, 0, 0), o1, o2)).toBeCloseTo(3);
    expect(closestSegmentSegment(v(0, 0, 0), v(0, 0, 0), v(0, 1, -1), v(0, 1, 1), o1, o2)).toBeCloseTo(1);
  });
});

/** Weapon object: a unit blade along +x from the origin, positioned by tests. */
function weapon() {
  const w = new THREE.Group();
  w.add(new THREE.Mesh(new THREE.BoxGeometry(1, 0.05, 0.05).translate(0.5, 0, 0)));
  return w;
}

function swing(tracer: WeaponTracer, w: THREE.Object3D, targets: HurtboxSet[], zs: number[], y = 0.5) {
  const all = [];
  for (const z of zs) {
    w.position.set(-0.5, y, z);
    w.updateMatrixWorld(true);
    all.push(...tracer.tick(true, targets));
  }
  return all;
}

describe('WeaponTracer', () => {
  it('reports one hit per swing per target with bone, point, normal and attacker', () => {
    const attacker = {};
    const t = character([{ name: 'torso', x: 0 }], {});
    const w = weapon();
    const tracer = new WeaponTracer({ attacker, weapon: w });
    const hits = swing(tracer, w, [t.set], [-1, -0.5, 0, 0.5, 1]);
    expect(hits).toHaveLength(1);
    expect(hits[0].bone).toBe('torso');
    expect(hits[0].attacker).toBe(attacker);
    expect(hits[0].target).toBe(t.owner);
    expect(hits[0].damage).toBeGreaterThan(0);
    expect(hits[0].normal.length()).toBeCloseTo(1);
  });

  it('re-arms for a new swing after the window closes', () => {
    const t = character([{ name: 'torso', x: 0 }]);
    const w = weapon();
    const tracer = new WeaponTracer({ attacker: {}, weapon: w });
    expect(swing(tracer, w, [t.set], [-1, 0, 1])).toHaveLength(1);
    tracer.tick(false, [t.set]);
    expect(swing(tracer, w, [t.set], [-1, 0, 1])).toHaveLength(1);
    expect(tracer.swing).toBe(2);
  });

  it('does not trace outside the window and drops the stale previous pose', () => {
    const t = character([{ name: 'torso', x: 0 }]);
    const spy = vi.spyOn(t.set.bvh, 'shapecast');
    const w = weapon();
    const tracer = new WeaponTracer({ attacker: {}, weapon: w });
    w.position.set(-0.5, 0.5, -1);
    w.updateMatrixWorld(true);
    expect(tracer.tick(false, [t.set])).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
    // Window opens with the blade on the far side: the jump from -1 to +1 must not count as a sweep.
    w.position.z = 1;
    w.updateMatrixWorld(true);
    expect(tracer.tick(true, [t.set])).toEqual([]);
    expect(spy).not.toHaveBeenCalled(); // first active frame uses only the analytic pose test
  });

  it('hits each of several targets once and ignores the attacker\'s own hurtboxes', () => {
    const attacker = {};
    const a = character([{ name: 'torso', x: 0 }], attacker);
    const b = character([{ name: 'head', x: 0 }, { name: 'torso', x: 3 }]);
    const c = character([{ name: 'torso', x: 0, h: 1 }]);
    const w = weapon();
    const tracer = new WeaponTracer({ attacker, weapon: w, ownHurtboxes: a.set });
    const hits = swing(tracer, w, [a.set, b.set, c.set], [-1, 0, 1]);
    expect(hits).toHaveLength(2);
    expect(hits.map((h) => h.target)).toEqual(expect.arrayContaining([b.owner, c.owner]));
    expect(hits.some((h) => h.target === attacker)).toBe(false);
  });

  it('skips targets without hurtboxes and survives targets removed from the list', () => {
    const empty = character([]);
    const t = character([{ name: 'torso', x: 0 }]);
    const w = weapon();
    const tracer = new WeaponTracer({ attacker: {}, weapon: w });
    expect(swing(tracer, w, [empty.set, t.set], [-1, 0, 1])).toHaveLength(1);
    expect(() => tracer.tick(true, [])).not.toThrow();
  });

  it('emits hits on the bus and calls prepare only on queried targets', () => {
    const bus = new DamageBus();
    const listener = vi.fn();
    bus.subscribe(listener);
    const t = character([{ name: 'head', x: 0 }]);
    const w = weapon();
    const tracer = new WeaponTracer({ attacker: {}, weapon: w, bus });
    const prepare = vi.fn();
    w.position.set(-0.5, 0.5, 0);
    w.updateMatrixWorld(true);
    tracer.tick(true, [t.set], prepare);
    expect(prepare).toHaveBeenCalledWith(t.set);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].damage).toBeCloseTo(20); // head multiplier 2
    prepare.mockClear();
    tracer.tick(true, [t.set], prepare); // already hit this swing: not queried again
    expect(prepare).not.toHaveBeenCalled();
  });

  it('uses explicit hilt/tip overrides and throws without geometry or overrides', () => {
    const t = character([{ name: 'torso', x: 0 }]);
    const w = new THREE.Group();
    const tracer = new WeaponTracer({ attacker: {}, weapon: w, hilt: v(0, 0, 0), tip: v(1, 0, 0) });
    w.position.set(-0.5, 0.5, 0);
    w.updateMatrixWorld(true);
    expect(tracer.tick(true, [t.set])).toHaveLength(1);
    expect(() => new WeaponTracer({ attacker: {}, weapon: new THREE.Group() })).toThrow(/no geometry/);
  });

  it('measures sweep cost on three targets (logged, generous bound)', () => {
    const targets = [0, 1, 2].map((i) => character([{ name: 'torso', x: i * 0.1 }]).set);
    const t0 = performance.now();
    const n = 200;
    for (let i = 0; i < n; i++) for (const s of targets) sweepZ(s, 0.5, -1, 1);
    const per = (performance.now() - t0) / n;
    console.log(`combat sweep: ${per.toFixed(3)} ms per frame over 3 targets`);
    expect(per).toBeLessThan(5);
  });
});

describe('bladeFromGeometry', () => {
  it('picks the longest axis and the end nearer the origin as hilt', () => {
    for (const axis of ['x', 'y', 'z'] as const) {
      const size = { x: 0.1, y: 0.1, z: 0.1 };
      size[axis] = 1;
      const g = new THREE.BoxGeometry(size.x, size.y, size.z);
      const off = { x: 0, y: 0, z: 0 };
      off[axis] = 0.6; // blade extends 0.1..1.1 along the axis
      g.translate(off.x, off.y, off.z);
      const blade = bladeFromGeometry(new THREE.Mesh(g))!;
      expect(blade.hilt[axis]).toBeCloseTo(0.1);
      expect(blade.tip[axis]).toBeCloseTo(1.1);
    }
  });

  it('accounts for child transforms and returns null without geometry', () => {
    const root = new THREE.Group();
    const child = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2, 0.1));
    child.position.set(0, 1.5, 0);
    root.add(child);
    const blade = bladeFromGeometry(root)!;
    expect(blade.hilt.y).toBeCloseTo(0.5);
    expect(blade.tip.y).toBeCloseTo(2.5);
    expect(bladeFromGeometry(new THREE.Group())).toBeNull();
  });
});

describe('CombatSystem', () => {
  const windowOf = (active: { v: boolean }): AttackWindowSource => ({
    clipName: 'x',
    start: 0,
    end: 1,
    currentTime: () => (active.v ? 0.5 : null),
  });

  function setup() {
    const system = new CombatSystem();
    const t = character([{ name: 'torso', x: 0 }]);
    const w = weapon();
    const tracer = new WeaponTracer({ attacker: {}, weapon: w, bus: system.bus });
    const active = { v: true };
    system.addTarget(t.set);
    system.addAttacker(tracer, windowOf(active));
    return { system, t, w, tracer, active };
  }

  const step = (s: ReturnType<typeof setup>, z: number) => {
    s.w.position.set(-0.5, 0.5, z);
    s.w.updateMatrixWorld(true);
    return s.system.update(1 / 60);
  };

  it('traces during the window, flashes the struck box and not outside it', () => {
    const s = setup();
    const flash = vi.spyOn(s.t.set, 'flash');
    expect(step(s, -1)).toEqual([]);
    expect(step(s, 1)).toHaveLength(1);
    expect(flash).toHaveBeenCalledWith('torso', expect.any(Number));
    s.active.v = false;
    const spy = vi.spyOn(s.t.set.bvh, 'shapecast');
    expect(step(s, -1)).toEqual([]);
    expect(step(s, 1)).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it('stops tracing a target removed mid-swing without throwing', () => {
    const s = setup();
    step(s, -1);
    s.system.removeTarget(s.t.set);
    expect(() => step(s, 1)).not.toThrow();
    expect(step(s, 1)).toEqual([]);
    expect(s.system.targetCount).toBe(0);
  });

  it('survives a listener that removes targets while hits are delivered', () => {
    const s = setup();
    s.system.bus.subscribe(() => s.system.removeTarget(s.t.set));
    step(s, -1);
    expect(() => step(s, 1)).not.toThrow();
  });

  it('refits each target at most once per step with two attackers', () => {
    const s = setup();
    const w2 = weapon();
    const tracer2 = new WeaponTracer({ attacker: {}, weapon: w2 });
    s.system.addAttacker(tracer2, windowOf({ v: true }));
    w2.position.set(-0.5, 0.5, -1);
    w2.updateMatrixWorld(true);
    const upd = vi.spyOn(s.t.set, 'update');
    step(s, -1);
    expect(upd).toHaveBeenCalledTimes(1);
  });

  it('removeAttacker stops tracing; dispose releases targets and is idempotent', () => {
    const s = setup();
    const dispose = vi.spyOn(s.t.set, 'dispose');
    s.system.removeAttacker(s.tracer);
    step(s, -1);
    expect(step(s, 1)).toEqual([]);
    s.system.dispose();
    s.system.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(s.system.targetCount).toBe(0);
    expect(s.system.update(1 / 60)).toEqual([]);
  });
});

describe('WeaponTracer extras', () => {
  it('accepts marker objects for hilt and tip', () => {
    const w = new THREE.Group();
    const hilt = new THREE.Object3D();
    const tip = new THREE.Object3D();
    tip.position.set(0, 1.4, 0);
    w.add(hilt, tip);
    w.rotation.z = -Math.PI / 2; // blade now along +x in world
    w.position.set(-0.5, 0.5, 0);
    w.updateMatrixWorld(true);
    const t = character([{ name: 'torso', x: 0 }]);
    const tracer = new WeaponTracer({ attacker: {}, weapon: w, hilt, tip });
    expect(tracer.tick(true, [t.set])).toHaveLength(1);
  });

  it('starts a new swing when the source swingId changes without the window closing', () => {
    const t = character([{ name: 'torso', x: 0 }]);
    const w = weapon();
    const tracer = new WeaponTracer({ attacker: {}, weapon: w });
    w.position.set(-0.5, 0.5, 0);
    w.updateMatrixWorld(true);
    expect(tracer.tick(true, [t.set], undefined, 1)).toHaveLength(1);
    expect(tracer.tick(true, [t.set], undefined, 1)).toHaveLength(0);
    expect(tracer.tick(true, [t.set], undefined, 2)).toHaveLength(1);
    expect(tracer.swing).toBe(2);
  });
});
