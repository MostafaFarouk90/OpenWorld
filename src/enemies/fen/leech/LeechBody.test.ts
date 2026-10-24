import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { MoveDef } from '../../types';
import {
  chainLayout, clipPose, LEECH_ATTACKS, LEECH_CLIP_ALIASES, LEECH_CLIP_DURATIONS, LEECH_CLIPS, LeechBody,
  makeChainLayout, restPose, type LeechPose,
} from './LeechBody';
import { LEECH, leechDims } from './params';

const DT = 1 / 60;
const move = (over: Partial<MoveDef> = {}): MoveDef => ({
  id: 'leech.lunge', clip: 'Lunge', activeStart: 0.35, activeEnd: 0.6, windup: 0.5, telegraph: 'block',
  weapon: 'right', damage: 8, poise: 5, range: [0, 2], cooldown: 1, recover: 0.5, weight: 1, ...over,
});
function make() {
  const warnings: string[] = [];
  const body = new LeechBody(LEECH, { warn: (m) => warnings.push(m) });
  const log: string[] = [];
  body.onWindow = (ch, phase, id) => log.push(`${ch}:${phase}:${id}`);
  body.onClipEnd = (clip, interrupted) => log.push(`end:${clip}:${interrupted}`);
  return { body, log, warnings };
}
function run(body: LeechBody, seconds: number): void {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) body.fixedUpdate(DT);
}
const dims = leechDims();
function layoutOf(pose: Partial<LeechPose>, time = 0) {
  return chainLayout({ ...restPose(), ...pose }, time, dims, makeChainLayout(dims.count));
}
function chainLength(l: ReturnType<typeof layoutOf>): number {
  let s = 0;
  for (let i = 1; i < dims.count; i++) s += Math.hypot(l.x[i]! - l.x[i - 1]!, l.y[i]! - l.y[i - 1]!, l.z[i]! - l.z[i - 1]!);
  return s;
}

describe('params', () => {
  it('is about 1.6 m long with 8 tapering segments', () => {
    expect(dims.count).toBe(8);
    expect(dims.length).toBeGreaterThan(1.5);
    expect(dims.length).toBeLessThan(1.7);
    expect(dims.radii[7]!).toBeLessThan(dims.radii[3]!);
    expect(leechDims(2).length).toBeCloseTo(dims.length * 2);
  });
});

describe('structure', () => {
  it('has head and torso hurtboxes and two tracers', () => {
    const { body } = make();
    expect(body.root.children).toContain(body.owner);
    expect(body.hurtboxes.missing).toEqual([]);
    expect(body.hurtboxes.capsules.map((c) => c.name)).toEqual(['head', 'torso', 'torso', 'torso']);
    expect(body.tracers.right.attacker).toBe(body.owner);
    expect(body.tracers.left!.attacker).not.toBe(body.owner);
    expect(body.weapons.right.object.parent!.name).toBe('head');
    expect(body.currentClip).toBeNull();
    body.dispose();
  });
  it('faces -Z: the head is in front of the tail', () => {
    const { body } = make();
    const h = body.rig.segs[0]!.getWorldPosition(new THREE.Vector3());
    const t = body.rig.segs[7]!.getWorldPosition(new THREE.Vector3());
    expect(h.z).toBeLessThan(t.z - 0.8);
    body.dispose();
  });
  it('dispose is idempotent', () => {
    const { body } = make();
    body.dispose();
    expect(() => body.dispose()).not.toThrow();
    expect(() => body.fixedUpdate(DT)).not.toThrow();
  });
});

describe('clips', () => {
  it('plays canonical names and aliases, reporting the requested name', () => {
    const { body } = make();
    expect(body.play('Swim', { loop: true })).toBe('Swim');
    expect(body.play('Walking_B', { loop: true })).toBe('Walking_B');
    expect(body.currentClip).toBe('Walking_B');
    expect(body.clipDuration('Running_A')).toBe(LEECH_CLIP_DURATIONS.Swim);
    expect(body.clipDuration('Lie_StandUp')).toBe(LEECH_CLIP_DURATIONS.Surface);
    expect(body.clipDuration('Nope')).toBeUndefined();
    for (const c of Object.values(LEECH_CLIPS)) expect(body.clipDuration(c)).toBe(LEECH_CLIP_DURATIONS[c]);
    for (const k of Object.keys(LEECH_CLIP_ALIASES)) expect(body.clipDuration(k)).toBeGreaterThan(0);
    body.dispose();
  });
  it('warns once for a missing clip and falls back to Idle', () => {
    const { body, warnings } = make();
    expect(body.play('Nope')).toBe('Idle');
    body.play('Nope');
    expect(warnings.length).toBe(1);
    expect(body.playAttack(move({ clip: 'Zap' }), 0.5)).toBe(-1);
    body.playAttack(move({ clip: 'Zap' }), 0.5);
    expect(warnings.length).toBe(2);
    body.dispose();
  });
  it('one-shot clips report their end once', () => {
    const { body, log } = make();
    body.play('Hit');
    run(body, 0.5);
    expect(log).toEqual(['end:Hit:false']);
    body.dispose();
  });
  it('every clip keeps all matrices finite', () => {
    const { body } = make();
    for (const c of Object.values(LEECH_CLIPS)) {
      body.play(c, { loop: true });
      run(body, 1.2);
      body.root.updateMatrixWorld(true);
      body.root.traverse((o) => { for (const e of o.matrixWorld.elements) expect(Number.isFinite(e)).toBe(true); });
    }
    body.dispose();
  });
});

describe('attacks', () => {
  it('playAttack opens and closes the window once and ends the clip', () => {
    const { body, log } = make();
    const id = body.playAttack(move(), 0.5);
    expect(id).toBe(1);
    expect(body.currentClip).toBe('Lunge');
    run(body, 1.5);
    expect(log).toEqual(['right:open:1', 'right:close:1', 'end:Lunge:false']);
    body.dispose();
  });
  it('lead scaling: a shorter lead reaches the window sooner', () => {
    const { body, log } = make();
    body.playAttack(move(), 0.1);
    run(body, 0.12);
    expect(log[0]).toBe('right:open:1');
    body.dispose();
  });
  it('windowSource reports the move while attacking', () => {
    const { body } = make();
    body.playAttack(move(), 0.5);
    const src = body.windowSource('right');
    expect(src.clipName).toBe('Lunge');
    expect(src.start).toBe(LEECH_ATTACKS.lunge.activeStart);
    expect(body.windowSource('left').clipName).toBe('');
    body.dispose();
  });
  it('cancelAttack closes an open window and reports interrupted', () => {
    const { body, log } = make();
    body.playAttack(move(), 0.35 * 0.7);
    run(body, 0.3);
    body.cancelAttack();
    expect(log).toEqual(['right:open:1', 'right:close:1', 'end:Lunge:true']);
    body.cancelAttack();
    expect(log.length).toBe(3);
    const before = body.rig.segs[0]!.position.clone();
    run(body, 0.5);
    expect(body.rig.segs[0]!.position.distanceTo(before)).toBeLessThan(0.05);
    body.dispose();
  });
});

describe('visual', () => {
  it('setTelegraph clamps and tints emissive', () => {
    const { body } = make();
    const m = body.rig.mats.back;
    expect(m.emissive.getHex()).toBe(0);
    body.setTelegraph(5, 0xff0000);
    expect(m.emissive.r).toBeCloseTo(0.5);
    body.setTelegraph(Number.NaN);
    expect(m.emissive.getHex()).toBe(0);
    body.setTelegraph(-1);
    expect(m.emissive.getHex()).toBe(0);
    body.dispose();
  });
  it('setOpacity toggles transparency', () => {
    const { body } = make();
    body.setOpacity(0.4);
    for (const m of body.materials) { expect(m.transparent).toBe(true); expect(m.opacity).toBeCloseTo(0.4); }
    body.setOpacity(1);
    for (const m of body.materials) { expect(m.transparent).toBe(false); expect(m.opacity).toBe(1); }
    body.dispose();
  });
  it('setSubmerge lowers the rig, smoothly, and clamps bad input', () => {
    const { body } = make();
    body.setSubmerge(0.5);
    expect(body.submergeTarget).toBe(0.5);
    run(body, 0.25);
    expect(body.submergeDepth).toBeGreaterThan(0.2);
    expect(body.submergeDepth).toBeLessThan(0.5);
    expect(body.rig.root.position.y).toBeCloseTo(-body.submergeDepth);
    expect(body.root.position.y).toBe(0);
    run(body, 2);
    expect(body.submergeDepth).toBeCloseTo(0.5, 2);
    for (const bad of [-1, Number.NaN, Infinity]) {
      body.setSubmerge(bad);
      expect(body.submergeTarget).toBe(0);
    }
    run(body, 3);
    expect(body.submergeDepth).toBeCloseTo(0, 2);
    body.dispose();
  });
  it('setSpeed drives the swim wave and clamps bad input', () => {
    const { body } = make();
    body.play('Swim', { loop: true });
    body.setSpeed(2);
    run(body, 1);
    expect(body.gaitSpeed).toBeGreaterThan(1.5);
    body.setSpeed(-3);
    run(body, 1);
    expect(body.gaitSpeed).toBeLessThan(0.1);
    body.dispose();
  });
});

describe('chainLayout', () => {
  const poses: Partial<LeechPose>[] = [
    {}, { waveAmp: 0.55 }, { coil: 1, headRaise: 0.7 }, { headForward: 0.16, headRaise: 0.2 }, { writhe: 1, waveAmp: 0.3 },
    { flatten: 1 },
  ];
  it('keeps segments connected', () => {
    for (const p of poses) {
      const l = layoutOf(p, 0.37);
      for (let i = 1; i < dims.count; i++) {
        const d = Math.hypot(l.x[i]! - l.x[i - 1]!, l.y[i]! - l.y[i - 1]!, l.z[i]! - l.z[i - 1]!);
        expect(d).toBeGreaterThan(dims.spacing * 0.5);
        expect(d).toBeLessThan(dims.spacing * 1.5);
      }
    }
  });
  it('keeps the total chain length within 15%', () => {
    const rest = chainLength(layoutOf({}));
    for (const p of poses) for (const t of [0, 0.3, 0.7]) {
      expect(Math.abs(chainLength(layoutOf(p, t)) / rest - 1)).toBeLessThan(0.15);
    }
  });
  it('lays the head at -Z of the tail at rest', () => {
    const l = layoutOf({});
    expect(l.z[0]!).toBeLessThan(l.z[7]! - 1);
    expect(l.y[7]!).toBeCloseTo(dims.radii[7]!);
  });
  it('a coil bends the chain: shorter end to end, wider, head up', () => {
    const rest = layoutOf({});
    const coil = layoutOf({ coil: 1, headRaise: 0.6 });
    const span = (l: ReturnType<typeof layoutOf>) => Math.hypot(l.x[0]! - l.x[7]!, l.z[0]! - l.z[7]!);
    const width = (l: ReturnType<typeof layoutOf>) => Math.max(...l.x) - Math.min(...l.x);
    expect(span(coil)).toBeLessThan(span(rest) * 0.9);
    expect(width(coil)).toBeGreaterThan(width(rest) + 0.1);
    expect(coil.y[0]!).toBeGreaterThan(rest.y[0]! + 0.15);
  });
  it('the wave travels: layout changes with time', () => {
    const a = layoutOf({ waveAmp: 0.5 }, 0);
    const b = layoutOf({ waveAmp: 0.5 }, 0.25);
    expect(Math.abs(a.x[7]! - b.x[7]!)).toBeGreaterThan(0.02);
  });
  it('clip poses are finite', () => {
    for (const c of Object.values(LEECH_CLIPS)) for (const u of [0, 0.5, 1]) {
      const p = clipPose(c, u, u * LEECH_CLIP_DURATIONS[c], 1, restPose());
      for (const v of Object.values(p)) expect(Number.isFinite(v)).toBe(true);
    }
  });
});
