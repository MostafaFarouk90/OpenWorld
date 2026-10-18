import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { FIXED_TIMESTEP } from '../config/constants';
import { AnimationController } from './AnimationController';
import type { AnimationEvent } from './AnimationEvents';
import { KNIGHT_ATTACKS, type AttackClipDef } from './knightClips';
import type { LocomotionInput } from './locomotionState';

const DT = FIXED_TIMESTEP;
const IDLE: LocomotionInput = { grounded: true, horizontalSpeed: 0, verticalSpeed: 0 };

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
  Blocking: 1.0666667,
  Block_Hit: 1.0666667,
  Dodge_Forward: 0.4,
  Hit_A: 0.6666667,
  Hit_B: 0.8666667,
  Death_A: 0.8,
  // A second class's attacks.
  Cast_A: 0.8,
  Cast_B: 0.8,
  Cast_C: 1.2,
  Cast_D: 0.8,
};
const MAGE: AttackClipDef[] = [
  { clip: 'Cast_A', activeStart: 0.2, activeEnd: 0.4 },
  { clip: 'Cast_B', activeStart: 0.2, activeEnd: 0.4 },
  { clip: 'Cast_C', activeStart: 0.3, activeEnd: 0.5 },
  { clip: 'Cast_D', activeStart: 0.2, activeEnd: 0.4 },
];

function setup(omit: string[] = []) {
  const root = new THREE.Group();
  const hips = new THREE.Bone();
  hips.name = 'hips';
  root.add(hips);
  const clips = Object.entries(DURATIONS)
    .filter(([n]) => !omit.includes(n))
    .map(([n, d]) => new THREE.AnimationClip(n, undefined, [new THREE.VectorKeyframeTrack('hips.position', new Float32Array([0, d]), [0, 0, 0, 0, 1, 0])]));
  const controller = new AnimationController(root, clips, { warn: vi.fn() });
  const events: AnimationEvent[] = [];
  controller.events.subscribe((e) => events.push(e));
  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) controller.fixedUpdate(IDLE);
  };
  tick(5);
  return { controller, events, tick };
}

/** Ticks from queueing the attack until its clipEnd. */
function ticksToFinish(clipName: string, speed: number): number {
  const { controller, events, tick } = setup();
  controller.setAttackSpeed(speed);
  expect(controller.playAttack(clipName)).toBe(true);
  let n = 0;
  while (!events.some((e) => e.type === 'clipEnd' && e.clip === clipName) && n < 400) {
    tick();
    n++;
  }
  return n;
}

describe('setWalkWhileBlocking', () => {
  it('is off by default: block locks movement', () => {
    const { controller, tick } = setup();
    controller.enterAction('block');
    tick(3);
    expect(controller.currentAction).toBe('block');
    expect(controller.movementLocked).toBe(true);
  });

  it('on: a held block no longer locks movement', () => {
    const { controller, tick } = setup();
    controller.setWalkWhileBlocking(true);
    controller.enterAction('block');
    tick(3);
    expect(controller.currentAction).toBe('block');
    expect(controller.movementLocked).toBe(false);
  });

  it('on: blockHit and dodge still lock movement', () => {
    const { controller, tick } = setup();
    controller.setWalkWhileBlocking(true);
    controller.enterAction('blockHit');
    tick(2);
    expect(controller.movementLocked).toBe(true);
    controller.exitAction();
    tick(2);
    controller.enterAction('dodge');
    tick(2);
    expect(controller.currentAction).toBe('dodge');
    expect(controller.movementLocked).toBe(true);
  });

  it('on: attacks and stagger still lock movement', () => {
    const { controller, tick } = setup();
    controller.setWalkWhileBlocking(true);
    controller.playAttack(KNIGHT_ATTACKS[0].clip);
    expect(controller.movementLocked).toBe(true);
    tick(2);
    expect(controller.movementLocked).toBe(true);
    controller.enterAction('stagger');
    tick(2);
    expect(controller.movementLocked).toBe(true);
  });

  it('turning it off again locks the block', () => {
    const { controller, tick } = setup();
    controller.setWalkWhileBlocking(true);
    controller.enterAction('block');
    tick(2);
    controller.setWalkWhileBlocking(false);
    expect(controller.movementLocked).toBe(true);
  });
});

describe('attackClip', () => {
  it('maps slots 1..4 to the Knight clips by default', () => {
    const { controller } = setup();
    KNIGHT_ATTACKS.forEach((a, i) => expect(controller.attackClip(i + 1)).toBe(a.clip));
  });

  it.each([0, 5, -1, NaN, 1.5, Infinity])('gives undefined for slot %s', (slot) => {
    expect(setup().controller.attackClip(slot)).toBeUndefined();
  });
});

describe('setAttackSet', () => {
  it('replaces the four attacks: new clips play, old clips are refused', () => {
    const { controller, tick } = setup();
    expect(controller.setAttackSet(MAGE)).toBe(true);
    expect(controller.attackClip(1)).toBe('Cast_A');
    expect(controller.attackClip(4)).toBe('Cast_D');
    expect(controller.playAttack(KNIGHT_ATTACKS[0].clip)).toBe(false);
    expect(controller.playAttack('Cast_C')).toBe(true);
    tick(2);
    expect(controller.state).toBe('attack');
    expect(controller.activeAttack()?.clip).toBe('Cast_C');
    expect(controller.activeAttack()?.activeStart).toBe(0.3);
  });

  it('can switch back to the Knight set', () => {
    const { controller } = setup();
    controller.setAttackSet(MAGE);
    expect(controller.setAttackSet(KNIGHT_ATTACKS)).toBe(true);
    expect(controller.playAttack(KNIGHT_ATTACKS[1].clip)).toBe(true);
  });

  it('is refused while an attack is queued, and nothing changes', () => {
    const { controller } = setup();
    controller.playAttack(KNIGHT_ATTACKS[0].clip);
    expect(controller.setAttackSet(MAGE)).toBe(false);
    expect(controller.attackClip(1)).toBe(KNIGHT_ATTACKS[0].clip);
  });

  it('is refused while an attack plays, and allowed again once it ends', () => {
    const { controller, tick } = setup();
    controller.playAttack(KNIGHT_ATTACKS[0].clip);
    tick(3);
    expect(controller.state).toBe('attack');
    expect(controller.setAttackSet(MAGE)).toBe(false);
    expect(controller.attackClip(1)).toBe(KNIGHT_ATTACKS[0].clip);
    tick(Math.ceil(DURATIONS[KNIGHT_ATTACKS[0].clip] / DT) + 5);
    expect(controller.state).not.toBe('attack');
    expect(controller.setAttackSet(MAGE)).toBe(true);
  });

  it('is refused when none of the clips exist in the file, and nothing changes', () => {
    const { controller } = setup();
    const ghosts: AttackClipDef[] = [1, 2, 3, 4].map((i) => ({ clip: `Ghost_${i}`, activeStart: 0.1, activeEnd: 0.2 }));
    expect(controller.setAttackSet(ghosts)).toBe(false);
    expect(controller.setAttackSet([])).toBe(false);
    expect(controller.attackClip(1)).toBe(KNIGHT_ATTACKS[0].clip);
    expect(controller.playAttack(KNIGHT_ATTACKS[0].clip)).toBe(true);
  });

  it('accepts a set where only some clips exist; the missing ones are refused by playAttack', () => {
    const { controller } = setup(['Cast_B']);
    expect(controller.setAttackSet(MAGE)).toBe(true);
    expect(controller.attackClip(2)).toBe('Cast_B');
    expect(controller.playAttack('Cast_B')).toBe(false);
    expect(controller.playAttack('Cast_A')).toBe(true);
  });

  it('is refused after dispose', () => {
    const { controller } = setup();
    controller.dispose();
    expect(controller.setAttackSet(MAGE)).toBe(false);
  });
});

describe('setAttackSpeed', () => {
  it('an attack at 2x finishes in about half the ticks of 1x', () => {
    const normal = ticksToFinish(KNIGHT_ATTACKS[0].clip, 1);
    const fast = ticksToFinish(KNIGHT_ATTACKS[0].clip, 2);
    expect(normal).toBeGreaterThan(50);
    expect(fast / normal).toBeGreaterThan(0.45);
    expect(fast / normal).toBeLessThan(0.58);
  });

  it('an attack at 0.5x takes about twice as long', () => {
    const normal = ticksToFinish(KNIGHT_ATTACKS[0].clip, 1);
    const slow = ticksToFinish(KNIGHT_ATTACKS[0].clip, 0.5);
    expect(slow / normal).toBeGreaterThan(1.85);
    expect(slow / normal).toBeLessThan(2.15);
  });

  it('clamps to 0.5..2', () => {
    const base = ticksToFinish(KNIGHT_ATTACKS[0].clip, 1);
    expect(ticksToFinish(KNIGHT_ATTACKS[0].clip, 10)).toBe(ticksToFinish(KNIGHT_ATTACKS[0].clip, 2));
    expect(ticksToFinish(KNIGHT_ATTACKS[0].clip, 0.01)).toBe(ticksToFinish(KNIGHT_ATTACKS[0].clip, 0.5));
    expect(base).toBeGreaterThan(0);
  });

  it.each([NaN, 0, -1, -Infinity, Infinity])('%s resets to 1', (bad) => {
    const base = ticksToFinish(KNIGHT_ATTACKS[0].clip, 1);
    const { controller, events, tick } = setup();
    controller.setAttackSpeed(2);
    controller.setAttackSpeed(bad);
    controller.playAttack(KNIGHT_ATTACKS[0].clip);
    let n = 0;
    while (!events.some((e) => e.type === 'clipEnd' && e.clip === KNIGHT_ATTACKS[0].clip) && n < 400) {
      tick();
      n++;
    }
    expect(n).toBe(base);
  });

  it('does not change the speed of non-attack clips', () => {
    const { controller, tick } = setup();
    controller.setAttackSpeed(2);
    tick(3);
    expect(controller.action('Idle')!.timeScale).toBe(1);
  });
});
