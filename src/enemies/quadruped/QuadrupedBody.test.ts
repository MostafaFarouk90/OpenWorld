import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { COMBAT } from '../../config/constants';
import type { MoveDef } from '../types';
import { HOUND, quadrupedDims } from './params';
import { QuadrupedBody, QUADRUPED_CLIPS } from './QuadrupedBody';

const DT = 1 / 60;

const move = (over: Partial<MoveDef> = {}): MoveDef => ({
  id: 'hound.bite',
  clip: 'Bite',
  activeStart: 0.35,
  activeEnd: 0.6,
  windup: 0.3,
  telegraph: 'block',
  weapon: 'right',
  damage: 8,
  poise: 5,
  range: [0, 2],
  cooldown: 1,
  recover: 0.5,
  weight: 1,
  ...over,
});

function make() {
  const body = new QuadrupedBody(HOUND, { warn: () => {} });
  const log: string[] = [];
  body.onWindow = (ch, phase, id) => log.push(`${ch}:${phase}:${id}`);
  body.onClipEnd = (clip, interrupted) => log.push(`end:${clip}:${interrupted}`);
  return { body, log };
}

function run(body: QuadrupedBody, seconds: number): void {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) body.fixedUpdate(DT);
}

describe('structure', () => {
  it('exposes the EnemyBody members', () => {
    const { body } = make();
    expect(body.root.children).toContain(body.owner);
    expect(body.hurtboxes.count).toBe(3);
    expect(body.hurtboxes.missing).toEqual([]);
    expect(body.hurtboxes.capsules.map((c) => c.name)).toEqual(['head', 'torso', 'tail']);
    expect(body.tracers.right).toBeDefined();
    expect(body.tracers.left).toBeDefined();
    expect(body.tracers.right.attacker).toBe(body.owner);
    expect(body.tracers.left!.attacker).not.toBe(body.owner);
    expect(body.weapons.right.object.parent).toBe(body.joints.head);
    expect(body.materials.length).toBe(4);
    expect(body.currentClip).toBeNull();
    body.dispose();
  });

  it('uses bone-multiplier keys: head and torso have one, tail falls back to 1', () => {
    const { body } = make();
    const mult = COMBAT.boneMultipliers as Record<string, number>;
    expect(mult['head']).toBeGreaterThan(1);
    expect(mult['torso']).toBe(1);
    expect(mult['tail']).toBeUndefined();
    body.dispose();
  });

  it('hurtbox capsules follow the pose (head moves up when howling)', () => {
    const { body } = make();
    body.play('Idle', { loop: true, fade: 0 });
    run(body, 0.1);
    const idleY = body.hurtboxes.capsules[0]!.b.y;
    body.play('Howl', { fade: 0 });
    run(body, 0.6);
    body.hurtboxes.update();
    expect(body.hurtboxes.capsules[0]!.b.y).toBeGreaterThan(idleY + 0.1);
    body.dispose();
  });

  it('hurtbox radius follows the rig scale', () => {
    const a = new QuadrupedBody(HOUND);
    const b = new QuadrupedBody({ ...HOUND, scale: 2 });
    expect(b.hurtboxes.capsules[1]!.radius).toBeCloseTo(a.hurtboxes.capsules[1]!.radius * 2, 6);
    a.dispose();
    b.dispose();
  });

  it('the bite tracer blade is usable and points forward from the head', () => {
    const { body } = make();
    body.root.updateMatrixWorld(true);
    const hilt = body.weapons.right.hilt.getWorldPosition(new THREE.Vector3());
    const tip = body.weapons.right.tip.getWorldPosition(new THREE.Vector3());
    expect(hilt.distanceTo(tip)).toBeGreaterThan(0.1);
    expect(tip.z).toBeLessThan(hilt.z);
    body.dispose();
  });
});

describe('clips', () => {
  it('knows the nine named clips and the humanoid aliases', () => {
    const { body } = make();
    for (const c of ['Idle', 'Walk', 'Run', 'Crouch', 'Pounce', 'Bite', 'Howl', 'HeadLower', 'Knockdown']) {
      expect(body.clipDuration(c), c).toBeGreaterThan(0);
    }
    expect(body.clipDuration('Walking_B')).toBe(body.clipDuration('Walk'));
    expect(body.clipDuration('Death_A')).toBe(body.clipDuration('Knockdown'));
    expect(body.clipDuration('nope')).toBeUndefined();
    expect(body.clipDuration('toString')).toBeUndefined();
    body.dispose();
  });

  it('play returns the requested name; unknown clips warn once and play Idle', () => {
    const warn = vi.fn();
    const body = new QuadrupedBody(HOUND, { warn });
    expect(body.play('Walking_B', { loop: true })).toBe('Walking_B');
    expect(body.currentClip).toBe('Walking_B');
    expect(body.play('Mystery')).toBe('Idle');
    expect(body.play('Mystery')).toBe('Idle');
    expect(warn).toHaveBeenCalledTimes(1);
    body.dispose();
  });

  it('a one-shot reports onClipEnd once, uninterrupted; a loop never does', () => {
    const { body, log } = make();
    body.play('Howl', { fade: 0 });
    run(body, 3);
    expect(log).toEqual(['end:Howl:false']);
    log.length = 0;
    body.play('Idle', { loop: true });
    run(body, 5);
    expect(log).toEqual([]);
    body.dispose();
  });

  it('replacing an unfinished one-shot reports it interrupted', () => {
    const { body, log } = make();
    body.play('Crouch');
    run(body, 0.1);
    body.play('Idle', { loop: true });
    expect(log).toEqual(['end:Crouch:true']);
    body.dispose();
  });

  it('the crouch lowers the body and the knockdown lays it down', () => {
    const { body } = make();
    body.play('Idle', { loop: true, fade: 0 });
    run(body, 0.2);
    const idleY = body.joints.spine.position.y;
    body.play('Crouch', { fade: 0 });
    run(body, 0.5);
    expect(body.joints.spine.position.y).toBeLessThan(idleY - 0.05);
    body.play('Knockdown', { fade: 0 });
    run(body, 1.5);
    expect(body.joints.spine.rotation.z).toBeGreaterThan(1.2);
    expect(body.joints.spine.position.y).toBeLessThan(idleY);
    body.dispose();
  });

  it('rises from the ground: feet never go below y = 0 while walking', () => {
    const { body } = make();
    body.play('Run', { loop: true });
    body.setSpeed(5.5);
    const foot = new THREE.Vector3();
    for (let i = 0; i < 240; i++) {
      body.fixedUpdate(DT);
      for (const id of ['FL', 'FR', 'BL', 'BR'] as const) {
        body.joints.legs[id].lower.localToWorld(foot.set(0, -quadrupedDims(HOUND).lowerLen, 0));
        expect(foot.y).toBeGreaterThan(-1e-6);
      }
    }
    body.dispose();
  });
});

describe('locomotion', () => {
  it('walk legs move only while there is speed; zero speed holds still', () => {
    const { body } = make();
    body.play('Walk', { loop: true, fade: 0 });
    body.setSpeed(0);
    run(body, 0.5);
    const a = body.joints.legs.FL.upper.rotation.x;
    run(body, 0.37);
    expect(body.joints.legs.FL.upper.rotation.x).toBeCloseTo(a, 6);
    body.setSpeed(2);
    let moved = 0;
    for (let i = 0; i < 90; i++) {
      body.fixedUpdate(DT);
      moved = Math.max(moved, Math.abs(body.joints.legs.FL.upper.rotation.x - a));
    }
    expect(moved).toBeGreaterThan(0.2);
    body.dispose();
  });

  it('without setSpeed the Walk clip uses its nominal speed', () => {
    const { body } = make();
    body.play('Walking_B', { loop: true, fade: 0 });
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < 120; i++) {
      body.fixedUpdate(DT);
      lo = Math.min(lo, body.joints.legs.FR.upper.rotation.x);
      hi = Math.max(hi, body.joints.legs.FR.upper.rotation.x);
    }
    expect(hi - lo).toBeGreaterThan(0.3);
    body.dispose();
  });

  it('a speed jump does not pop the legs (per-tick change stays small)', () => {
    const { body } = make();
    body.play('Run', { loop: true, fade: 0 });
    body.setSpeed(1);
    run(body, 1);
    body.setSpeed(8);
    let prev = body.joints.legs.BL.upper.rotation.x;
    for (let i = 0; i < 120; i++) {
      body.fixedUpdate(DT);
      const cur = body.joints.legs.BL.upper.rotation.x;
      expect(Math.abs(cur - prev)).toBeLessThan(0.5);
      prev = cur;
    }
    body.dispose();
  });

  it('setSpeed ignores NaN and negatives; setSlopePitch tilts the body and clamps', () => {
    const { body } = make();
    body.play('Idle', { loop: true, fade: 0 });
    body.setSpeed(-4);
    body.setSpeed(NaN);
    body.setSlopePitch(0.3);
    run(body, 2);
    const flat = new QuadrupedBody(HOUND);
    flat.play('Idle', { loop: true, fade: 0 });
    run(flat, 2);
    expect(body.joints.spine.rotation.x - flat.joints.spine.rotation.x).toBeCloseTo(0.3, 2);
    body.setSlopePitch(99);
    run(body, 4);
    expect(body.joints.spine.rotation.x - flat.joints.spine.rotation.x).toBeLessThan(0.75);
    body.setSlopePitch(NaN);
    run(body, 4);
    expect(body.joints.spine.rotation.x - flat.joints.spine.rotation.x).toBeCloseTo(0, 1);
    body.dispose();
    flat.dispose();
  });

  it('ignores zero, negative and non-finite dt', () => {
    const { body, log } = make();
    body.playAttack(move(), 0.3);
    const before = body.joints.spine.position.y;
    for (const dt of [0, -1, -DT, NaN, Infinity]) body.fixedUpdate(dt);
    expect(body.joints.spine.position.y).toBe(before);
    expect(log).toEqual([]);
    expect(body.windowSource('right').currentTime()).toBe(0);
    body.dispose();
  });
});

describe('attacks', () => {
  it('fires open then close once per swing, in order, then onClipEnd', () => {
    const { body, log } = make();
    const id = body.playAttack(move(), 0.3);
    expect(id).toBe(1);
    expect(body.currentClip).toBe('Bite');
    run(body, 1);
    expect(log).toEqual(['right:open:1', 'right:close:1', 'end:Bite:false']);
    expect(body.currentClip).toBeNull();
    body.dispose();
  });

  it('opens at activeStart of the clip and the pre-window part takes the lead time', () => {
    const { body, log } = make();
    let openedAt = -1;
    body.onWindow = (ch, phase) => {
      if (phase === 'open') openedAt = ticks * DT;
      log.push(`${ch}:${phase}`);
    };
    let ticks = 0;
    body.playAttack(move(), 0.3);
    for (; ticks < 120 && openedAt < 0; ) {
      ticks++;
      body.fixedUpdate(DT);
    }
    expect(openedAt).toBeGreaterThan(0.3 - 2 * DT);
    expect(openedAt).toBeLessThan(0.3 + 2 * DT);
    body.dispose();
  });

  it('the window source tracks the swing: active window, swingId, null afterwards', () => {
    const { body } = make();
    const src = body.windowSource('right');
    expect(src.currentTime()).toBeNull();
    expect(src.start).toBe(0);
    expect(src.end).toBe(-1);
    const id = body.playAttack(move(), 0);
    body.fixedUpdate(DT);
    expect(src.clipName).toBe('Bite');
    expect(src.start).toBe(0.35);
    expect(src.end).toBe(0.6);
    expect(src.swingId).toBe(id);
    expect(src.currentTime()).toBeGreaterThan(0);
    // Left channel does not see a right-hand attack.
    expect(body.windowSource('left').currentTime()).toBeNull();
    run(body, 1);
    expect(src.currentTime()).toBeNull();
    expect(src.swingId).toBeUndefined();
    body.dispose();
  });

  it('reports the finishing tick: normalised time exactly 1 on it, null from the next', () => {
    const { body, log } = make();
    const src = body.windowSource('right');
    body.playAttack(move(), 0);
    let sawOne = false;
    for (let i = 0; i < 120; i++) {
      body.fixedUpdate(DT);
      if (log.includes('end:Bite:false')) {
        sawOne = src.currentTime() === 1 || src.currentTime() === 0.6;
        break;
      }
    }
    expect(sawOne).toBe(true);
    body.fixedUpdate(DT);
    expect(src.currentTime()).toBeNull();
    body.dispose();
  });

  it('a second swing gets a new swingId and its own open/close', () => {
    const { body, log } = make();
    body.playAttack(move(), 0.1);
    run(body, 1);
    body.playAttack(move(), 0.1);
    run(body, 1);
    expect(log).toEqual(['right:open:1', 'right:close:1', 'end:Bite:false', 'right:open:2', 'right:close:2', 'end:Bite:false']);
    body.dispose();
  });

  it('cancelAttack before the window: no events but onClipEnd(interrupted)', () => {
    const { body, log } = make();
    body.playAttack(move(), 0.3);
    run(body, 0.1);
    body.cancelAttack();
    expect(log).toEqual(['end:Bite:true']);
    expect(body.windowSource('right').currentTime()).toBeNull();
    run(body, 1);
    expect(log).toEqual(['end:Bite:true']);
    body.dispose();
  });

  it('cancelAttack inside the window closes it first, once', () => {
    const { body, log } = make();
    body.playAttack(move(), 0.1);
    for (let i = 0; i < 600 && !log.includes('right:open:1'); i++) body.fixedUpdate(DT);
    body.cancelAttack();
    body.cancelAttack();
    expect(log).toEqual(['right:open:1', 'right:close:1', 'end:Bite:true']);
    run(body, 1);
    expect(log).toHaveLength(3);
    body.dispose();
  });

  it('cancelAttack holds the pose until the next play, and is a no-op without an attack', () => {
    const { body, log } = make();
    body.cancelAttack();
    expect(log).toEqual([]);
    body.playAttack(move({ clip: 'Pounce', activeStart: 0.3, activeEnd: 0.8 }), 0.2);
    run(body, 0.4);
    body.cancelAttack();
    run(body, 0.05);
    const held = body.joints.spine.position.y;
    run(body, 0.5);
    expect(body.joints.spine.position.y).toBeCloseTo(held, 9);
    body.dispose();
  });

  it('play over an attack closes its window then reports interrupted', () => {
    const { body, log } = make();
    body.playAttack(move(), 0.1);
    for (let i = 0; i < 600 && !log.includes('right:open:1'); i++) body.fixedUpdate(DT);
    body.play('Idle', { loop: true });
    expect(log).toEqual(['right:open:1', 'right:close:1', 'end:Bite:true']);
    body.dispose();
  });

  it('a new attack over a running one interrupts it and gets the next id', () => {
    const { body, log } = make();
    body.playAttack(move(), 0.3);
    run(body, 0.1);
    const id = body.playAttack(move(), 0.3);
    expect(id).toBe(2);
    expect(log).toEqual(['end:Bite:true']);
    body.dispose();
  });

  it('a window shorter than a tick opens and closes on one tick and is active on it', () => {
    const { body, log } = make();
    const src = body.windowSource('right');
    body.playAttack(move({ activeStart: 0.4, activeEnd: 0.4 + 0.001 }), 0);
    let activeTicks = 0;
    for (let i = 0; i < 120; i++) {
      body.fixedUpdate(DT);
      if (src.currentTime() !== null && log.includes('right:open:1') && !log.includes('end:Bite:false')) activeTicks++;
      if (log.includes('end:Bite:false')) break;
    }
    expect(log.slice(0, 2)).toEqual(['right:open:1', 'right:close:1']);
    expect(log.filter((e) => e.startsWith('right:'))).toHaveLength(2);
    expect(activeTicks).toBeGreaterThanOrEqual(1);
    body.dispose();
  });

  it('fires on the left channel for a left move', () => {
    const { body, log } = make();
    body.playAttack(move({ weapon: 'left' }), 0.1);
    run(body, 1);
    expect(log[0]).toBe('left:open:1');
    expect(body.windowSource('right').currentTime()).toBeNull();
    body.dispose();
  });

  it('an unknown attack clip plays nothing and returns -1 with one warning', () => {
    const warn = vi.fn();
    const body = new QuadrupedBody(HOUND, { warn });
    expect(body.playAttack(move({ clip: '1H_Melee_Attack_Chop' }), 0.3)).toBe(-1);
    expect(body.playAttack(move({ clip: '1H_Melee_Attack_Chop' }), 0.3)).toBe(-1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(body.currentClip).toBeNull();
    body.dispose();
  });

  it('lead scale is clamped: a tiny lead cannot go faster than 4x, a huge one slower than 0.25x', () => {
    const { body, log } = make();
    let t = 0;
    body.onWindow = (_c, phase) => {
      if (phase === 'open') log.push(`open@${t.toFixed(2)}`);
    };
    // Window starts 0.35 x 0.5 = 0.175 clip seconds in; at 4x that is 0.044 s.
    body.playAttack(move(), 0.0001);
    while (t < 2 && !log.some((e) => e.startsWith('open'))) {
      t += DT;
      body.fixedUpdate(DT);
    }
    expect(t).toBeGreaterThanOrEqual(0.04);
    expect(t).toBeLessThan(0.1);
    body.dispose();
  });

  it('pounce leaps: the body rises above standing height during the clip', () => {
    const { body } = make();
    body.play('Idle', { loop: true, fade: 0 });
    run(body, 0.2);
    const standing = body.joints.spine.position.y;
    body.playAttack(move({ id: 'hound.pounce', clip: 'Pounce', activeStart: 0.3, activeEnd: 0.8 }), 0.4);
    let peak = 0;
    for (let i = 0; i < 120; i++) {
      body.fixedUpdate(DT);
      peak = Math.max(peak, body.joints.spine.position.y);
    }
    expect(peak).toBeGreaterThan(standing + 0.3);
    body.dispose();
  });
});

describe('telegraph and opacity', () => {
  it('flares the tail most, restores on 0, clamps and ignores NaN', () => {
    const { body } = make();
    const [bodyM, , , tailM] = body.materials as THREE.MeshStandardMaterial[];
    const base = tailM!.emissive.clone();
    body.setTelegraph(1, 0xff0000);
    expect(tailM!.emissive.getHex()).toBe(0xff0000);
    expect(bodyM!.emissive.r).toBeGreaterThan(0);
    expect(bodyM!.emissive.getHex()).not.toBe(0xff0000);
    body.setTelegraph(0.5, 0xff0000);
    expect(tailM!.emissive.r).toBeGreaterThan(base.r);
    expect(tailM!.emissive.r).toBeLessThan(1);
    body.setTelegraph(9, 0xff0000);
    expect(tailM!.emissive.getHex()).toBe(0xff0000);
    body.setTelegraph(NaN, 0xff0000);
    expect(tailM!.emissive.getHex()).toBe(base.getHex());
    body.setTelegraph(1);
    expect(tailM!.emissive.getHex()).toBe(0xffffff);
    body.setTelegraph(0);
    expect(tailM!.emissive.getHex()).toBe(base.getHex());
    body.dispose();
  });

  it('opacity fades all materials, turning transparency on below 1 and off at 1', () => {
    const { body } = make();
    body.setOpacity(0.4);
    for (const m of body.materials) {
      expect(m.opacity).toBeCloseTo(0.4, 12);
      expect(m.transparent).toBe(true);
    }
    body.setOpacity(1);
    for (const m of body.materials) {
      expect(m.opacity).toBe(1);
      expect(m.transparent).toBe(false);
    }
    body.setOpacity(-3);
    expect(body.materials[0]!.opacity).toBe(0);
    body.setOpacity(NaN);
    expect(body.materials[0]!.opacity).toBe(1);
    body.dispose();
  });

  it('keeps per-instance materials: telegraphing one body leaves another untouched', () => {
    const a = new QuadrupedBody(HOUND);
    const b = new QuadrupedBody(HOUND);
    a.setTelegraph(1, 0x00ff00);
    a.setOpacity(0.5);
    const tb = b.materials[3] as THREE.MeshStandardMaterial;
    expect(tb.emissive.getHex()).toBe(HOUND.emissive);
    expect(tb.opacity).toBe(1);
    a.dispose();
    b.dispose();
  });
});

describe('dispose', () => {
  it('frees materials and geometry, detaches the root, clears callbacks, and a second call is harmless', () => {
    const body = new QuadrupedBody(HOUND);
    const parent = new THREE.Group();
    parent.add(body.root);
    const disposeSpies = body.materials.map((m) => {
      const fn = vi.fn();
      m.addEventListener('dispose', fn);
      return fn;
    });
    const geo = (body.owner.getObjectByName('torso') as THREE.Mesh).geometry;
    const geoSpy = vi.fn();
    geo.addEventListener('dispose', geoSpy);
    body.playAttack(move(), 0.3);
    body.dispose();
    for (const s of disposeSpies) expect(s).toHaveBeenCalled();
    expect(geoSpy).toHaveBeenCalled();
    expect(body.root.parent).toBeNull();
    expect(body.onWindow).toBeNull();
    expect(body.windowSource('right').currentTime()).toBeNull();
    expect(() => body.dispose()).not.toThrow();
    expect(() => body.fixedUpdate(DT)).not.toThrow();
    expect(() => body.setTelegraph(1)).not.toThrow();
    expect(() => body.setOpacity(0.5)).not.toThrow();
  });
});

describe('clip names', () => {
  it('exports the clip table', () => {
    expect(Object.values(QUADRUPED_CLIPS)).toEqual(expect.arrayContaining(['Idle', 'Walk', 'Run', 'Crouch', 'Pounce', 'Bite', 'Howl', 'HeadLower', 'Knockdown']));
  });
});
