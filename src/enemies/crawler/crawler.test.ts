import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { MoveDef, EnemyDef } from '../types';
import { makeCrawlerBody } from './body';
import {
  CRAWLER_ATTACKS, CRAWLER_CLIP_ALIASES, CRAWLER_CLIP_DURATIONS, CRAWLER_CLIPS, CrawlerBody,
} from './CrawlerBody';
import { LegScript, TRIPOD_A, TRIPOD_B } from './legs';
import { CRAWLER } from './params';
import { applySlagShader, SLAG_GLSL, slagUniforms } from './slag';

const DT = 1 / 60;
const move = (over: Partial<MoveDef> = {}): MoveDef => ({
  id: 'crawler.bite', clip: 'Bite', activeStart: 0.35, activeEnd: 0.6, windup: 0.5, telegraph: 'block',
  weapon: 'right', damage: 8, poise: 5, range: [0, 2], cooldown: 1, recover: 0.5, weight: 1, ...over,
});
function make() {
  const body = new CrawlerBody(CRAWLER, { warn: () => {} });
  const log: string[] = [];
  body.onWindow = (ch, phase, id) => log.push(`${ch}:${phase}:${id}`);
  body.onClipEnd = (clip, interrupted) => log.push(`end:${clip}:${interrupted}`);
  return { body, log };
}
function run(body: CrawlerBody, seconds: number): void {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) body.fixedUpdate(DT);
}
function allFinite(root: THREE.Object3D): boolean {
  root.updateMatrixWorld(true);
  let ok = true;
  root.traverse((o) => {
    for (const e of o.matrixWorld.elements) if (!Number.isFinite(e)) ok = false;
  });
  return ok;
}

describe('structure', () => {
  it('has head, torso and legs hurtboxes and two tracers', () => {
    const { body } = make();
    expect(body.root.children).toContain(body.owner);
    expect(body.hurtboxes.missing).toEqual([]);
    expect(body.hurtboxes.capsules.map((c) => c.name)).toEqual(['head', 'torso', 'legs']);
    expect(body.tracers.right.attacker).toBe(body.owner);
    expect(body.tracers.left!.attacker).not.toBe(body.owner);
    expect(body.weapons.right.object.parent!.name).toBe('head');
    expect(body.rig.feet.length).toBe(6);
    expect(body.currentClip).toBeNull();
    body.dispose();
  });
  it('faces -Z: the head is in front of the rump', () => {
    const { body } = make();
    const h = body.rig.head.getWorldPosition(new THREE.Vector3());
    expect(h.z).toBeLessThan(-0.5);
    body.dispose();
  });
});

describe('tripod gait', () => {
  it('tripod A swings while B is in stance, then they swap', () => {
    const s = new LegScript(1);
    for (let i = 0; i < 100; i++) {
      s.phase = i / 100;
      const a = TRIPOD_A.map((l) => s.swinging(l));
      const b = TRIPOD_B.map((l) => s.swinging(l));
      expect(new Set(a).size).toBe(1);
      expect(new Set(b).size).toBe(1);
      expect(a[0]).toBe(!b[0]);
    }
  });
  it('feet of the swinging tripod are lifted, and swing flips each half cycle', () => {
    const { body } = make();
    body.play('Walk', { loop: true, fade: 0 });
    body.setSpeed(1.2);
    run(body, 1);
    const v = new THREE.Vector3();
    let seenA = false;
    let seenB = false;
    for (let i = 0; i < 120; i++) {
      body.fixedUpdate(DT);
      const sA = body.script.swinging(0);
      const yA = TRIPOD_A.reduce((s, l) => s + body.footWorld(l, v).y, 0) / 3;
      const yB = TRIPOD_B.reduce((s, l) => s + body.footWorld(l, v).y, 0) / 3;
      const q = body.script.legPhase(0);
      if (Math.abs(q - 0.25) < 0.03) { expect(sA).toBe(true); expect(yA).toBeGreaterThan(yB + 0.03); seenA = true; }
      if (Math.abs(q - 0.75) < 0.03) { expect(sA).toBe(false); expect(yB).toBeGreaterThan(yA + 0.03); seenB = true; }
    }
    expect(seenA && seenB).toBe(true);
    body.dispose();
  });
  it('the gait speed follows setSpeed and the phase rate scales with it', () => {
    const { body } = make();
    body.play('Walk', { loop: true, fade: 0 });
    const rate = (mps: number) => {
      body.setSpeed(mps);
      run(body, 1.5);
      expect(body.gaitSpeed).toBeCloseTo(mps, 1);
      const p0 = body.script.phase;
      run(body, 0.3);
      let d = body.script.phase - p0;
      if (d < 0) d += 1;
      return d / 0.3;
    };
    const r1 = rate(1);
    const r2 = rate(2);
    expect(r2 / r1).toBeCloseTo(2, 1);
    body.setSpeed(0);
    run(body, 2);
    expect(body.gaitSpeed).toBe(0);
    body.dispose();
  });
});

describe('attacks', () => {
  it('opens and closes the window once per swing and reports the clip end', () => {
    const { body, log } = make();
    const id = body.playAttack(move(), 0.5);
    expect(id).toBe(1);
    run(body, 1.2);
    expect(log).toEqual(['right:open:1', 'right:close:1', 'end:Bite:false']);
    body.dispose();
  });
  it('an interrupt closes the open window before the clip end', () => {
    const { body, log } = make();
    body.playAttack(move(), 0.35 * 0.55);
    run(body, 0.25);
    expect(log).toEqual(['right:open:1']);
    body.cancelAttack();
    expect(log).toEqual(['right:open:1', 'right:close:1', 'end:Bite:true']);
    expect(body.windowSource('right').swingId).toBeUndefined();
    body.dispose();
  });
  it('plays Spit and the drop Land window (start 0)', () => {
    const { body, log } = make();
    body.playAttack(move({ id: 'c.spit', ...CRAWLER_ATTACKS.spit }), 0.5);
    run(body, 1);
    expect(log).toEqual(['right:open:1', 'right:close:1', 'end:Spit:false']);
    log.length = 0;
    body.playAttack(move({ id: 'c.drop', ...CRAWLER_ATTACKS.drop }), 0.1);
    run(body, 0.6);
    expect(log).toEqual(['right:open:2', 'right:close:2', 'end:Land:false']);
    body.dispose();
  });
  it('an unknown attack clip warns and returns -1', () => {
    const warns: string[] = [];
    const body = new CrawlerBody(CRAWLER, { warn: (m) => warns.push(m) });
    expect(body.playAttack(move({ clip: 'Nope' }), 0.5)).toBe(-1);
    expect(warns.length).toBe(1);
    body.dispose();
  });
});

describe('clips', () => {
  it('maps the Enemy.ts names onto crawler clips', () => {
    const expected: Record<string, string> = {
      Walking_B: 'Walk', Walking_Backwards: 'Walk', Running_A: 'Run', Hit_A: 'Hit', Hit_B: 'Stagger',
      Death_A: 'Death', Lie_StandUp: 'Idle', Blocking: 'Idle', Sit_Floor_Down: 'Curl', Sit_Floor_Idle: 'Curl',
    };
    expect(CRAWLER_CLIP_ALIASES).toMatchObject(expected);
    const { body } = make();
    for (const [alias, canon] of Object.entries(expected)) {
      expect(body.clipDuration(alias)).toBe(CRAWLER_CLIP_DURATIONS[canon as keyof typeof CRAWLER_CLIP_DURATIONS]);
      expect(body.play(alias, { fade: 0 })).toBe(alias);
      expect(body.currentClip).toBe(alias);
    }
    expect(body.clipDuration('Idle')).toBe(2.4);
    for (const c of Object.values(CRAWLER_CLIPS)) expect(body.clipDuration(c)).toBeGreaterThan(0);
    body.dispose();
  });
  it('every clip runs without NaN, one-shots report their end', () => {
    for (const clip of Object.values(CRAWLER_CLIPS)) {
      const { body, log } = make();
      body.play(clip, { loop: ['Idle', 'Walk', 'Run', 'Hang'].includes(clip) });
      run(body, CRAWLER_CLIP_DURATIONS[clip] + 0.2);
      expect(allFinite(body.root)).toBe(true);
      if (!['Idle', 'Walk', 'Run', 'Hang'].includes(clip)) expect(log).toContain(`end:${clip}:false`);
      body.dispose();
    }
  });
  it('hang, drop and land transition without NaN and the body rises with setHang', () => {
    const { body } = make();
    const y0 = body.rig.body.getWorldPosition(new THREE.Vector3()).y;
    body.setHang(0.5);
    expect(body.hangPose).toBe(1);
    body.play('Hang', { loop: true });
    run(body, 0.5);
    expect(body.rig.body.getWorldPosition(new THREE.Vector3()).y).toBeGreaterThan(y0 + 0.4);
    const upFoot = body.footWorld(0, new THREE.Vector3()).y;
    expect(upFoot).toBeGreaterThan(body.rig.body.getWorldPosition(new THREE.Vector3()).y);
    body.setHang(0);
    body.play('Drop');
    run(body, 0.5);
    body.play('Land');
    run(body, 0.2);
    expect(body.rig.bodyMesh.scale.y).toBeLessThan(1);
    run(body, 0.4);
    expect(allFinite(body.root)).toBe(true);
    expect(body.rig.bodyMesh.scale.y).toBeCloseTo(1, 2);
    body.dispose();
  });
  it('RearUp raises the front legs and nose', () => {
    const { body } = make();
    body.play('Idle', { loop: true, fade: 0 });
    run(body, 0.1);
    const f0 = body.footWorld(0, new THREE.Vector3()).y;
    body.play('RearUp', { fade: 0 });
    run(body, 0.5);
    expect(body.footWorld(0, new THREE.Vector3()).y).toBeGreaterThan(f0 + 0.2);
    body.dispose();
  });
  it('Stagger flips the body onto its back', () => {
    const { body } = make();
    body.play('Stagger', { fade: 0 });
    run(body, 1);
    expect(Math.abs(body.rig.body.rotation.z)).toBeCloseTo(Math.PI, 2);
    body.dispose();
  });
});

describe('telegraph and opacity', () => {
  it('ramps the seam glow, the emissive and the drips', () => {
    const { body } = make();
    const m = body.materials[0] as THREE.MeshStandardMaterial;
    const base = m.emissive.clone();
    run(body, 0.1);
    body.setTelegraph(0.5, 0xffff00);
    const e1 = m.emissive.clone();
    body.setTelegraph(1, 0xffff00);
    expect(slagUniforms(m).uTele.value).toBe(1);
    expect(m.emissive.g).toBeGreaterThan(e1.g);
    expect(e1.g).toBeGreaterThan(base.g);
    run(body, DT * 2);
    expect(body.rig.drips[0]!.visible).toBe(true);
    body.setTelegraph(0);
    expect(slagUniforms(m).uTele.value).toBe(0);
    expect(m.emissive.getHex()).toBe(base.getHex());
    body.dispose();
  });
  it('RearUp ramps the glow by itself', () => {
    const { body } = make();
    body.play('RearUp', { fade: 0 });
    run(body, 0.5);
    expect(slagUniforms(body.materials[0]!).uTele.value).toBeGreaterThan(0.9);
    body.dispose();
  });
  it('setOpacity makes the materials transparent', () => {
    const { body } = make();
    body.setOpacity(0.4);
    for (const m of body.materials) { expect(m.transparent).toBe(true); expect(m.opacity).toBe(0.4); }
    body.setOpacity(1);
    expect(body.materials[0]!.opacity).toBe(1);
    body.dispose();
  });
});

describe('curled prop', () => {
  it('is static with dimmed emissive and glow', () => {
    const live = new CrawlerBody(CRAWLER);
    const prop = CrawlerBody.buildCurled(CRAWLER);
    const mats = new Set<THREE.MeshStandardMaterial>();
    let moving = 0;
    prop.traverse((o) => {
      if (o.matrixAutoUpdate) moving++;
      const m = o as THREE.Mesh;
      if (m.isMesh && (m.material as THREE.MeshStandardMaterial).emissive) mats.add(m.material as THREE.MeshStandardMaterial);
    });
    expect(moving).toBe(0);
    const liveMat = live.materials[0] as THREE.MeshStandardMaterial;
    const dim = [...mats].find((m) => m.name === 'crawler-body')!;
    expect(dim.emissive.r).toBeLessThan(liveMat.emissive.r * 0.5);
    expect((dim.userData['glowBase'] as number)).toBeLessThan(0.5);
    expect(slagUniforms(dim).uGlow.value).toBeLessThan(0.5);
    expect(allFinite(prop)).toBe(true);
    CrawlerBody.disposeProp(prop);
    live.dispose();
  });
});

describe('far-coordinate shader rule', () => {
  it('samples object-space position only, never world position', () => {
    const fake = {
      vertexShader: '#include <common>\nvoid main(){\n#include <begin_vertex>\n}',
      fragmentShader: '#include <common>\nvoid main(){\nvec3 totalEmissiveRadiance = vec3(0.);\n#include <emissivemap_fragment>\n}',
      uniforms: {} as Record<string, { value: unknown }>,
    };
    const body = new CrawlerBody(CRAWLER);
    applySlagShader(fake, slagUniforms(body.materials[0]!));
    expect(fake.vertexShader).toContain('vSlagPos = position;');
    expect(fake.fragmentShader).toContain('slagSeam(vSlagPos)');
    const banned = /modelMatrix|worldPosition|vWorldPosition|cameraPosition|viewMatrix|modelViewMatrix|vViewPosition|gl_FragCoord|projectionMatrix/;
    const injected = Object.values(SLAG_GLSL).join('\n');
    expect(injected).not.toMatch(banned);
    expect(injected).not.toMatch(/worldPos/i);
    // Through the real hook as well.
    const mat = body.materials[0] as THREE.MeshStandardMaterial;
    const f2 = { ...fake, uniforms: {} as Record<string, { value: unknown }> };
    mat.onBeforeCompile(f2 as never, undefined as never);
    expect(f2.fragmentShader).toContain('vSlagPos');
    expect(Object.keys(f2.uniforms)).toContain('uGlow');
    body.dispose();
  });
});

describe('dispose', () => {
  it('frees geometries and materials, detaches, and is idempotent', () => {
    const { body } = make();
    let geos = 0;
    let mats = 0;
    const geoSet = new Set<THREE.BufferGeometry>();
    body.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) geoSet.add(m.geometry); });
    for (const g of geoSet) g.addEventListener('dispose', () => geos++);
    for (const m of body.materials) m.addEventListener('dispose', () => mats++);
    const parent = new THREE.Group();
    parent.add(body.root);
    body.dispose();
    expect(geos).toBe(geoSet.size);
    expect(mats).toBe(body.materials.length);
    expect(body.root.parent).toBeNull();
    body.dispose();
    body.fixedUpdate(DT);
    expect(geos).toBe(geoSet.size);
  });
});

describe('factory', () => {
  const def = (body: string) => ({ kind: 'crawler', body, model: { tint: 0x112233, emissive: 0x331100 } }) as unknown as EnemyDef;
  it('builds a tinted body for crawler defs and throws otherwise', () => {
    const b = makeCrawlerBody(def('crawler'));
    expect((b.materials[0] as THREE.MeshStandardMaterial).color.getHex()).toBe(0x112233);
    expect((b.materials[0] as THREE.MeshStandardMaterial).emissive.getHex()).toBe(0x331100);
    b.dispose();
    expect(() => makeCrawlerBody(def('quadruped'))).toThrow();
  });
});
