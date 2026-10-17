import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { isWindowActive, MixerAttackWindowSource } from './AttackWindow';
import type { AttackWindowSource } from './types';

const src = (start: number, end: number, t: number | null): AttackWindowSource => ({
  clipName: 'slash',
  start,
  end,
  currentTime: () => t,
});

describe('isWindowActive', () => {
  it('true inside', () => expect(isWindowActive(src(0.3, 0.6, 0.45))).toBe(true));
  it('false before and after', () => {
    expect(isWindowActive(src(0.3, 0.6, 0.1))).toBe(false);
    expect(isWindowActive(src(0.3, 0.6, 0.9))).toBe(false);
  });
  it('inclusive at both boundaries', () => {
    expect(isWindowActive(src(0.3, 0.6, 0.3))).toBe(true);
    expect(isWindowActive(src(0.3, 0.6, 0.6))).toBe(true);
  });
  it('just outside boundaries is false', () => {
    expect(isWindowActive(src(0.3, 0.6, 0.2999))).toBe(false);
    expect(isWindowActive(src(0.3, 0.6, 0.6001))).toBe(false);
  });
  it('zero-length window is never active', () => {
    expect(isWindowActive(src(0.5, 0.5, 0.5))).toBe(false);
    expect(isWindowActive(src(0.5, 0.5, 0.4))).toBe(false);
  });
  it('inverted window is never active', () => {
    expect(isWindowActive(src(0.6, 0.3, 0.45))).toBe(false);
    expect(isWindowActive(src(0.6, 0.3, 0.6))).toBe(false);
  });
  it('null, NaN and infinite time are inactive', () => {
    expect(isWindowActive(src(0.3, 0.6, null))).toBe(false);
    expect(isWindowActive(src(0.3, 0.6, NaN))).toBe(false);
    expect(isWindowActive(src(0, Infinity, Infinity))).toBe(false);
  });
  it('full window 0..1 covers the whole clip', () => {
    expect(isWindowActive(src(0, 1, 0))).toBe(true);
    expect(isWindowActive(src(0, 1, 1))).toBe(true);
  });
});

describe('MixerAttackWindowSource', () => {
  const setup = (duration = 1) => {
    const mixer = new THREE.AnimationMixer(new THREE.Object3D());
    const clip = new THREE.AnimationClip('slash', duration, []);
    const action = mixer.clipAction(clip);
    const source = new MixerAttackWindowSource(action, 'slash', 0.3, 0.6);
    return { mixer, action, source };
  };

  it('passes clipName/start/end through', () => {
    const { source } = setup();
    expect(source.clipName).toBe('slash');
    expect(source.start).toBe(0.3);
    expect(source.end).toBe(0.6);
  });

  it('null before play', () => {
    expect(setup().source.currentTime()).toBeNull();
  });

  it('reports normalised time while playing and drives isWindowActive', () => {
    const { mixer, action, source } = setup();
    action.play();
    mixer.update(0.5);
    expect(source.currentTime()).toBeCloseTo(0.5);
    expect(isWindowActive(source)).toBe(true);
    mixer.update(0.3);
    expect(isWindowActive(source)).toBe(false);
  });

  it('normalises by clip duration', () => {
    const { mixer, action, source } = setup(2);
    action.play();
    mixer.update(0.5);
    expect(source.currentTime()).toBeCloseTo(0.25);
  });

  it('null when paused', () => {
    const { mixer, action, source } = setup();
    action.play();
    mixer.update(0.5);
    action.paused = true;
    expect(source.currentTime()).toBeNull();
    action.paused = false;
    expect(source.currentTime()).toBeCloseTo(0.5);
  });

  it('null when stopped', () => {
    const { mixer, action, source } = setup();
    action.play();
    mixer.update(0.5);
    action.stop();
    expect(source.currentTime()).toBeNull();
  });

  it('null when disabled', () => {
    const { mixer, action, source } = setup();
    action.play();
    mixer.update(0.5);
    action.enabled = false;
    expect(source.currentTime()).toBeNull();
  });

  it('null when weight is 0', () => {
    const { mixer, action, source } = setup();
    action.play();
    action.setEffectiveWeight(0);
    mixer.update(0.5);
    expect(source.currentTime()).toBeNull();
  });

  it('wraps for looping clips past duration', () => {
    const { mixer, action, source } = setup();
    action.setLoop(THREE.LoopRepeat, Infinity).play();
    mixer.update(1.25);
    const t = source.currentTime()!;
    expect(t).toBeGreaterThanOrEqual(0);
    expect(t).toBeLessThan(1);
    expect(t).toBeCloseTo(0.25);
  });

  it('wraps an out-of-range action.time into [0,1)', () => {
    const { action, source } = setup();
    action.play();
    action.time = 2.5;
    expect(source.currentTime()).toBeCloseTo(0.5);
    action.time = 1;
    expect(source.currentTime()).toBe(0);
    action.time = -0.25;
    expect(source.currentTime()).toBeCloseTo(0.75);
  });

  it('null for zero-duration clip', () => {
    const mixer = new THREE.AnimationMixer(new THREE.Object3D());
    const action = mixer.clipAction(new THREE.AnimationClip('z', 0, []));
    action.play();
    expect(new MixerAttackWindowSource(action, 'z', 0, 1).currentTime()).toBeNull();
  });
});
