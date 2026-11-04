import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { MoveDef } from '../../types';
import { makeHawkBody } from './body';
import {
  clipPose, HAWK_ATTACKS, HAWK_CLIP_ALIASES, HAWK_CLIP_DURATIONS, HAWK_CLIPS, HawkBody, restPose,
} from './HawkBody';
import { HAWK, hawkDims } from './params';

const DT = 1 / 60;
const move = (over: Partial<MoveDef> = {}): MoveDef => ({
  id: 'hawk.stoop', clip: 'Stoop', activeStart: 0.3, activeEnd: 0.85, windup: 0.5, telegraph: 'dodge',
  weapon: 'right', damage: 8, poise: 5, range: [0, 6], cooldown: 1, recover: 0.5, weight: 1, ...over,
});
function make() {
  const warnings: string[] = [];
  const body = new HawkBody(HAWK, { warn: (m) => warnings.push(m) });
  const log: string[] = [];
  body.onWindow = (ch, phase, id) => log.push(`${ch}:${phase}:${id}`);
  body.onClipEnd = (clip, interrupted) => log.push(`end:${clip}:${interrupted}`);
  return { body, log, warnings };
}
function run(body: HawkBody, seconds: number): void {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) body.fixedUpdate(DT);
}

describe('params', () => {
  it('has a 1.6 m wingspan and a ~0.6 m body', () => {
    const d = hawkDims();
    expect(d.wingspan).toBeCloseTo(1.6, 2);
    expect(d.length).toBeGreaterThan(0.6);
    expect(d.length).toBeLessThan(0.75);
    expect(hawkDims(HAWK, 2).wingspan).toBeCloseTo(3.2, 2);
  });
});

describe('structure', () => {
  it('has body and wing hurtboxes on wingL / wingR and one right tracer', () => {
    const { body } = make();
    expect(body.root.children).toContain(body.owner);
    expect(body.hurtboxes.missing).toEqual([]);
    expect(body.hurtboxes.capsules.length).toBe(3);
    expect(body.rig.left.shoulder.name).toBe('wingL');
    expect(body.rig.right.shoulder.name).toBe('wingR');
    expect(body.tracers.right.attacker).toBe(body.owner);
    expect(body.weapons.right.object.parent!.name).toBe('talons');
    expect(body.currentClip).toBeNull();
    body.dispose();
  });
  it('spreads the wings to about the wingspan', () => {
    const { body } = make();
    body.play('Soar', { loop: true });
    run(body, 0.4);
    body.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(body.root);
    expect(box.max.x - box.min.x).toBeGreaterThan(1.2);
    body.dispose();
  });
  it('faces -Z: the beak is in front of the tail', () => {
    const { body } = make();
    const h = body.rig.head.getWorldPosition(new THREE.Vector3());
    const t = body.rig.tail.getWorldPosition(new THREE.Vector3());
    expect(h.z).toBeLessThan(t.z - 0.2);
    body.dispose();
  });
  it('dispose is idempotent and frees geometry and materials', () => {
    const { body } = make();
    let disposed = 0;
    for (const g of body.rig.geometries) g.addEventListener('dispose', () => disposed++);
    for (const m of body.materials) m.addEventListener('dispose', () => disposed++);
    body.dispose();
    expect(disposed).toBe(body.rig.geometries.length + body.materials.length);
    expect(() => body.dispose()).not.toThrow();
    expect(() => body.fixedUpdate(DT)).not.toThrow();
    expect(body.root.parent).toBeNull();
  });
  it('works headless (no renderer, no DOM)', () => {
    const { body } = make();
    run(body, 0.5);
    expect(Number.isFinite(body.lastPose.pitch)).toBe(true);
    body.dispose();
  });
});

describe('clips', () => {
  it('has the specified durations', () => {
    expect(HAWK_CLIP_DURATIONS).toEqual({
      Perch: 2, Soar: 1.2, Flap: 0.35, Hover: 0.25, Stoop: 0.6, Rake: 0.5, Hit: 0.3, Grounded: 1, Death: 1.2,
    });
  });
  it('maps the Enemy.ts aliases and reports the requested name', () => {
    expect(HAWK_CLIP_ALIASES).toMatchObject({
      Idle: 'Perch', Walking_A: 'Flap', Walking_B: 'Flap', Running_A: 'Flap', Walking_Backwards: 'Flap',
      Hit_A: 'Hit', Hit_B: 'Grounded', Death_A: 'Death', Lie_StandUp: 'Flap', Blocking: 'Hover',
      Sit_Floor_Down: 'Grounded', Sit_Floor_Idle: 'Grounded', Rest: 'Perch',
    });
    const { body } = make();
    expect(body.play('Walking_B', { loop: true })).toBe('Walking_B');
    expect(body.currentClip).toBe('Walking_B');
    expect(body.clipDuration('Blocking')).toBe(0.25);
    expect(body.clipDuration('Nope')).toBeUndefined();
    for (const c of Object.values(HAWK_CLIPS)) expect(body.clipDuration(c)).toBe(HAWK_CLIP_DURATIONS[c]);
    for (const k of Object.keys(HAWK_CLIP_ALIASES)) expect(body.clipDuration(k)).toBeGreaterThan(0);
    body.dispose();
  });
  it('warns once for a missing clip and falls back to Perch', () => {
    const { body, warnings } = make();
    expect(body.play('Nope')).toBe('Perch');
    body.play('Nope');
    expect(warnings.length).toBe(1);
    expect(body.playAttack(move({ clip: 'Zap' }), 0.5)).toBe(-1);
    expect(warnings.length).toBe(2);
    body.dispose();
  });
  it('one-shot clips report their end once', () => {
    const { body, log } = make();
    body.play('Hit_A');
    run(body, 0.5);
    expect(log).toEqual(['end:Hit_A:false']);
    body.dispose();
  });
  it('every clip keeps all matrices finite', () => {
    const { body } = make();
    for (const c of Object.values(HAWK_CLIPS)) {
      body.play(c, { loop: true });
      run(body, 1.3);
      body.root.updateMatrixWorld(true);
      body.root.traverse((o) => { for (const e of o.matrixWorld.elements) expect(Number.isFinite(e)).toBe(true); });
    }
    body.dispose();
  });
  it('clip poses are finite and Stoop pitches the nose down, Perch folds the wings', () => {
    for (const c of Object.values(HAWK_CLIPS)) for (const u of [0, 0.5, 1]) {
      const p = clipPose(c, u, u * HAWK_CLIP_DURATIONS[c], 1, restPose());
      for (const v of Object.values(p)) expect(Number.isFinite(v)).toBe(true);
    }
    expect(clipPose('Stoop', 1, 0.6, 0, restPose()).pitch).toBeLessThan(-0.8);
    expect(clipPose('Perch', 0, 0, 0, restPose()).sweepL).toBeGreaterThan(1);
    expect(clipPose('Soar', 0.5, 0.6, 0, restPose()).sweepL).toBeLessThan(0.3);
  });
  it('setFlightPose wins over the loco clip and clears with null', () => {
    const { body } = make();
    body.play('Walking_A', { loop: true });
    run(body, 0.5);
    body.setFlightPose('stoop');
    run(body, 1);
    expect(body.lastPose.pitch).toBeLessThan(-0.8);
    body.setFlightPose(null);
    run(body, 1);
    expect(body.lastPose.pitch).toBeGreaterThan(-0.2);
    body.dispose();
  });
  it('the Grounded pose lies on its side with one wing out', () => {
    const { body } = make();
    body.play('Hit_B', { loop: true });
    run(body, 0.5);
    expect(body.lastPose.roll).toBeGreaterThan(1);
    expect(body.lastPose.sweepR).toBeLessThan(body.lastPose.sweepL);
    body.dispose();
  });
});

describe('attacks', () => {
  it('exports the suggested windows', () => {
    expect(HAWK_ATTACKS).toEqual({
      stoop: { clip: 'Stoop', activeStart: 0.3, activeEnd: 0.85 },
      rake: { clip: 'Rake', activeStart: 0.35, activeEnd: 0.7 },
    });
  });
  it('playAttack opens and closes the window once and ends the clip', () => {
    const { body, log } = make();
    expect(body.playAttack(move(), 0.5)).toBe(1);
    expect(body.currentClip).toBe('Stoop');
    run(body, 1.5);
    expect(log).toEqual(['right:open:1', 'right:close:1', 'end:Stoop:false']);
    body.dispose();
  });
  it('opens at the start and closes at the end of the window (normalised)', () => {
    const { body, log } = make();
    const m = move({ clip: 'Rake', activeStart: 0.35, activeEnd: 0.7 });
    body.playAttack(m, 0.35 * 0.5); // lead = window start, so the clip runs at 1x
    const src = body.windowSource('right');
    let openAt = -1, closeAt = -1;
    for (let i = 0; i < 90; i++) {
      body.fixedUpdate(DT);
      const t = src.currentTime();
      if (log.includes('right:open:1') && openAt < 0 && t !== null) openAt = t;
      if (log.includes('right:close:1') && closeAt < 0) closeAt = i * DT / 0.5;
    }
    expect(openAt).toBeGreaterThanOrEqual(0.35 - 1e-6);
    expect(openAt).toBeLessThan(0.35 + 0.05);
    expect(closeAt).toBeGreaterThan(0.7 - 0.05);
    expect(closeAt).toBeLessThan(0.7 + 0.1);
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
    expect(src.clipName).toBe('Stoop');
    expect(src.start).toBe(HAWK_ATTACKS.stoop.activeStart);
    body.dispose();
  });
  it('cancelAttack closes an open window and reports interrupted', () => {
    const { body, log } = make();
    body.playAttack(move(), 0.3 * 0.6);
    run(body, 0.3);
    body.cancelAttack();
    expect(log).toEqual(['right:open:1', 'right:close:1', 'end:Stoop:true']);
    body.cancelAttack();
    expect(log.length).toBe(3);
    body.dispose();
  });
});

describe('visual', () => {
  it('setAltitude lifts the visual and the hurtboxes', () => {
    const { body } = make();
    const y0 = body.hurtboxes.capsules[0]!.a.y;
    body.setAltitude(5);
    run(body, 0.1);
    body.hurtboxes.update();
    expect(body.owner.position.y).toBe(5);
    expect(body.root.position.y).toBe(0);
    expect(body.hurtboxes.capsules[0]!.a.y).toBeCloseTo(y0 + 5, 1);
    for (const bad of [-2, Number.NaN, Infinity]) {
      body.setAltitude(bad);
      expect(body.altitude).toBe(0);
    }
    body.dispose();
  });
  it('setFlash lerps the wing materials to white emissive and clamps', () => {
    const { body } = make();
    const m = body.rig.mats.wing;
    expect(m.emissive.getHex()).toBe(0);
    body.setFlash(1);
    expect(m.emissive.getHex()).toBe(0xffffff);
    expect(body.rig.mats.tip.emissive.getHex()).toBe(0xffffff);
    expect(body.rig.mats.body.emissive.getHex()).toBe(0);
    body.setFlash(0.5);
    expect(m.emissive.r).toBeCloseTo(0.5);
    body.setFlash(9);
    expect(body.flash).toBe(1);
    body.setFlash(Number.NaN);
    expect(m.emissive.getHex()).toBe(0);
    body.dispose();
  });
  it('setTelegraph clamps and tints emissive', () => {
    const { body } = make();
    const m = body.rig.mats.body;
    body.setTelegraph(5, 0xff0000);
    expect(m.emissive.r).toBeCloseTo(0.5);
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
});

describe('factory', () => {
  it('rejects a non-bird def', () => {
    expect(() => makeHawkBody({ kind: 'x', body: 'leech', model: { tint: 0 } } as never)).toThrow();
    const b = makeHawkBody({ kind: 'rime_hawk', body: 'bird', model: { tint: 0xffffff } } as never);
    expect(b.materials.length).toBe(4);
    b.dispose();
  });
});
