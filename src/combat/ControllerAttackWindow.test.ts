import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { AnimationController } from '../characters/AnimationController';
import type { AnimationEvent } from '../characters/AnimationEvents';
import { KNIGHT_ATTACKS, type AttackClipDef } from '../characters/knightClips';
import { isWindowActive } from './AttackWindow';
import { ControllerAttackWindow, type AttackStateSource } from './ControllerAttackWindow';

const GROUNDED = { grounded: true, horizontalSpeed: 0, verticalSpeed: 0 };

// Float32 keyframes like GLTFLoader's clips; attack clips last whole ticks.
const DURATIONS: Record<string, number> = {
  Idle: 1.0666667,
  Walking_A: 1.0666667,
  Running_A: 0.8,
  Jump_Start: 0.6,
  Jump_Idle: 1.0666667,
  Jump_Land: 0.6666667,
  '1H_Melee_Attack_Slice_Horizontal': 1.0666667,
  '1H_Melee_Attack_Slice_Diagonal': 1,
  '1H_Melee_Attack_Chop': 1.0666667,
  '1H_Melee_Attack_Stab': 1.6,
};

function controllerWith(attacks?: readonly AttackClipDef[]) {
  const root = new THREE.Group();
  const hips = new THREE.Bone();
  hips.name = 'hips';
  root.add(hips);
  const clips = Object.entries(DURATIONS).map(
    ([n, d]) =>
      new THREE.AnimationClip(n, undefined, [
        new THREE.VectorKeyframeTrack('hips.position', new Float32Array([0, d]), [0, 0, 0, 0, 1, 0]),
      ]),
  );
  const controller = new AnimationController(root, clips, { warn: vi.fn(), attacks });
  const events: AnimationEvent[] = [];
  controller.events.subscribe((e) => events.push(e));
  return { controller, events };
}

describe('ControllerAttackWindow with a fake source', () => {
  const fake = (a: ReturnType<AttackStateSource['activeAttack']>): AttackStateSource => ({ activeAttack: () => a });
  const attack = { clip: 'c', activeStart: 0.2, activeEnd: 0.4, normalizedTime: 0.3, active: true, swingId: 7 };

  it('passes the clip, window, time and swing id through', () => {
    const w = new ControllerAttackWindow(fake(attack));
    expect([w.clipName, w.start, w.end, w.swingId, w.currentTime()]).toEqual(['c', 0.2, 0.4, 7, 0.3]);
    expect(isWindowActive(w)).toBe(true);
  });

  it('never fires without an attack (null activeAttack)', () => {
    const w = new ControllerAttackWindow(fake(null));
    expect(w.currentTime()).toBeNull();
    expect(w.swingId).toBeUndefined();
    expect(isWindowActive(w)).toBe(false);
  });

  it('is inactive before and after the window', () => {
    for (const t of [0.1, 0.45, 1]) {
      const w = new ControllerAttackWindow(fake({ ...attack, normalizedTime: t, active: false }));
      expect(isWindowActive(w)).toBe(false);
    }
  });

  it('counts a window skipped within one tick as active for that tick', () => {
    const w = new ControllerAttackWindow(fake({ ...attack, normalizedTime: 0.5, active: true }));
    expect(isWindowActive(w)).toBe(true);
  });

  it('follows a swingId change and the attack changing under it', () => {
    let a: ReturnType<AttackStateSource['activeAttack']> = attack;
    const w = new ControllerAttackWindow({ activeAttack: () => a });
    a = { ...attack, swingId: 8, clip: 'd', activeStart: 0.5, activeEnd: 0.6, normalizedTime: 0.55 };
    expect([w.swingId, w.clipName, w.start, w.end]).toEqual([8, 'd', 0.5, 0.6]);
    expect(isWindowActive(w)).toBe(true);
  });
});

describe('ControllerAttackWindow against the real AnimationController', () => {
  for (const def of KNIGHT_ATTACKS) {
    it(`${def.clip}: the tracer window equals the controller's active flag on every tick`, () => {
      const { controller, events } = controllerWith();
      const window = new ControllerAttackWindow(controller);
      expect(controller.playAttack(def.clip)).toBe(true);
      let activeTicks = 0;
      for (let i = 0; i < 200; i++) {
        controller.fixedUpdate(GROUNDED);
        const a = controller.activeAttack();
        expect(isWindowActive(window)).toBe(a ? a.active : false);
        if (!a) break;
        if (a.active) activeTicks++;
      }
      expect(activeTicks).toBeGreaterThan(0);
      // The ticks seen by the adapter are exactly those the controller reported as active.
      const progress = events.filter((e) => e.type === 'attackProgress' && e.active).length;
      expect(activeTicks).toBe(progress);
      expect(window.currentTime()).toBeNull(); // attack over
    });
  }

  it('agrees on both inclusive boundaries (a window edge landing exactly on a tick)', () => {
    // Slice_Horizontal: 64 ticks; 0.25 and 0.5 land on ticks 16 and 32.
    const attacks: AttackClipDef[] = [{ clip: '1H_Melee_Attack_Slice_Horizontal', activeStart: 0.25, activeEnd: 0.5 }];
    const { controller } = controllerWith(attacks);
    const window = new ControllerAttackWindow(controller);
    controller.playAttack(attacks[0].clip);
    const active: number[] = [];
    for (let i = 1; i <= 70; i++) {
      controller.fixedUpdate(GROUNDED);
      const a = controller.activeAttack();
      expect(isWindowActive(window)).toBe(a ? a.active : false);
      if (a && isWindowActive(window)) active.push(i);
    }
    // Float32 clip durations can put an edge a hair off its tick; the window is still contiguous and
    // 16 or 17 ticks long, the same as the controller's own active flag.
    expect(active.at(-1)! - active[0] + 1).toBe(active.length);
    expect(active.length).toBeGreaterThanOrEqual(16);
    expect(active.length).toBeLessThanOrEqual(17);
  });

  it('a window shorter than one tick still fires exactly once', () => {
    const attacks: AttackClipDef[] = [{ clip: '1H_Melee_Attack_Chop', activeStart: 0.301, activeEnd: 0.302 }];
    const { controller } = controllerWith(attacks);
    const window = new ControllerAttackWindow(controller);
    controller.playAttack(attacks[0].clip);
    let fired = 0;
    for (let i = 0; i < 100; i++) {
      controller.fixedUpdate(GROUNDED);
      const a = controller.activeAttack();
      expect(isWindowActive(window)).toBe(a ? a.active : false);
      if (isWindowActive(window)) fired++;
    }
    expect(fired).toBe(1);
  });

  it('closes when the attack is interrupted and stays closed', () => {
    const { controller } = controllerWith();
    const window = new ControllerAttackWindow(controller);
    controller.playAttack('1H_Melee_Attack_Slice_Horizontal');
    for (let i = 0; i < 12; i++) controller.fixedUpdate(GROUNDED); // inside the windup
    controller.fixedUpdate({ grounded: false, horizontalSpeed: 0, verticalSpeed: 6 });
    for (let i = 0; i < 80; i++) {
      controller.fixedUpdate(GROUNDED);
      expect(isWindowActive(window)).toBe(controller.activeAttack()?.active ?? false);
    }
    expect(window.currentTime()).toBeNull();
  });

  it('the swing id changes between two swings', () => {
    const { controller } = controllerWith();
    const window = new ControllerAttackWindow(controller);
    const ids = new Set<number>();
    for (let swing = 0; swing < 2; swing++) {
      controller.playAttack('1H_Melee_Attack_Stab');
      for (let i = 0; i < 120; i++) {
        controller.fixedUpdate(GROUNDED);
        if (isWindowActive(window)) ids.add(window.swingId!);
      }
    }
    expect(ids.size).toBe(2);
  });
});
