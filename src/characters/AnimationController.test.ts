import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { FIXED_TIMESTEP, KNIGHT, PLAYER } from '../config/constants';
import { AnimationController, crossed } from './AnimationController';
import type { AnimationEvent } from './AnimationEvents';
import {
  ACTION_KINDS,
  GROUNDED_STATES,
  KNIGHT_ACTION_CLIPS,
  KNIGHT_ATTACKS,
  KNIGHT_CLIPS,
  type ActionKind,
} from './knightClips';
import type { LocomotionInput } from './locomotionState';

const DT = FIXED_TIMESTEP;
const IDLE: LocomotionInput = { grounded: true, horizontalSpeed: 0, verticalSpeed: 0 };
const WALK: LocomotionInput = { grounded: true, horizontalSpeed: PLAYER.walkSpeed, verticalSpeed: 0 };
const RUN: LocomotionInput = { grounded: true, horizontalSpeed: PLAYER.sprintSpeed, verticalSpeed: 0 };
const RISING: LocomotionInput = { grounded: false, horizontalSpeed: 0, verticalSpeed: 6 };
const FALLING: LocomotionInput = { grounded: false, horizontalSpeed: 0, verticalSpeed: -8 };

function clip(name: string, duration: number): THREE.AnimationClip {
  return new THREE.AnimationClip(name, duration, [
    new THREE.VectorKeyframeTrack('hips.position', [0, duration], [0, 0, 0, 0, 1, 0]),
  ]);
}

const DURATIONS: Record<string, number> = {
  Idle: 1.067,
  Walking_A: 1.067,
  Running_A: 0.8,
  Jump_Start: 0.6,
  Jump_Idle: 1.067,
  Jump_Land: 0.667,
  '1H_Melee_Attack_Slice_Horizontal': 1.067,
  '1H_Melee_Attack_Slice_Diagonal': 1,
  '1H_Melee_Attack_Chop': 1.067,
  '1H_Melee_Attack_Stab': 1.6,
};

function knightClips(omit: string[] = []): THREE.AnimationClip[] {
  return Object.entries(DURATIONS)
    .filter(([name]) => !omit.includes(name))
    .map(([name, d]) => clip(name, d));
}

function rig(): THREE.Object3D {
  const root = new THREE.Group();
  const hips = new THREE.Bone();
  hips.name = 'hips';
  root.add(hips);
  return root;
}

function setup(omit: string[] = [], warn = vi.fn()) {
  const root = rig();
  const controller = new AnimationController(root, knightClips(omit), { warn });
  const events: AnimationEvent[] = [];
  controller.events.subscribe((e) => events.push(e));
  const tick = (input: LocomotionInput, n = 1) => {
    for (let i = 0; i < n; i++) controller.fixedUpdate(input);
  };
  return { root, controller, events, tick, warn };
}

const totalWeight = (c: AnimationController) => Object.keys(DURATIONS).reduce((s, n) => s + c.weightOf(n), 0);

describe('AnimationController construction', () => {
  it('starts idle with the idle clip at full weight', () => {
    const { controller } = setup();
    expect(controller.state).toBe('idle');
    expect(controller.weightOf('Idle')).toBeCloseTo(1);
    expect(controller.movementLocked).toBe(false);
  });

  it('throws a clear error when the idle clip is missing', () => {
    expect(() => new AnimationController(rig(), knightClips(['Idle']))).toThrow(/required clip "Idle" is missing/);
  });

  it('throws when there are no clips at all', () => {
    expect(() => new AnimationController(rig(), [])).toThrow(/available: none/);
  });

  it('falls back with one warning per missing clip and still runs every state', () => {
    const { controller, tick, warn } = setup(['Running_A', 'Jump_Start', 'Jump_Land']);
    expect(warn).toHaveBeenCalledTimes(3);
    expect(warn.mock.calls.join(' ')).toMatch(/Running_A.*Walking_A/);
    expect(warn.mock.calls.join(' ')).toMatch(/Jump_Start.*Jump_Idle/);
    expect(warn.mock.calls.join(' ')).toMatch(/Jump_Land.*Idle/);
    tick(RUN, 30);
    expect(controller.state).toBe('run');
    expect(controller.weightOf('Walking_A')).toBeCloseTo(1);
    tick(RISING);
    expect(controller.state).toBe('jumpStart');
    tick(FALLING, 10);
    expect(controller.state).toBe('airborne');
    tick(IDLE);
    expect(controller.state).toBe('land');
    tick(IDLE, 80);
    expect(controller.state).toBe('idle');
  });

  it('a missing jump start borrows the airborne loop, which keeps looping', () => {
    const { controller, tick } = setup(['Jump_Start']);
    tick(RISING);
    tick(FALLING, 120);
    expect(controller.state).toBe('airborne');
    expect(controller.weightOf('Jump_Idle')).toBeCloseTo(1);
  });

  it('chains fallbacks: no walk and no run both use idle', () => {
    const { controller, tick, warn } = setup(['Walking_A', 'Running_A']);
    expect(warn).toHaveBeenCalledTimes(2);
    tick(RUN, 30);
    expect(controller.state).toBe('run');
    expect(controller.weightOf('Idle')).toBeCloseTo(1);
  });

  it('ignores attack definitions whose clip is missing', () => {
    const { controller } = setup(['1H_Melee_Attack_Chop']);
    expect(controller.playAttack('1H_Melee_Attack_Chop')).toBe(false);
  });
});

describe('AnimationController blending', () => {
  it('crossfades linearly over the fade time with weights summing to 1', () => {
    const { controller, tick } = setup();
    tick(WALK);
    expect(controller.state).toBe('walk');
    const ticks = Math.round(KNIGHT.fadeSeconds / DT);
    const walkWeights: number[] = [];
    for (let i = 0; i < ticks - 1; i++) {
      expect(totalWeight(controller)).toBeCloseTo(1, 6);
      walkWeights.push(controller.weightOf('Walking_A'));
      tick(WALK);
    }
    const steps = walkWeights.slice(1).map((w, i) => w - walkWeights[i]);
    for (const s of steps) expect(s).toBeCloseTo(DT / KNIGHT.fadeSeconds, 3);
    tick(WALK, 3);
    expect(controller.weightOf('Walking_A')).toBeCloseTo(1);
    // The finished fade stopped the old action.
    expect(controller.weightOf('Idle')).toBe(0);
    expect(controller.action('Idle')!.isRunning()).toBe(false);
  });

  it('an interrupted blend never jumps: idle -> walk -> run mid-fade', () => {
    const { controller, tick } = setup();
    tick(WALK, 5);
    const idleMid = controller.weightOf('Idle');
    expect(idleMid).toBeGreaterThan(0.3);
    let prev = { idle: idleMid, walk: controller.weightOf('Walking_A'), run: 0 };
    const maxStep = DT / KNIGHT.fadeSeconds + 1e-6;
    for (let i = 0; i < 30; i++) {
      tick(RUN);
      const now = {
        idle: controller.weightOf('Idle'),
        walk: controller.weightOf('Walking_A'),
        run: controller.weightOf('Running_A'),
      };
      expect(Math.abs(now.idle - prev.idle)).toBeLessThanOrEqual(maxStep);
      expect(Math.abs(now.walk - prev.walk)).toBeLessThanOrEqual(maxStep);
      expect(Math.abs(now.run - prev.run)).toBeLessThanOrEqual(maxStep);
      expect(now.idle + now.walk + now.run).toBeCloseTo(1, 6);
      prev = now;
    }
    expect(controller.state).toBe('run');
    expect(prev.run).toBeCloseTo(1);
  });

  it('returning to a loop that is still fading out keeps its time', () => {
    const { controller, tick } = setup();
    tick(WALK, 30);
    const walk = controller.action('Walking_A')!;
    tick(IDLE, 3); // walk starts fading out
    expect(controller.state).toBe('idle');
    const timeBefore = walk.time;
    tick(WALK);
    expect(walk.time).toBeGreaterThan(timeBefore);
  });

  it('one-shots restart from the beginning every time', () => {
    const { controller, tick } = setup();
    const land = controller.action('Jump_Land')!;
    tick(RISING);
    tick(FALLING, 15);
    tick(IDLE, 10);
    expect(controller.state).toBe('land');
    tick(RISING);
    tick(FALLING, 15);
    tick(IDLE);
    expect(controller.state).toBe('land');
    expect(land.time).toBeCloseTo(DT, 5);
  });

  it('walk and run playback rate follows speed and is clamped', () => {
    const { controller, tick } = setup();
    const walk = controller.action('Walking_A')!;
    tick({ ...WALK, horizontalSpeed: PLAYER.walkSpeed / 2 });
    expect(walk.timeScale).toBeCloseTo(0.5);
    tick({ ...WALK, horizontalSpeed: 0.4 });
    expect(walk.timeScale).toBe(KNIGHT.minLoopRate);
    tick({ ...WALK, horizontalSpeed: 5.9 });
    expect(walk.timeScale).toBeCloseTo(5.9 / PLAYER.walkSpeed);
    tick(RUN, 2);
    tick({ ...RUN, horizontalSpeed: 100 });
    expect(controller.action('Running_A')!.timeScale).toBe(KNIGHT.maxLoopRate);
  });

  it('only fixedUpdate advances the mixer', () => {
    const { controller, tick } = setup();
    tick(IDLE, 3);
    expect(controller.mixer.time).toBeCloseTo(3 * DT, 9);
  });
});

describe('AnimationController footsteps', () => {
  const footsteps = (events: AnimationEvent[]) =>
    events.filter((e): e is Extract<AnimationEvent, { type: 'footstep' }> => e.type === 'footstep');

  it('fires each foot once per walk cycle at the measured phases, alternating', () => {
    const { tick, events } = setup();
    tick(WALK, 30); // settle into the walk
    events.length = 0;
    const cycles = 3;
    tick(WALK, Math.round((cycles * DURATIONS.Walking_A) / DT));
    const steps = footsteps(events);
    expect(steps.length).toBeGreaterThanOrEqual(cycles * 2 - 1);
    expect(steps.length).toBeLessThanOrEqual(cycles * 2 + 1);
    for (let i = 1; i < steps.length; i++) expect(steps[i].foot).not.toBe(steps[i - 1].foot);
    expect(new Set(steps.map((s) => s.normalizedTime))).toEqual(new Set([0.47, 0.97]));
  });

  it('runs step twice as often per second as their shorter, faster cycle implies', () => {
    const { tick, events } = setup();
    tick(RUN, 40);
    events.length = 0;
    tick(RUN, 120); // 2 s at rate 1 over 0.8 s cycles = 5 steps
    const steps = footsteps(events);
    expect(steps.length).toBeGreaterThanOrEqual(4);
    expect(steps.length).toBeLessThanOrEqual(6);
    expect(steps.every((s) => s.clip === 'Running_A')).toBe(true);
  });

  it('slower walking steps less often', () => {
    const a = setup();
    a.tick(WALK, 30);
    a.events.length = 0;
    a.tick(WALK, 240);
    const b = setup();
    b.tick({ ...WALK, horizontalSpeed: 2.25 }, 30);
    b.events.length = 0;
    b.tick({ ...WALK, horizontalSpeed: 2.25 }, 240);
    expect(footsteps(b.events).length).toBeLessThan(footsteps(a.events).length);
  });

  it('no footsteps while idle, airborne, or from a loop under half weight', () => {
    const { tick, events } = setup();
    tick(IDLE, 120);
    expect(footsteps(events)).toHaveLength(0);
    tick(WALK, 30);
    tick({ ...FALLING, horizontalSpeed: PLAYER.walkSpeed }, 120);
    events.length = 0;
    tick({ ...FALLING, horizontalSpeed: PLAYER.walkSpeed }, 120);
    expect(footsteps(events)).toHaveLength(0);
  });

  it('crossed() handles the loop wrap exactly once', () => {
    expect(crossed(0.4, 0.5, 0.47)).toBe(true);
    expect(crossed(0.47, 0.5, 0.47)).toBe(false);
    expect(crossed(0.4, 0.47, 0.47)).toBe(true);
    expect(crossed(0.95, 0.02, 0.97)).toBe(true);
    expect(crossed(0.95, 0.02, 0.01)).toBe(true);
    expect(crossed(0.95, 0.02, 0.5)).toBe(false);
    expect(crossed(0.3, 0.3, 0.3)).toBe(false);
  });
});

describe('AnimationController jumping and landing', () => {
  it('goes idle -> jumpStart -> airborne -> land -> idle and reports the landing speed', () => {
    const { controller, tick, events } = setup();
    tick(RISING);
    expect(controller.state).toBe('jumpStart');
    tick({ ...RISING, verticalSpeed: 2 }, 5);
    tick(FALLING, 20);
    expect(controller.state).toBe('airborne');
    tick(IDLE);
    expect(controller.state).toBe('land');
    expect(events.filter((e) => e.type === 'land')).toEqual([{ type: 'land', fallSpeed: 8 }]);
    tick(IDLE, Math.ceil(DURATIONS.Jump_Land / DT) + 1);
    expect(controller.state).toBe('idle');
    const states = events.filter((e) => e.type === 'stateChange').map((e) => (e as { to: string }).to);
    expect(states).toEqual(['jumpStart', 'airborne', 'land', 'idle']);
  });

  it('walking off a ledge goes straight to airborne after the grace time, not jumpStart', () => {
    const { controller, tick } = setup();
    tick(WALK, 20);
    tick({ ...WALK, grounded: false, verticalSpeed: -1 }, 2);
    expect(controller.state).toBe('walk');
    tick({ ...WALK, grounded: false, verticalSpeed: -3 }, 10);
    expect(controller.state).toBe('airborne');
  });

  it('jump start reports its clip end, and an interrupted landing reports interrupted', () => {
    const { tick, events } = setup();
    tick(RISING, Math.ceil(DURATIONS.Jump_Start / DT) + 1);
    expect(events).toContainEqual({ type: 'clipEnd', clip: 'Jump_Start', interrupted: false });
    tick(FALLING, 5);
    tick(IDLE, 2);
    tick(WALK);
    expect(events).toContainEqual({ type: 'clipEnd', clip: 'Jump_Land', interrupted: true });
  });
});

describe('AnimationController attacks', () => {
  const H = KNIGHT_ATTACKS[0];

  it('refuses unknown clips, attacks while airborne and a second attack while one plays', () => {
    const { controller, tick } = setup();
    expect(controller.playAttack('Dance')).toBe(false);
    tick(RISING);
    expect(controller.playAttack(H.clip)).toBe(false);
    tick(FALLING, 20);
    tick(IDLE, 60);
    expect(controller.playAttack(H.clip)).toBe(true);
    expect(controller.movementLocked).toBe(true);
    expect(controller.playAttack(KNIGHT_ATTACKS[1].clip)).toBe(false);
    tick(IDLE);
    expect(controller.state).toBe('attack');
    expect(controller.playAttack(H.clip)).toBe(false);
  });

  it('emits start, window open, progress, close and end in order, once each', () => {
    const { controller, tick, events } = setup();
    controller.playAttack(H.clip);
    const n = Math.ceil(DURATIONS[H.clip] / DT) + 2;
    const times: number[] = [];
    for (let i = 0; i < n; i++) {
      tick(IDLE);
      const a = controller.activeAttack();
      if (a) {
        times.push(a.normalizedTime);
        expect(a.active).toBe(a.normalizedTime >= H.activeStart && a.normalizedTime <= H.activeEnd);
      }
    }
    const kinds = events
      .filter((e) => e.type !== 'attackProgress' && e.type !== 'footstep')
      .map((e) => (e.type === 'attackWindow' ? `window:${e.phase}` : e.type));
    expect(kinds).toEqual([
      'clipEnd', // idle loop
      'stateChange',
      'clipStart',
      'window:open',
      'window:close',
      'clipEnd',
      'stateChange',
      'clipStart',
    ]);
    const progress = events.filter((e) => e.type === 'attackProgress') as Array<
      Extract<AnimationEvent, { type: 'attackProgress' }>
    >;
    for (let i = 1; i < progress.length; i++) {
      expect(progress[i].normalizedTime).toBeGreaterThanOrEqual(progress[i - 1].normalizedTime);
      expect(progress[i].previousNormalizedTime).toBe(progress[i - 1].normalizedTime);
    }
    expect(progress.at(-1)!.normalizedTime).toBe(1);
    expect(progress.every((p) => p.swingId === 1)).toBe(true);
    const open = events.find((e) => e.type === 'attackWindow' && e.phase === 'open') as { normalizedTime: number };
    expect(open.normalizedTime).toBeGreaterThanOrEqual(H.activeStart);
    expect(open.normalizedTime).toBeLessThan(H.activeStart + DT / DURATIONS[H.clip] + 1e-9);
    expect(controller.state).toBe('idle');
    expect(controller.activeAttack()).toBeNull();
    expect(controller.movementLocked).toBe(false);
    expect(times.length).toBeGreaterThan(50);
  });

  it('progress events see the open window before them and the close after them', () => {
    const { controller, tick, events } = setup();
    controller.playAttack(H.clip);
    tick(IDLE, 80);
    const relevant = events.filter((e) => e.type === 'attackWindow' || e.type === 'attackProgress');
    const openIdx = relevant.findIndex((e) => e.type === 'attackWindow' && e.phase === 'open');
    expect(relevant[openIdx + 1]).toMatchObject({ type: 'attackProgress', active: true });
    const closeIdx = relevant.findIndex((e) => e.type === 'attackWindow' && e.phase === 'close');
    expect(relevant[closeIdx - 1]).toMatchObject({ type: 'attackProgress', active: false });
  });

  it('swing ids increase with each attack', () => {
    const { controller, tick } = setup();
    controller.playAttack(H.clip);
    tick(IDLE);
    expect(controller.activeAttack()!.swingId).toBe(1);
    tick(IDLE, 80);
    controller.playAttack(KNIGHT_ATTACKS[3].clip);
    tick(IDLE);
    expect(controller.activeAttack()).toMatchObject({ swingId: 2, clip: KNIGHT_ATTACKS[3].clip });
  });

  it('leaving the ground interrupts: window closes, then clipEnd interrupted, then airborne', () => {
    const { controller, tick, events } = setup();
    controller.playAttack(H.clip);
    tick(IDLE, Math.ceil((H.activeStart * DURATIONS[H.clip]) / DT) + 2);
    expect(controller.activeAttack()!.active).toBe(true);
    events.length = 0;
    tick(FALLING, 10);
    expect(controller.state).toBe('airborne');
    expect(controller.activeAttack()).toBeNull();
    const kinds = events.map((e) => (e.type === 'attackWindow' ? `window:${e.phase}` : e.type));
    const close = kinds.indexOf('window:close');
    const end = events.findIndex((e) => e.type === 'clipEnd' && e.clip === H.clip);
    expect(close).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(close);
    expect(events[end]).toEqual({ type: 'clipEnd', clip: H.clip, interrupted: true });
    expect(kinds.filter((k) => k === 'window:close')).toHaveLength(1);
  });

  it('a window shorter than a tick still opens and closes, with one active progress', () => {
    const root = rig();
    const tiny = { clip: H.clip, activeStart: 0.5, activeEnd: 0.501 };
    const controller = new AnimationController(root, knightClips(), { attacks: [tiny], warn: vi.fn() });
    const events: AnimationEvent[] = [];
    controller.events.subscribe((e) => events.push(e));
    controller.playAttack(H.clip);
    for (let i = 0; i < 80; i++) controller.fixedUpdate(IDLE);
    const windows = events.filter((e) => e.type === 'attackWindow');
    expect(windows.map((e) => (e as { phase: string }).phase)).toEqual(['open', 'close']);
    expect(events.filter((e) => e.type === 'attackProgress' && e.active)).toHaveLength(1);
  });

  it('an attack queued while the player has just left the ground is dropped', () => {
    const { controller, tick } = setup();
    expect(controller.playAttack(H.clip)).toBe(true);
    tick({ ...FALLING, verticalSpeed: -0.5 });
    expect(controller.state).toBe('idle');
    expect(controller.movementLocked).toBe(false);
    expect(controller.activeAttack()).toBeNull();
  });
});

describe('AnimationController events and lifecycle', () => {
  it('a throwing listener is reported and does not stop the others', () => {
    const { controller, tick } = setup();
    const onError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const after = vi.fn();
    controller.events.subscribe(() => {
      throw new Error('boom');
    });
    controller.events.subscribe(after);
    tick(WALK);
    expect(after).toHaveBeenCalled();
    expect(onError).toHaveBeenCalled();
    onError.mockRestore();
  });

  it('unsubscribing during an emit is safe and takes effect immediately', () => {
    const { controller, tick } = setup();
    const second = vi.fn();
    let unsubSecond = () => {};
    const unsubFirst = controller.events.subscribe(() => {
      unsubSecond();
      unsubFirst();
    });
    unsubSecond = controller.events.subscribe(second);
    tick(WALK);
    expect(second).not.toHaveBeenCalled();
    expect(controller.events.size).toBe(1); // the setup() recorder
    expect(() => unsubFirst()).not.toThrow();
  });

  it('events are emitted after the root world matrices are updated', () => {
    const { root, controller, tick } = setup();
    const parent = new THREE.Group();
    parent.add(root);
    parent.position.set(10, 0, 0);
    let seen: number | null = null;
    controller.events.subscribe((e) => {
      if (e.type === 'clipStart') seen = new THREE.Vector3().setFromMatrixPosition(root.children[0].matrixWorld).x;
    });
    tick(WALK);
    expect(seen).toBeCloseTo(10);
  });

  it('dispose stops all actions', () => {
    const { controller, tick } = setup();
    tick(WALK, 5);
    controller.dispose();
    expect(controller.weightOf('Walking_A')).toBe(0);
    expect(KNIGHT_CLIPS.idle).toBe('Idle');
  });
});

describe('AnimationController with real clip timing (review follow-ups)', () => {
  // GLTFLoader gives float32 durations; Knight clips last a whole number of ticks.
  function f32Clip(name: string, seconds: number): THREE.AnimationClip {
    return new THREE.AnimationClip(name, undefined, [
      new THREE.VectorKeyframeTrack('hips.position', new Float32Array([0, seconds]), [0, 0, 0, 0, 1, 0]),
    ]);
  }
  const REAL: Record<string, number> = {
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
  const realSetup = () => {
    const controller = new AnimationController(
      rig(),
      Object.entries(REAL).map(([n, d]) => f32Clip(n, d)),
      { warn: vi.fn() },
    );
    const events: AnimationEvent[] = [];
    controller.events.subscribe((e) => events.push(e));
    return { controller, events };
  };

  for (const attack of KNIGHT_ATTACKS) {
    it(`${attack.clip} completes (not interrupted) and its last progress is exactly 1`, () => {
      const { controller, events } = realSetup();
      expect(controller.playAttack(attack.clip)).toBe(true);
      let lastSeen: number | null = null;
      for (let i = 0; i < 200 && (i === 0 || controller.state !== 'idle'); i++) {
        controller.fixedUpdate(IDLE);
        const a = controller.activeAttack();
        if (a) lastSeen = a.normalizedTime;
      }
      expect(controller.state).toBe('idle');
      const ends = events.filter((e) => e.type === 'clipEnd' && e.clip === attack.clip);
      expect(ends).toEqual([{ type: 'clipEnd', clip: attack.clip, interrupted: false }]);
      const progress = events.filter((e) => e.type === 'attackProgress') as Array<{ normalizedTime: number }>;
      expect(progress.at(-1)!.normalizedTime).toBe(1);
      // Combat runs after the avatar each tick, so it must still see the final pose.
      expect(lastSeen).toBe(1);
    });
  }

  it('jump start and landing one-shots report a normal end with float32 durations', () => {
    const { controller, events } = realSetup();
    for (let i = 0; i < 40; i++) controller.fixedUpdate({ ...RISING, verticalSpeed: 3 });
    for (let i = 0; i < 10; i++) controller.fixedUpdate(FALLING);
    for (let i = 0; i < 60; i++) controller.fixedUpdate(IDLE);
    const ends = events.filter((e) => e.type === 'clipEnd' && e.clip !== 'Idle' && e.clip !== 'Jump_Idle');
    expect(ends).toEqual([
      { type: 'clipEnd', clip: 'Jump_Start', interrupted: false },
      { type: 'clipEnd', clip: 'Jump_Land', interrupted: false },
    ]);
  });

  it('a sub-tick window is active through activeAttack() while its progress event is delivered', () => {
    const tiny = { clip: '1H_Melee_Attack_Slice_Horizontal', activeStart: 0.5, activeEnd: 0.501 };
    const controller = new AnimationController(rig(), knightClips(), { attacks: [tiny], warn: vi.fn() });
    const seen: boolean[] = [];
    controller.events.subscribe((e) => {
      if (e.type === 'attackProgress' && e.active) seen.push(controller.activeAttack()!.active);
    });
    controller.playAttack(tiny.clip);
    for (let i = 0; i < 80; i++) controller.fixedUpdate(IDLE);
    expect(seen).toEqual([true]);
  });
});

describe('AnimationController blending edge cases (review follow-ups)', () => {
  it('a loop under half weight emits no footsteps', () => {
    const controller = new AnimationController(rig(), knightClips(), {
      warn: vi.fn(),
      footsteps: { Running_A: [{ phase: 0.05, foot: 'left' }] },
    });
    const steps: AnimationEvent[] = [];
    controller.events.subscribe((e) => e.type === 'footstep' && steps.push(e));
    for (let i = 0; i < 30; i++) controller.fixedUpdate(WALK);
    // Running_A restarts at 0 and crosses 0.05 after ~3 ticks, when its weight is still ~0.25.
    for (let i = 0; i < 5; i++) controller.fixedUpdate(RUN);
    expect(controller.weightOf('Running_A')).toBeLessThan(KNIGHT.footstepMinWeight);
    expect(steps).toHaveLength(0);
    for (let i = 0; i < 60; i++) controller.fixedUpdate(RUN);
    expect(steps.length).toBeGreaterThan(0);
  });

  it('weights include a finished one-shot that is still blending out', () => {
    const { controller, tick } = setup();
    controller.playAttack(KNIGHT_ATTACKS[0].clip);
    tick(IDLE, Math.ceil(DURATIONS[KNIGHT_ATTACKS[0].clip] / DT) + 3);
    expect(controller.state).toBe('idle');
    expect(controller.weightOf(KNIGHT_ATTACKS[0].clip)).toBeGreaterThan(0);
    expect(totalWeight(controller)).toBeCloseTo(1, 6);
  });

  it('repeating an attack that is still blending out restarts it from the beginning', () => {
    const { controller, tick } = setup();
    const clip = KNIGHT_ATTACKS[0].clip;
    controller.playAttack(clip);
    tick(IDLE, Math.ceil(DURATIONS[clip] / DT) + 3);
    expect(controller.weightOf(clip)).toBeGreaterThan(0);
    expect(controller.playAttack(clip)).toBe(true);
    tick(IDLE);
    expect(controller.action(clip)!.time).toBeCloseTo(DT, 5);
    expect(controller.activeAttack()!.swingId).toBe(2);
  });

  it('each landing reports its own fall speed', () => {
    const { tick, events } = setup();
    tick(RISING);
    tick({ ...FALLING, verticalSpeed: -12 }, 15);
    tick(IDLE, 60);
    tick(RISING);
    tick({ ...FALLING, verticalSpeed: -4 }, 15);
    tick(IDLE, 2);
    expect(events.filter((e) => e.type === 'land')).toEqual([
      { type: 'land', fallSpeed: 12 },
      { type: 'land', fallSpeed: 4 },
    ]);
  });
});

describe('AnimationController actions', () => {
  // Float32 durations as GLTFLoader gives them (see END_EPSILON).
  function f32(name: string, seconds: number): THREE.AnimationClip {
    return new THREE.AnimationClip(name, undefined, [
      new THREE.VectorKeyframeTrack('hips.position', new Float32Array([0, seconds]), [0, 0, 0, 0, 1, 0]),
    ]);
  }
  const ACTION_DURATIONS: Record<string, number> = {
    Blocking: 1.0666667,
    Block_Hit: 1.0666667,
    Dodge_Forward: 0.4,
    Dodge_Backward: 0.4,
    Dodge_Left: 0.4,
    Dodge_Right: 0.4,
    Hit_A: 0.6666667,
    Hit_B: 0.8666667,
    Death_A: 0.8,
    Cheer: 0.5,
  };
  const ticksOf = (clipName: string) => Math.round(ACTION_DURATIONS[clipName] / DT);
  const H = KNIGHT_ATTACKS[0];

  function actionSetup(omit: string[] = []) {
    const warn = vi.fn();
    const clips = [
      ...knightClips(),
      ...Object.entries(ACTION_DURATIONS)
        .filter(([n]) => !omit.includes(n))
        .map(([n, d]) => f32(n, d)),
    ];
    const controller = new AnimationController(rig(), clips, { warn });
    const events: AnimationEvent[] = [];
    controller.events.subscribe((e) => events.push(e));
    const tick = (input: LocomotionInput, n = 1) => {
      for (let i = 0; i < n; i++) controller.fixedUpdate(input);
    };
    tick(IDLE, 5);
    events.length = 0;
    return { controller, events, tick, warn };
  }
  const noSteps = (events: AnimationEvent[]) => events.filter((e) => e.type !== 'footstep');

  const ONE_SHOTS: Array<[ActionKind, string, string | undefined]> = [
    ['blockHit', 'Block_Hit', undefined],
    ['dodge', 'Dodge_Forward', undefined],
    ['dodge', 'Dodge_Backward', 'Dodge_Backward'],
    ['dodge', 'Dodge_Left', 'Dodge_Left'],
    ['dodge', 'Dodge_Right', 'Dodge_Right'],
    ['flinch', 'Hit_A', undefined],
    ['stagger', 'Hit_B', undefined],
  ];

  it('the action kinds have their Knight clips and GROUNDED_STATES holds no action state', () => {
    expect(KNIGHT_ACTION_CLIPS).toEqual({
      block: 'Blocking',
      blockHit: 'Block_Hit',
      dodge: 'Dodge_Forward',
      flinch: 'Hit_A',
      stagger: 'Hit_B',
      dying: 'Death_A',
      dead: 'Death_A',
    });
    for (const kind of ACTION_KINDS) expect(GROUNDED_STATES.has(kind)).toBe(false);
  });

  for (const [kind, clipName, requested] of ONE_SHOTS) {
    it(`${kind} plays ${clipName} and returns to idle at its end`, () => {
      const { controller, events, tick } = actionSetup();
      expect(controller.enterAction(kind, requested ? { clip: requested } : undefined)).toBe(true);
      expect(controller.state).toBe(kind);
      expect(controller.currentAction).toBe(kind);
      const n = ticksOf(clipName);
      tick(IDLE, n);
      expect(controller.state).toBe(kind);
      expect(controller.weightOf(clipName)).toBeCloseTo(1);
      tick(IDLE);
      expect(controller.state).toBe('idle');
      expect(controller.currentAction).toBeNull();
      expect(noSteps(events)).toEqual([
        { type: 'clipEnd', clip: 'Idle', interrupted: false },
        { type: 'stateChange', from: 'idle', to: kind },
        { type: 'clipStart', clip: clipName },
        { type: 'clipEnd', clip: clipName, interrupted: false },
        { type: 'stateChange', from: kind, to: 'idle' },
        { type: 'clipStart', clip: 'Idle' },
      ]);
    });
  }

  it('returns to walk when the player is moving at the end', () => {
    const { controller, tick } = actionSetup();
    controller.enterAction('flinch');
    tick(WALK, ticksOf('Hit_A') + 1);
    expect(controller.state).toBe('walk');
  });

  it('a durationTicks shorter than the clip cuts it at normal speed', () => {
    const { controller, events, tick } = actionSetup();
    controller.enterAction('flinch', { durationTicks: 10 });
    tick(IDLE, 10);
    expect(controller.state).toBe('flinch');
    expect(controller.action('Hit_A')!.time).toBeCloseTo(10 * DT, 6);
    tick(IDLE);
    expect(controller.state).toBe('idle');
    expect(events.filter((e) => e.type === 'clipEnd' && e.clip === 'Hit_A')).toEqual([
      { type: 'clipEnd', clip: 'Hit_A', interrupted: true },
    ]);
  });

  it('a durationTicks longer than the clip holds its last pose', () => {
    const { controller, events, tick } = actionSetup();
    const n = ticksOf('Hit_B');
    controller.enterAction('stagger', { durationTicks: n + 30 });
    tick(IDLE, n);
    expect(events).toContainEqual({ type: 'clipEnd', clip: 'Hit_B', interrupted: false });
    tick(IDLE, 30);
    expect(controller.state).toBe('stagger');
    expect(controller.action('Hit_B')!.time).toBeCloseTo(ACTION_DURATIONS.Hit_B, 5);
    expect(controller.weightOf('Hit_B')).toBeCloseTo(1);
    tick(IDLE);
    expect(controller.state).toBe('idle');
    expect(events.filter((e) => e.type === 'clipEnd' && e.clip === 'Hit_B')).toHaveLength(1);
  });

  it('block loops past its clip length and ends only on exitAction', () => {
    const { controller, events, tick } = actionSetup();
    expect(controller.enterAction('block')).toBe(true);
    tick(IDLE, ticksOf('Blocking') * 3 + 7);
    expect(controller.state).toBe('block');
    expect(controller.weightOf('Blocking')).toBeCloseTo(1);
    expect(controller.action('Blocking')!.isRunning()).toBe(true);
    expect(events.filter((e) => e.type === 'clipEnd' && e.clip === 'Blocking')).toHaveLength(0);
    expect(controller.enterAction('block')).toBe(true); // already blocking: kept
    expect(controller.exitAction()).toBeUndefined();
    expect(controller.state).toBe('idle');
    expect(controller.currentAction).toBeNull();
    tick(IDLE);
    expect(noSteps(events).slice(-3)).toEqual([
      { type: 'clipEnd', clip: 'Blocking', interrupted: false },
      { type: 'stateChange', from: 'block', to: 'idle' },
      { type: 'clipStart', clip: 'Idle' },
    ]);
    expect(events.filter((e) => e.type === 'stateChange' && e.to === 'block')).toHaveLength(1);
  });

  it('dying becomes dead at the clip end, holds the last pose and emits nothing more', () => {
    const { controller, events, tick } = actionSetup();
    expect(controller.enterAction('dying')).toBe(true);
    tick(FALLING, 3); // falling does not interrupt dying
    tick(IDLE, ticksOf('Death_A') - 3);
    expect(controller.state).toBe('dead');
    expect(controller.currentAction).toBe('dead');
    expect(noSteps(events).slice(-2)).toEqual([
      { type: 'clipEnd', clip: 'Death_A', interrupted: false },
      { type: 'stateChange', from: 'dying', to: 'dead' },
    ]);
    events.length = 0;
    tick(WALK, 300);
    expect(events).toEqual([]);
    expect(controller.state).toBe('dead');
    expect(controller.action('Death_A')!.time).toBeCloseTo(ACTION_DURATIONS.Death_A, 5);
    expect(controller.weightOf('Death_A')).toBeCloseTo(1);
    expect(controller.enterAction('flinch')).toBe(false);
    expect(controller.enterAction('dying')).toBe(true); // already dead: kept
    tick(IDLE);
    expect(events).toEqual([]);
    controller.exitAction(); // respawn
    tick(IDLE);
    expect(controller.state).toBe('idle');
    expect(noSteps(events)).toEqual([
      { type: 'stateChange', from: 'dead', to: 'idle' },
      { type: 'clipStart', clip: 'Idle' },
    ]);
  });

  it('dead entered directly holds the last frame of the death clip', () => {
    const { controller, events, tick } = actionSetup();
    expect(controller.enterAction('dead')).toBe(true);
    tick(IDLE, 60);
    expect(controller.state).toBe('dead');
    expect(controller.action('Death_A')!.time).toBeCloseTo(ACTION_DURATIONS.Death_A, 5);
    expect(events.filter((e) => e.type === 'clipEnd' && e.clip === 'Death_A')).toHaveLength(0);
  });

  it('entering an action during an attack: window close, clipEnd interrupted, stateChange, clipStart', () => {
    const { controller, events, tick } = actionSetup();
    controller.playAttack(H.clip);
    tick(IDLE, Math.ceil((H.activeStart * DURATIONS[H.clip]) / DT) + 2);
    expect(controller.activeAttack()!.active).toBe(true);
    events.length = 0;
    expect(controller.enterAction('stagger')).toBe(true);
    expect(controller.activeAttack()).toBeNull();
    tick(IDLE, 80);
    const relevant = noSteps(events).filter((e) => e.type !== 'attackProgress');
    expect(relevant.slice(0, 4)).toEqual([
      { type: 'attackWindow', clip: H.clip, swingId: 1, phase: 'close', normalizedTime: expect.any(Number) },
      { type: 'clipEnd', clip: H.clip, interrupted: true },
      { type: 'stateChange', from: 'attack', to: 'stagger' },
      { type: 'clipStart', clip: 'Hit_B' },
    ]);
    expect(events.filter((e) => e.type === 'attackWindow' && e.phase === 'close')).toHaveLength(1);
    expect(events.filter((e) => e.type === 'attackProgress')).toHaveLength(0);
  });

  it('entering an action cancels a queued attack', () => {
    const { controller, events, tick } = actionSetup();
    expect(controller.playAttack(H.clip)).toBe(true);
    expect(controller.enterAction('flinch')).toBe(true);
    tick(IDLE, 5);
    expect(controller.state).toBe('flinch');
    expect(events.some((e) => e.type === 'clipStart' && e.clip === H.clip)).toBe(false);
  });

  it('an action replaces another: the old clip ends interrupted when it had not finished', () => {
    const { controller, events, tick } = actionSetup();
    controller.enterAction('flinch');
    tick(IDLE, 5);
    expect(controller.enterAction('stagger')).toBe(true);
    tick(IDLE);
    controller.enterAction('block');
    tick(IDLE, 3);
    controller.enterAction('dying');
    tick(IDLE);
    expect(controller.state).toBe('dying');
    const seq = noSteps(events).filter((e) => e.type !== 'clipStart');
    expect(seq).toEqual([
      { type: 'clipEnd', clip: 'Idle', interrupted: false },
      { type: 'stateChange', from: 'idle', to: 'flinch' },
      { type: 'clipEnd', clip: 'Hit_A', interrupted: true },
      { type: 'stateChange', from: 'flinch', to: 'stagger' },
      { type: 'clipEnd', clip: 'Hit_B', interrupted: true },
      { type: 'stateChange', from: 'stagger', to: 'block' },
      { type: 'clipEnd', clip: 'Blocking', interrupted: false },
      { type: 'stateChange', from: 'block', to: 'dying' },
    ]);
    // Replacing with the same one-shot restarts it.
    const b = actionSetup();
    b.controller.enterAction('blockHit');
    b.tick(IDLE, 10);
    b.controller.enterAction('blockHit');
    b.tick(IDLE);
    expect(b.controller.action('Block_Hit')!.time).toBeCloseTo(DT, 6);
    expect(b.events).toContainEqual({ type: 'clipEnd', clip: 'Block_Hit', interrupted: true });
  });

  for (const kind of ACTION_KINDS) {
    it(`playAttack is refused during ${kind} and accepted again after`, () => {
      const { controller, tick } = actionSetup();
      controller.enterAction(kind, { clip: kind === 'dodge' ? 'Dodge_Left' : undefined });
      expect(controller.playAttack(H.clip)).toBe(false);
      tick(IDLE, 3);
      expect(controller.playAttack(H.clip)).toBe(false);
      controller.exitAction();
      tick(IDLE);
      expect(controller.playAttack(H.clip)).toBe(true);
      tick(IDLE);
      expect(controller.state).toBe('attack');
    });
  }

  it('playAttack is accepted again after a one-shot action ends by itself', () => {
    const { controller, tick } = actionSetup();
    controller.enterAction('dodge');
    tick(IDLE, ticksOf('Dodge_Forward'));
    expect(controller.playAttack(H.clip)).toBe(false);
    tick(IDLE);
    expect(controller.playAttack(H.clip)).toBe(true);
  });

  it('movementLocked per kind: all but flinch lock', () => {
    const expected: Record<ActionKind, boolean> = {
      block: true,
      blockHit: true,
      dodge: true,
      flinch: false,
      stagger: true,
      dying: true,
      dead: true,
    };
    for (const kind of ACTION_KINDS) {
      const { controller, tick } = actionSetup();
      controller.enterAction(kind);
      expect(controller.movementLocked).toBe(expected[kind]);
      tick(IDLE, 2);
      expect(controller.movementLocked).toBe(expected[kind]);
      controller.exitAction();
      expect(controller.movementLocked).toBe(false);
    }
  });

  it('a missing action clip falls back to idle with one warning', () => {
    const { controller, tick, warn } = actionSetup(['Hit_A']);
    expect(warn).not.toHaveBeenCalled();
    expect(controller.enterAction('flinch')).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/Hit_A.*flinch.*Idle/);
    tick(IDLE, 10);
    expect(controller.state).toBe('flinch');
    expect(controller.weightOf('Idle')).toBeCloseTo(1);
    tick(IDLE, Math.round(DURATIONS.Idle / DT));
    expect(controller.state).toBe('idle');
    controller.enterAction('flinch');
    controller.enterAction('dodge', { clip: 'Dodge_Sideways' });
    controller.enterAction('dodge', { clip: 'Dodge_Sideways' });
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('emits nothing after dispose and refuses new actions', () => {
    const { controller, events, tick } = actionSetup();
    controller.enterAction('stagger');
    controller.dispose();
    expect(controller.enterAction('flinch')).toBe(false);
    controller.exitAction();
    tick(IDLE, 10);
    expect(events).toEqual([]);
  });

  it('block, blockHit and dodge need the ground; flinch, stagger, dying and dead do not', () => {
    for (const kind of ACTION_KINDS) {
      const { controller, tick } = actionSetup();
      tick(RISING);
      tick(FALLING, 20);
      expect(controller.state).toBe('airborne');
      const ok = controller.enterAction(kind);
      expect(ok).toBe(!['block', 'blockHit', 'dodge'].includes(kind));
      if (!ok) expect(controller.state).toBe('airborne');
    }
    // Grounded actions chain on the ground (block -> blockHit -> block).
    const { controller } = actionSetup();
    expect(controller.enterAction('block')).toBe(true);
    expect(controller.enterAction('blockHit')).toBe(true);
    expect(controller.enterAction('block')).toBe(true);
  });

  it('a grounded action ends when the player leaves the ground; stagger plays on in the air', () => {
    const a = actionSetup();
    a.controller.enterAction('block');
    a.tick(IDLE, 3);
    a.tick(FALLING, 10);
    expect(a.controller.state).toBe('airborne');
    const b = actionSetup();
    b.controller.enterAction('stagger');
    b.tick(FALLING, 10);
    expect(b.controller.state).toBe('stagger');
  });

  it('is deterministic: the same ticks give the same events', () => {
    const run = () => {
      const { controller, events, tick } = actionSetup();
      controller.playAttack(H.clip);
      tick(WALK, 30);
      controller.enterAction('blockHit', { durationTicks: 20 });
      tick(WALK, 25);
      controller.enterAction('dodge', { clip: 'Dodge_Right' });
      tick(RUN, 40);
      controller.enterAction('dying');
      tick(IDLE, 60);
      controller.exitAction();
      tick(WALK, 30);
      return events;
    };
    expect(run()).toEqual(run());
  });

  describe('playOneShot', () => {
    it('plays a clip once and returns to locomotion at its end', () => {
      const { controller, events, tick } = actionSetup();
      expect(controller.playOneShot('Cheer')).toBe(true);
      expect(controller.state).toBe('oneShot');
      expect(controller.currentAction).toBeNull();
      expect(controller.movementLocked).toBe(false);
      tick(IDLE, ticksOf('Cheer'));
      expect(controller.state).toBe('oneShot');
      tick(WALK);
      expect(controller.state).toBe('walk');
      expect(noSteps(events)).toEqual([
        { type: 'clipEnd', clip: 'Idle', interrupted: false },
        { type: 'stateChange', from: 'idle', to: 'oneShot' },
        { type: 'clipStart', clip: 'Cheer' },
        { type: 'clipEnd', clip: 'Cheer', interrupted: false },
        { type: 'stateChange', from: 'oneShot', to: 'walk' },
        { type: 'clipStart', clip: 'Walking_A' },
      ]);
    });

    it('lockMove locks movement while it plays', () => {
      const { controller, tick } = actionSetup();
      expect(controller.playOneShot('Cheer', { lockMove: true })).toBe(true);
      expect(controller.movementLocked).toBe(true);
      tick(IDLE, ticksOf('Cheer'));
      expect(controller.movementLocked).toBe(true);
      tick(IDLE);
      expect(controller.movementLocked).toBe(false);
    });

    it('is refused for a missing clip, while busy, and while airborne', () => {
      const { controller, tick } = actionSetup();
      expect(controller.playOneShot('Dance')).toBe(false);
      expect(controller.state).toBe('idle');
      controller.playAttack(H.clip);
      expect(controller.playOneShot('Cheer')).toBe(false); // attack queued
      tick(IDLE);
      expect(controller.playOneShot('Cheer')).toBe(false); // attack playing
      tick(IDLE, 80);
      controller.enterAction('block');
      expect(controller.playOneShot('Cheer')).toBe(false); // action
      controller.exitAction();
      expect(controller.playOneShot('Cheer')).toBe(true);
      expect(controller.playOneShot('Cheer')).toBe(false); // another one-shot
      expect(controller.playAttack(H.clip)).toBe(false);
      const b = actionSetup();
      b.tick(RISING);
      b.tick(FALLING, 20);
      expect(b.controller.playOneShot('Cheer')).toBe(false);
    });

    for (const kind of ['flinch', 'stagger', 'dying', 'dead'] as const) {
      it(`is interrupted by ${kind}`, () => {
        const { controller, events, tick } = actionSetup();
        controller.playOneShot('Cheer');
        tick(IDLE, 5);
        expect(controller.enterAction(kind)).toBe(true);
        tick(IDLE);
        expect(controller.state).toBe(kind);
        expect(noSteps(events).slice(-3)).toEqual([
          { type: 'clipEnd', clip: 'Cheer', interrupted: true },
          { type: 'stateChange', from: 'oneShot', to: kind },
          { type: 'clipStart', clip: kind === 'flinch' ? 'Hit_A' : kind === 'stagger' ? 'Hit_B' : 'Death_A' },
        ]);
      });
    }
  });
});
