import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { MoveDef } from '../types';
import { WYRM_ATTACKS, WYRM_CLIP_DURATIONS, WyrmBody } from './WyrmBody';

const DT = 1 / 60;

const move = (over: Partial<MoveDef> = {}): MoveDef => ({
  id: 'ember-wyrm.bite',
  clip: 'Bite',
  activeStart: WYRM_ATTACKS.bite.activeStart,
  activeEnd: WYRM_ATTACKS.bite.activeEnd,
  windup: 0.4,
  telegraph: 'block',
  weapon: 'right',
  damage: 14,
  poise: 10,
  range: [0, 2.2],
  cooldown: 1,
  recover: 0.6,
  weight: 1,
  ...over,
});

function make(opts: ConstructorParameters<typeof WyrmBody>[1] = {}) {
  const body = new WyrmBody({}, { warn: () => {}, jets: { Spit: 7, Puff: 2.5 }, ...opts });
  const log: string[] = [];
  body.onWindow = (ch, phase, id) => log.push(`${ch}:${phase}:${id}`);
  body.onClipEnd = (clip, interrupted) => log.push(`end:${clip}:${interrupted}`);
  return { body, log };
}

function run(body: WyrmBody, seconds: number, each?: () => void): void {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) {
    body.fixedUpdate(DT);
    each?.();
  }
}

const capsule = (body: WyrmBody, name: string) => body.hurtboxes.capsules.find((c) => c.name === name)!;

describe('WyrmBody structure', () => {
  it('exposes the EnemyBody members: eight hurtboxes, mouth and tail tracers with their own attackers', () => {
    const { body } = make();
    expect(body.root.children).toContain(body.owner);
    expect(body.hurtboxes.capsules.map((c) => c.name)).toEqual(['head', 'neck', 'torso', 'belly', 'tail', 'tailTip', 'wingL', 'wingR']);
    expect(body.hurtboxes.missing).toEqual([]);
    expect(body.tracers.right.attacker).toBe(body.owner);
    expect(body.tracers.left!.attacker).not.toBe(body.owner);
    expect(body.materials.length).toBe(2);
    expect(body.currentClip).toBeNull();
    body.dispose();
  });

  it('maps the clip names Enemy asks for and warns once for an unknown clip', () => {
    const warn = vi.fn();
    const body = new WyrmBody({}, { warn });
    expect(body.play('Hit_B')).toBe('Hit_B');
    expect(body.clipDuration('Hit_B')).toBe(WYRM_CLIP_DURATIONS.Knockdown);
    expect(body.clipDuration('Death_A')).toBe(WYRM_CLIP_DURATIONS.Knockdown);
    expect(body.play('Nope')).toBe('Idle');
    body.play('Nope');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(body.playAttack(move({ clip: 'Nope2' }), 0.4)).toBe(-1);
    body.dispose();
  });

  it('altitude lifts the hurtboxes and switches to the flight pose', () => {
    const { body } = make();
    run(body, 0.2);
    body.hurtboxes.update();
    const ground = capsule(body, 'torso').a.y;
    expect(body.lastPose.fold).toBeGreaterThan(0.5);
    body.setAltitude(5);
    run(body, 0.05);
    // The flight pose eases in (no snap on takeoff)...
    expect(body.lastPose.fold).toBeGreaterThan(0.3);
    run(body, 0.6);
    body.hurtboxes.update();
    expect(capsule(body, 'torso').a.y).toBeGreaterThan(ground + 4);
    // ...and is there within about half a second.
    expect(body.lastPose.fold).toBeLessThan(0.05);
    expect(body.lastPose.legTuck).toBeGreaterThan(0.95);
    body.setAltitude(Number.NaN);
    expect(body.altitude).toBe(0);
    body.dispose();
  });

  it('the wing hurtboxes sit on their own sides and the wings flap in flight', () => {
    const { body } = make();
    body.setAltitude(5);
    const ys: number[] = [];
    run(body, 1, () => {
      body.hurtboxes.update();
      const c = capsule(body, 'wingR');
      ys.push(Math.max(c.a.y, c.b.y));
    });
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.3);
    body.hurtboxes.update();
    // The root faces -Z: the right wing is at +x.
    expect(capsule(body, 'wingR').b.x).toBeGreaterThan(0.5);
    expect(capsule(body, 'wingL').b.x).toBeLessThan(-0.5);
    body.dispose();
  });
});

describe('WyrmBody windows', () => {
  it('opens and closes once per swing at the lead time, then ends', () => {
    const { body, log } = make();
    const id = body.playAttack(move(), 0.4);
    expect(body.currentClip).toBe('Bite');
    let openedAt = -1;
    let t = 0;
    run(body, 1.2, () => {
      t += DT;
      if (openedAt < 0 && log.includes(`right:open:${id}`)) openedAt = t;
    });
    expect(openedAt).toBeGreaterThan(0.38);
    expect(openedAt).toBeLessThan(0.44);
    expect(log).toEqual([`right:open:${id}`, `right:close:${id}`, 'end:Bite:false']);
    expect(body.windowSource('right').currentTime()).toBeNull();
    body.dispose();
  });

  it('an interrupt closes an open window before the clip end, and the source goes null at once', () => {
    const { body, log } = make();
    const id = body.playAttack(move(), 0.4);
    run(body, 0.45);
    expect(body.windowSource('right').currentTime()).not.toBeNull();
    body.cancelAttack();
    expect(log).toEqual([`right:open:${id}`, `right:close:${id}`, 'end:Bite:true']);
    expect(body.windowSource('right').currentTime()).toBeNull();
    expect(body.windowSource('right').swingId).toBeUndefined();
    body.dispose();
  });

  it('the tail whip runs on the left channel and sweeps the tail across', () => {
    const { body, log } = make();
    const id = body.playAttack(move({ id: 'ember-wyrm.tailWhip', weapon: 'left', ...WYRM_ATTACKS.tailWhip }), 0.5);
    let whipMin = 0;
    let whipMax = 0;
    run(body, 1.2, () => {
      whipMin = Math.min(whipMin, body.lastPose.whip);
      whipMax = Math.max(whipMax, body.lastPose.whip);
    });
    expect(log[0]).toBe(`left:open:${id}`);
    expect(whipMin).toBeLessThan(-0.8);
    expect(whipMax).toBeGreaterThan(0.8);
    expect(body.windowSource('right').currentTime()).toBeNull();
    body.dispose();
  });
});

describe('WyrmBody telegraph looks', () => {
  it('spit: the mouth glows and the cone fills during the inhale, the jet breathes only in the window', () => {
    const { body } = make();
    body.playAttack(move({ id: 'ember-wyrm.spit', telegraph: 'dodge', ...WYRM_ATTACKS.spit }), 0.7);
    run(body, 0.35);
    expect(body.lastPose.mouth).toBeGreaterThan(0.3);
    expect(body.lastPose.cone).toBeGreaterThan(0.3);
    expect(body.lastPose.breath).toBe(0);
    run(body, 0.4);
    expect(body.lastPose.breath).toBe(1);
    expect(body.lastPose.breathReach).toBe(7);
    expect(body.rig.coneDecal.visible).toBe(true);
    body.dispose();
  });

  it('a spit with no jet configured never breathes', () => {
    const body = new WyrmBody({}, { warn: () => {} });
    body.playAttack(move({ ...WYRM_ATTACKS.spit }), 0.7);
    let breath = 0;
    run(body, 1.3, () => (breath = Math.max(breath, body.lastPose.breath)));
    expect(breath).toBe(0);
    body.dispose();
  });

  it('dive: the wings fold and flash before the stoop', () => {
    const { body } = make();
    body.setAltitude(5);
    run(body, 0.1);
    body.playAttack(move({ id: 'ember-wyrm.dive', telegraph: 'dodge', ...WYRM_ATTACKS.dive }), 0.9);
    run(body, 0.8);
    expect(body.lastPose.fold).toBeGreaterThan(0.8);
    expect(body.lastPose.flash).toBeGreaterThan(0.8);
    expect(body.rig.uniforms.uFlash.value).toBeGreaterThan(0.8);
    body.dispose();
  });

  it('setTelegraph boosts the rim and clamps junk input', () => {
    const { body } = make();
    const base = body.rig.uniforms.uRimStrength.value;
    body.setTelegraph(1);
    expect(body.rig.uniforms.uRimStrength.value).toBeCloseTo(base * 2, 9);
    body.setTelegraph(Number.NaN);
    expect(body.rig.uniforms.uRimStrength.value).toBeCloseTo(base, 9);
    body.setOpacity(0.5);
    expect(body.rig.materials.scales.transparent).toBe(true);
    body.dispose();
  });

  it('knockdown rolls the body onto its side and holds it there', () => {
    const { body } = make();
    body.play('Hit_B');
    run(body, 2);
    expect(body.lastPose.roll).toBeCloseTo(1.1, 6);
    body.dispose();
  });
});

describe('WyrmBody spawn layout and the whip', () => {
  it('the first tick lays the body out behind the head along the facing, level and above ground', () => {
    for (const yaw of [0, Math.PI / 2, 2.5]) {
      const { body } = make();
      body.root.position.set(1200, 7, -300);
      body.root.rotation.set(0, yaw, 0);
      body.fixedUpdate(DT);
      const sp = body.rig.spine.positions;
      const n = body.rig.spine.count;
      const hx = sp[0]!;
      const hz = sp[2]!;
      const tx = sp[(n - 1) * 3]!;
      const tz = sp[(n - 1) * 3 + 2]!;
      // Facing is -Z at yaw 0: the tail lies back along +Z turned by yaw.
      const len = Math.hypot(tx - hx, tz - hz);
      expect(((tx - hx) / len) * Math.sin(yaw) + ((tz - hz) / len) * Math.cos(yaw)).toBeGreaterThan(0.95);
      for (let i = 0; i < n; i++) expect(sp[i * 3 + 1]!).toBeGreaterThan(7);
      body.dispose();
    }
  });

  it('the whip swings the tail mesh and its hurtbox with the tracer', () => {
    const { body } = make();
    run(body, 0.2);
    body.hurtboxes.update();
    const before = capsule(body, 'tailTip').b.clone();
    body.playAttack(move({ id: 'ember-wyrm.tailWhip', weapon: 'left', ...WYRM_ATTACKS.tailWhip }), 0.5);
    let moved = 0;
    run(body, 0.8, () => {
      body.hurtboxes.update();
      moved = Math.max(moved, capsule(body, 'tailTip').b.distanceTo(before));
      const tip = body.rig.tailTip.tip.getWorldPosition(new THREE.Vector3());
      expect(tip.distanceTo(body.rig.joints.tailTip.getWorldPosition(new THREE.Vector3()))).toBeLessThan(1);
    });
    expect(moved).toBeGreaterThan(1.5);
    body.dispose();
  });
});

describe('WyrmBody LOD and budget', () => {
  it('picks the LOD from the camera distance (with hysteresis coming back) and survives dispose twice', () => {
    const { body } = make();
    body.lastCameraDistance = 60;
    body.fixedUpdate(DT);
    expect(body.lod).toBe(1);
    body.lastCameraDistance = 120;
    body.fixedUpdate(DT);
    expect(body.lod).toBe(2);
    body.lastCameraDistance = 88;
    body.fixedUpdate(DT);
    expect(body.lod).toBe(2);
    body.lastCameraDistance = 86;
    body.fixedUpdate(DT);
    expect(body.lod).toBe(1);
    body.lastCameraDistance = 39;
    body.fixedUpdate(DT);
    expect(body.lod).toBe(1);
    body.lastCameraDistance = Number.POSITIVE_INFINITY;
    body.fixedUpdate(DT);
    expect(body.lod).toBe(0);
    body.dispose();
    body.dispose();
    body.fixedUpdate(DT);
  });

  it('far from the origin the instance data stays local to the root', () => {
    const { body } = make();
    body.root.position.set(21000, 30, -4000);
    run(body, 0.5);
    const arr = body.rig.spineMesh.instanceMatrix.array as Float32Array;
    let max = 0;
    for (let i = 0; i < body.rig.spineMesh.count * 16; i++) max = Math.max(max, Math.abs(arr[i]!));
    expect(max).toBeLessThan(20);
    body.dispose();
  });

  it('one fixed tick costs well under 1 ms (600 ticks walking and breathing)', () => {
    const { body } = make();
    body.setSpeed(4);
    run(body, 0.5);
    const yaw = new THREE.Euler();
    const t0 = performance.now();
    for (let i = 0; i < 600; i++) {
      if (i % 90 === 0) body.playAttack(move({ ...WYRM_ATTACKS.spit }), 0.7);
      body.root.position.x += 4 * DT;
      body.root.rotation.copy(yaw.set(0, Math.sin(i * 0.01), 0));
      body.fixedUpdate(DT);
      body.hurtboxes.update();
    }
    const mean = (performance.now() - t0) / 600;
    // The plan's budget is 1 ms on a desktop; CI runners are slower, so the guard is 2 ms.
    expect(mean).toBeLessThan(2);
    body.dispose();
  });
});
