import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { bodyPitch, dominantGait, LEG_IDS, maxLegDelta, QuadrupedGait, type Pose } from './gait';
import { GRIMTOOTH_SCALE, HORSE_PROPORTIONS, HOUND, PUP_SCALE, type QuadrupedParams } from './params';
import { QuadrupedRig, SOCKET_NAMES } from './QuadrupedRig';

const HORSE: QuadrupedParams = { ...HORSE_PROPORTIONS, tint: 0x553322 };
const horseGait = () => new QuadrupedGait(HORSE.legLength, QuadrupedGait.tuningFor(HORSE));

const finitePose = (p: Pose): boolean =>
  [p.lift, p.fall, p.pitch, p.roll, p.neck, p.head, p.tail, p.tailSway, ...LEG_IDS.flatMap((id) => [p.legs[id].upper, p.legs[id].lower])].every(Number.isFinite);

describe('QuadrupedGait', () => {
  it('walks, trots, canters at 9 m/s and gallops at 12 m/s for the horse', () => {
    const tuning = QuadrupedGait.tuningFor(HORSE);
    expect(dominantGait(1.5, tuning)).toBe('walk');
    expect(dominantGait(5.5, tuning)).toBe('trot');
    expect(dominantGait(9, tuning)).toBe('canter');
    expect(dominantGait(12, tuning)).toBe('gallop');
    const g = horseGait();
    g.step(9, 0.02);
    expect(g.gait).toBe('canter');
    g.step(12, 0.02);
    expect(g.gait).toBe('gallop');
  });

  it('the hound still gallops at its chase pace', () => {
    expect(dominantGait(5.5, QuadrupedGait.tuningFor(HOUND))).toBe('gallop');
    expect(dominantGait(1, QuadrupedGait.tuningFor(HOUND))).toBe('walk');
  });

  it('step advances a wrapped phase, ignores bad input, and reset returns to standing', () => {
    const g = horseGait();
    for (let i = 0; i < 100; i++) g.step(12, 0.02);
    expect(g.phase).toBeGreaterThan(0);
    expect(g.phase).toBeLessThan(1);
    const before = g.phase;
    g.step(Number.NaN, 0.02);
    g.step(12, Number.NaN);
    g.step(12, -1);
    expect(g.phase).toBe(before);
    g.reset();
    expect(g.phase).toBe(0);
    expect(g.speed).toBe(0);
    expect(g.gait).toBe('walk');
  });

  it('a load mid-gallop: a fresh or reset gait gives a sane pose, no NaN, phase 0', () => {
    const g = horseGait();
    for (let i = 0; i < 77; i++) g.step(12, 0.02);
    g.reset();
    expect(g.phase).toBe(0);
    expect(finitePose(g.pose(0))).toBe(true);
    // The rig is rebuilt on load too: a new gait starts the same.
    const fresh = horseGait();
    expect(fresh.phase).toBe(0);
    expect(finitePose(fresh.pose(0))).toBe(true);
    expect(maxLegDelta(fresh.pose(0), g.pose(0))).toBeLessThan(1e-9);
    // And it can gallop again at once without a jump from rest beyond the ramp.
    fresh.step(12, 0.02);
    expect(finitePose(fresh.pose(0))).toBe(true);
  });

  it('gallop to walk with a speed that ramps down at the body limit never jumps a leg', () => {
    const g = horseGait();
    const dt = 0.02;
    for (let i = 0; i < 100; i++) g.step(12, dt);
    let prev = g.pose(0);
    let worst = 0;
    // Deceleration at 12 m/s^2 (the body's MAX_DECEL class), from 12 down to walking pace.
    for (let speed = 12; speed > 1.5; speed -= 12 * dt) {
      g.step(speed, dt);
      const now = g.pose(0);
      worst = Math.max(worst, maxLegDelta(prev, now));
      prev = now;
    }
    expect(worst).toBeLessThan(0.35);
  });

  it('an abrupt switch from gallop to walk speed still keeps the phase continuous', () => {
    const g = horseGait();
    for (let i = 0; i < 100; i++) g.step(12, 0.02);
    const p = g.phase;
    g.step(2, 0.02);
    const d = Math.abs(g.phase - p);
    expect(Math.min(d, 1 - d)).toBeLessThan(0.1);
  });
});

describe('bodyPitch', () => {
  it('is atan2 of the height difference over the length, and 0 for bad input', () => {
    expect(bodyPitch(1, 1, 2)).toBe(0);
    expect(bodyPitch(1.5, 1, 1)).toBeCloseTo(Math.atan2(0.5, 1));
    expect(bodyPitch(1, 1.5, 1)).toBeCloseTo(-Math.atan2(0.5, 1));
    expect(bodyPitch(1, 0, 0)).toBe(0);
    expect(bodyPitch(Number.NaN, 0, 1)).toBe(0);
  });
});

describe('rig sockets and scale', () => {
  it('has saddle, mane, head, tail and collar through the typed accessor, riding their joints', () => {
    const rig = QuadrupedRig.build(HORSE);
    const s = QuadrupedRig.sockets(rig);
    const j = QuadrupedRig.joints(rig);
    expect(Object.keys(s).sort()).toEqual(['collar', 'head', 'mane', 'saddle', 'tail']);
    expect(s.saddle.parent).toBe(j.spine);
    expect(s.mane.parent).toBe(j.neck);
    expect(s.collar.parent).toBe(j.neck);
    expect(s.head.parent).toBe(j.head);
    expect(s.tail.parent).toBe(j.tail);
    for (const name of Object.values(SOCKET_NAMES)) expect(rig.getObjectByName(name)).toBeDefined();
    // The saddle is on the back: above the legs and near the middle of the body.
    rig.updateMatrixWorld(true);
    const at = new THREE.Vector3();
    s.saddle.getWorldPosition(at);
    expect(at.y).toBeGreaterThan(HORSE.legLength);
    expect(Math.abs(at.z)).toBeLessThan(0.05);
    // Moving the head joint moves its socket.
    const before = s.head.getWorldPosition(new THREE.Vector3());
    j.neck.rotation.x += 0.4;
    rig.updateMatrixWorld(true);
    expect(s.head.getWorldPosition(new THREE.Vector3()).distanceTo(before)).toBeGreaterThan(0.05);
    QuadrupedRig.sockets(rig);
    QuadrupedRig.dispose(rig);
  });

  it('throws for a foreign object', () => {
    expect(() => QuadrupedRig.sockets(new THREE.Group())).toThrow();
  });

  it('scale presets are 1.8 and 0.5, and scaling multiplies the rig size', () => {
    expect(GRIMTOOTH_SCALE).toBe(1.8);
    expect(PUP_SCALE).toBe(0.5);
    const a = QuadrupedRig.build(HOUND);
    const b = QuadrupedRig.build({ ...HOUND, scale: GRIMTOOTH_SCALE });
    const size = (o: THREE.Object3D) => new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3());
    expect(size(b).y / size(a).y).toBeCloseTo(1.8, 1);
    QuadrupedRig.dispose(a);
    QuadrupedRig.dispose(b);
  });

  it('dispose at scale 1.8 frees every geometry and material, sockets included, once', () => {
    const rig = QuadrupedRig.build({ ...HOUND, scale: GRIMTOOTH_SCALE });
    const spies: Array<ReturnType<typeof vi.fn>> = [];
    rig.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const fn = vi.fn();
      m.geometry.addEventListener('dispose', fn);
      spies.push(fn);
    });
    for (const m of Object.values(QuadrupedRig.materials(rig))) {
      const fn = vi.fn();
      m.addEventListener('dispose', fn);
      spies.push(fn);
    }
    const parent = new THREE.Group();
    parent.add(rig);
    QuadrupedRig.dispose(rig);
    expect(spies.length).toBeGreaterThan(15);
    for (const s of spies) expect(s).toHaveBeenCalledTimes(1);
    expect(rig.parent).toBeNull();
    expect(() => QuadrupedRig.dispose(rig)).not.toThrow();
  });
});
