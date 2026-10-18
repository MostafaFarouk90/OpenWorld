import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { isWindowActive } from '../combat/AttackWindow';
import { FIXED_TIMESTEP } from '../config/constants';
import { ENEMY_CLIPS } from './clips';
import { ASH_WRAITH, BLIGHTED_SOLDIER } from './defs';
import { EnemyAnimator, MIN_LEAD_SCALE } from './EnemyAnimator';
import type { MoveDef } from './types';

let gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] };

beforeAll(async () => {
  (globalThis as any).self ??= globalThis;
  const fsModule = 'node:fs';
  const { readFileSync } = (await import(/* @vite-ignore */ fsModule)) as any;
  const file = readFileSync('public/assets/kaykit-adventurers/characters/Knight.glb');
  const buf = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  gltf = await new Promise<any>((res, rej) => new GLTFLoader().parse(buf, '', res, rej));
  warn.mockRestore();
  error.mockRestore();
});

const claw = ASH_WRAITH.moves.find((m) => m.id === 'wraith.claw')!;
const chop = BLIGHTED_SOLDIER.moves.find((m) => m.id === 'soldier.chop')!;
const bash = BLIGHTED_SOLDIER.moves.find((m) => m.id === 'soldier.bash')!;
const duration = (clip: string) => gltf.animations.find((c) => c.name === clip)!.duration;

function setup(clips: THREE.AnimationClip[] = gltf.animations) {
  const model = SkeletonUtils.clone(gltf.scene);
  const warn = vi.fn();
  const anim = new EnemyAnimator(model, clips, { warn });
  const log: string[] = [];
  anim.onWindow = (channel, phase, swingId) => log.push(`${phase}:${channel}:${swingId}`);
  anim.onClipEnd = (clip, interrupted) => log.push(`end:${clip}:${interrupted}`);
  const hand = model.getObjectByName('handr')!;
  return { model, anim, warn, log, hand };
}

/** Ticks until `pred` holds (inclusive), or -1. */
function ticksUntil(anim: EnemyAnimator, pred: () => boolean, max = 600): number {
  for (let i = 1; i <= max; i++) {
    anim.fixedUpdate(FIXED_TIMESTEP);
    if (pred()) return i;
  }
  return -1;
}

describe('EnemyAnimator', () => {
  it('advances the mixer only in fixedUpdate', () => {
    const { anim, hand } = setup();
    const update = vi.spyOn(anim.mixer, 'update');
    anim.play(ENEMY_CLIPS.idle, { loop: true });
    anim.fixedUpdate();
    const q = hand.quaternion.clone();
    const time = anim.action(ENEMY_CLIPS.idle)!.time;
    anim.play(ENEMY_CLIPS.walk, { loop: true, fade: 0.2 });
    const swing = anim.playAttack(claw, 0.5);
    anim.windowSource('right').currentTime();
    anim.activeAttack();
    anim.cancelAttack();
    expect(swing).toBe(1);
    expect(update).toHaveBeenCalledTimes(1);
    expect(hand.quaternion.equals(q)).toBe(true);
    expect(anim.action(ENEMY_CLIPS.idle)!.time).toBe(time);
    anim.fixedUpdate();
    expect(update).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenLastCalledWith(FIXED_TIMESTEP);
  });

  it('opens and closes the window once per swing with that swing id, and a new id per swing', () => {
    const { anim, log } = setup();
    anim.play(ENEMY_CLIPS.idle, { loop: true });
    const s1 = anim.playAttack(claw, 0.5);
    ticksUntil(anim, () => anim.activeAttack() === null);
    const s2 = anim.playAttack(claw, 0.5);
    ticksUntil(anim, () => anim.activeAttack() === null);
    expect(s2).toBe(s1 + 1);
    expect(log).toEqual([
      `open:right:${s1}`, `close:right:${s1}`, `end:${claw.clip}:false`,
      `open:right:${s2}`, `close:right:${s2}`, `end:${claw.clip}:false`,
    ]);
  });

  it('scales the pre-window part so the window opens at leadSeconds, then plays at normal speed', () => {
    for (const [move, lead] of [[claw, 0.5], [chop, 0.6], [chop, 1.2], [bash, 0.6]] as Array<[MoveDef, number]>) {
      const { anim } = setup();
      const swing = anim.playAttack(move, lead);
      const source = anim.windowSource(move.weapon);
      const open = ticksUntil(anim, () => anim.activeAttack()!.active);
      expect(Math.abs(open - lead / FIXED_TIMESTEP), `${move.id} lead ${lead}`).toBeLessThanOrEqual(1);
      expect(source.swingId).toBe(swing);
      expect(isWindowActive(source)).toBe(true);
      const rest = ticksUntil(anim, () => anim.activeAttack()!.normalizedTime >= 1);
      const expected = ((1 - move.activeStart) * duration(move.clip)) / FIXED_TIMESTEP;
      expect(Math.abs(rest - expected), `${move.id} post-window ticks`).toBeLessThanOrEqual(1);
    }
  });

  it('clamps the lead scale', () => {
    const { anim } = setup();
    anim.playAttack(claw, 100);
    const open = ticksUntil(anim, () => anim.activeAttack()!.active);
    const expected = (claw.activeStart * duration(claw.clip)) / MIN_LEAD_SCALE / FIXED_TIMESTEP;
    expect(Math.abs(open - expected)).toBeLessThanOrEqual(1);
  });

  it('reports exactly 1 on the finishing tick, then null', () => {
    const { anim, log } = setup();
    anim.playAttack(claw, 0.5);
    const source = anim.windowSource('right');
    const times: number[] = [];
    ticksUntil(anim, () => {
      times.push(source.currentTime()!);
      return anim.activeAttack()!.normalizedTime >= 1;
    });
    expect(times[times.length - 1]).toBe(1);
    for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThanOrEqual(times[i - 1]);
    expect(log[log.length - 1]).toBe(`end:${claw.clip}:false`);
    expect(source.swingId).toBe(1);
    anim.fixedUpdate();
    expect(source.currentTime()).toBeNull();
    expect(anim.activeAttack()).toBeNull();
    expect(source.swingId).toBeUndefined();
    expect(log.filter((l) => l.startsWith('end')).length).toBe(1);
  });

  it('cancel inside the window fires close, then clipEnd(interrupted), and the source is null at once', () => {
    const { anim, log } = setup();
    const swing = anim.playAttack(claw, 0.5);
    const source = anim.windowSource('right');
    ticksUntil(anim, () => anim.activeAttack()!.active);
    expect(source.currentTime()).not.toBeNull();
    anim.cancelAttack();
    expect(log).toEqual([`open:right:${swing}`, `close:right:${swing}`, `end:${claw.clip}:true`]);
    expect(source.currentTime()).toBeNull();
    expect(anim.activeAttack()).toBeNull();
    expect(isWindowActive(source)).toBe(false);
    for (let i = 0; i < 90; i++) anim.fixedUpdate();
    anim.cancelAttack();
    expect(log.length).toBe(3);
  });

  it('cancel before the window fires no window events', () => {
    const { anim, log } = setup();
    anim.playAttack(claw, 0.5);
    for (let i = 0; i < 10; i++) anim.fixedUpdate();
    anim.cancelAttack();
    expect(log).toEqual([`end:${claw.clip}:true`]);
    for (let i = 0; i < 90; i++) anim.fixedUpdate();
    expect(log).toEqual([`end:${claw.clip}:true`]);
  });

  it('playing another clip or attack over an attack interrupts it the same way', () => {
    const { anim, log } = setup();
    const s1 = anim.playAttack(claw, 0.5);
    ticksUntil(anim, () => anim.activeAttack()!.active);
    anim.play(ENEMY_CLIPS.stagger);
    expect(log).toEqual([`open:right:${s1}`, `close:right:${s1}`, `end:${claw.clip}:true`]);
    expect(anim.currentClip).toBe(ENEMY_CLIPS.stagger);
    log.length = 0;
    const s2 = anim.playAttack(claw, 0.5);
    expect(log).toEqual([`end:${ENEMY_CLIPS.stagger}:true`]);
    ticksUntil(anim, () => anim.activeAttack()!.active);
    const s3 = anim.playAttack(chop, 0.6);
    expect(log.slice(1)).toEqual([`open:right:${s2}`, `close:right:${s2}`, `end:${claw.clip}:true`]);
    expect(s3).toBe(s2 + 1);
  });

  it('a window shorter than a tick opens and closes on one tick and counts as active on it', () => {
    const { anim, log } = setup();
    const tiny: MoveDef = { ...claw, activeStart: 0.4, activeEnd: 0.4005 };
    const swing = anim.playAttack(tiny, 0.4);
    const source = anim.windowSource('right');
    let activeTicks = 0;
    ticksUntil(anim, () => {
      if (isWindowActive(source)) activeTicks++;
      return anim.activeAttack()!.normalizedTime >= 1;
    });
    expect(activeTicks).toBe(1);
    expect(log).toEqual([`open:right:${swing}`, `close:right:${swing}`, `end:${claw.clip}:false`]);
  });

  it('reports null for the channel the current move does not use', () => {
    const { anim } = setup();
    anim.playAttack(bash, 0.6);
    const left = anim.windowSource('left');
    const right = anim.windowSource('right');
    anim.fixedUpdate();
    expect(left.currentTime()).not.toBeNull();
    expect(left.clipName).toBe(bash.clip);
    expect(right.currentTime()).toBeNull();
    expect(right.clipName).toBe('');
    expect(right.end).toBeLessThan(right.start);
    ticksUntil(anim, () => anim.activeAttack()!.active);
    expect(isWindowActive(left)).toBe(true);
    expect(isWindowActive(right)).toBe(false);
  });

  it('falls back to Idle with one warning per missing clip; a missing attack clip plays nothing', () => {
    const { anim, warn, log } = setup();
    expect(anim.play('No_Such_Clip', { loop: true })).toBe(ENEMY_CLIPS.idle);
    expect(anim.play('No_Such_Clip', { loop: true })).toBe(ENEMY_CLIPS.idle);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('No_Such_Clip');
    const ghost: MoveDef = { ...claw, id: 'ghost', clip: 'No_Attack_Clip' };
    expect(anim.playAttack(ghost, 0.5)).toBe(-1);
    expect(anim.playAttack(ghost, 0.5)).toBe(-1);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(anim.activeAttack()).toBeNull();
    expect(anim.currentClip).toBe(ENEMY_CLIPS.idle);
    for (let i = 0; i < 60; i++) anim.fixedUpdate();
    expect(log).toEqual([]);
    expect(anim.playAttack(claw, 0.5)).toBe(1);
  });

  it('throws without an Idle clip', () => {
    const model = SkeletonUtils.clone(gltf.scene);
    expect(() => new EnemyAnimator(model, gltf.animations.filter((c) => c.name !== 'Idle'))).toThrow(/Idle/);
  });

  it('reports the end of non-attack one-shots, and fades between clips', () => {
    const { anim, log } = setup();
    anim.play(ENEMY_CLIPS.idle, { loop: true, fade: 0 });
    anim.fixedUpdate();
    expect(anim.weightOf(ENEMY_CLIPS.idle)).toBe(1);
    anim.play(ENEMY_CLIPS.death, { fade: 0.2 });
    anim.fixedUpdate();
    const w = anim.weightOf(ENEMY_CLIPS.death);
    expect(w).toBeGreaterThan(0);
    expect(w).toBeLessThan(1);
    expect(w + anim.weightOf(ENEMY_CLIPS.idle)).toBeCloseTo(1);
    ticksUntil(anim, () => log.length > 0);
    expect(log).toEqual([`end:${ENEMY_CLIPS.death}:false`]);
    expect(anim.weightOf(ENEMY_CLIPS.death)).toBe(1);
  });

  it('keeps two animators on two clones independent', () => {
    const a = setup();
    const b = setup();
    a.anim.playAttack(claw, 0.5);
    b.anim.play(ENEMY_CLIPS.idle, { loop: true });
    for (let i = 0; i < 25; i++) {
      a.anim.fixedUpdate();
      b.anim.fixedUpdate();
    }
    expect(a.hand.quaternion.equals(b.hand.quaternion)).toBe(false);
    expect(b.anim.activeAttack()).toBeNull();
  });
});
