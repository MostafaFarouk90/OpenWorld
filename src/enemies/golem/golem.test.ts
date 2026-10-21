import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { MoveDef } from '../types';
import { GolemBody, GOLEM_ATTACKS, GOLEM_CLIP_ALIASES, GOLEM_CLIP_DURATIONS, GOLEM_CLIPS, buildCairn, disposeCairn } from './GolemBody';
import { GOLEM } from './params';
import { buildGolemRig } from './rig';
import { createCrackMaterial, patchCrackShader, type PatchableShader } from './shader';

const DT = 1 / 60;

const move = (over: Partial<MoveDef> = {}): MoveDef => ({
  id: 'golem.slam',
  clip: 'Slam',
  activeStart: GOLEM_ATTACKS.slam.activeStart,
  activeEnd: GOLEM_ATTACKS.slam.activeEnd,
  windup: 1,
  telegraph: 'dodge',
  weapon: 'right',
  damage: 20,
  poise: 20,
  range: [0, 4],
  cooldown: 2,
  recover: 1,
  weight: 1,
  ...over,
});

function make() {
  const body = new GolemBody(GOLEM, { warn: () => {} });
  const log: string[] = [];
  body.onWindow = (ch, phase, id) => log.push(`${ch}:${phase}:${id}`);
  body.onClipEnd = (clip, interrupted) => log.push(`end:${clip}:${interrupted}`);
  return { body, log };
}

function run(body: GolemBody, seconds: number): void {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) body.fixedUpdate(DT);
}

describe('structure', () => {
  it('has the named hurtboxes, the core behind the torso', () => {
    const { body } = make();
    expect(body.hurtboxes.missing).toEqual([]);
    const names = body.hurtboxes.capsules.map((c) => c.name);
    expect(names).toEqual(expect.arrayContaining(['core', 'torso', 'head', 'arm']));
    const core = body.hurtboxes.capsules.find((c) => c.name === 'core')!;
    const torso = body.hurtboxes.capsules.find((c) => c.name === 'torso')!;
    // Yaw 0 faces -Z, so the back is +Z.
    expect(core.a.z).toBeGreaterThan(torso.a.z + 0.3);
    expect(core.a.z).toBeGreaterThan(torso.b.z + 0.3);
    body.dispose();
  });

  it('is about 3.2 m tall and scales', () => {
    const { body } = make();
    body.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(body.root);
    expect(box.max.y - box.min.y).toBeGreaterThan(2.9);
    expect(box.max.y - box.min.y).toBeLessThan(3.6);
    body.dispose();
    const big = new GolemBody({ scale: 2 });
    big.root.updateMatrixWorld(true);
    const b2 = new THREE.Box3().setFromObject(big.root);
    expect(b2.max.y - b2.min.y).toBeGreaterThan(5.8);
    big.dispose();
  });

  it('coreWorldPosition is on the back and follows the root', () => {
    const { body } = make();
    const p = body.coreWorldPosition(new THREE.Vector3());
    expect(p.z).toBeGreaterThan(0.3);
    body.root.position.set(100, 0, 50);
    body.root.updateMatrixWorld(true);
    expect(body.coreWorldPosition(new THREE.Vector3()).x).toBeCloseTo(100, 3);
    body.dispose();
  });

  it('has fist tracers on both channels', () => {
    const { body } = make();
    expect(body.tracers.right.attacker).toBe(body.owner);
    expect(body.tracers.left!.attacker).not.toBe(body.owner);
    expect(body.windowSource('right').currentTime()).toBeNull();
    body.dispose();
  });

  it('clip table and attacks agree', () => {
    for (const c of Object.values(GOLEM_CLIPS)) expect(GOLEM_CLIP_DURATIONS[c]).toBeGreaterThan(0);
    for (const a of Object.values(GOLEM_ATTACKS)) expect(GOLEM_CLIP_DURATIONS[a.clip as keyof typeof GOLEM_CLIP_DURATIONS]).toBeDefined();
  });
});

describe('clips', () => {
  it('maps the humanoid names', () => {
    expect(GOLEM_CLIP_ALIASES['Hit_B']).toBe('Stagger');
    expect(GOLEM_CLIP_ALIASES['Hit_A']).toBe('Hit');
    expect(GOLEM_CLIP_ALIASES['Death_A']).toBe('Death');
    expect(GOLEM_CLIP_ALIASES['Lie_StandUp']).toBe('Idle');
    const { body, log } = make();
    expect(body.play('Hit_B', { fade: 0 })).toBe('Hit_B');
    expect(body.currentClip).toBe('Hit_B');
    expect(body.clipDuration('Hit_B')).toBe(GOLEM_CLIP_DURATIONS.Stagger);
    run(body, GOLEM_CLIP_DURATIONS.Stagger + 0.1);
    expect(log).toEqual(['end:Hit_B:false']);
    body.dispose();
  });

  it('plays unknown clips as Idle with one warning', () => {
    const warn = vi.fn();
    const body = new GolemBody(GOLEM, { warn });
    expect(body.play('Nope')).toBe('Idle');
    body.play('Nope');
    expect(warn).toHaveBeenCalledTimes(1);
    body.dispose();
  });

  it('opens and closes the window once, at the right time, then ends', () => {
    const { body, log } = make();
    const m = move();
    const id = body.playAttack(m, 0.5);
    expect(id).toBe(1);
    let openAt = -1;
    let closeAt = -1;
    body.onWindow = (_c, phase) => {
      const t = body.windowSource('right').currentTime()!;
      if (phase === 'open') openAt = t;
      else closeAt = t;
      log.push(phase);
    };
    const dur = GOLEM_CLIP_DURATIONS.Slam;
    run(body, 0.5 + dur * (m.activeEnd - m.activeStart) + dur * (1 - m.activeEnd) + 0.2);
    expect(log.filter((l) => l === 'open')).toHaveLength(1);
    expect(log.filter((l) => l === 'close')).toHaveLength(1);
    expect(log.indexOf('open')).toBeLessThan(log.indexOf('close'));
    expect(log[log.length - 1]).toBe('end:Slam:false');
    expect(openAt).toBeGreaterThanOrEqual(m.activeStart - 0.02);
    expect(closeAt).toBeLessThanOrEqual(m.activeEnd + DT / dur + 1e-9);
    body.dispose();
  });

  it('opens after the lead time', () => {
    const { body } = make();
    let t = -1;
    let ticks = 0;
    body.onWindow = (_c, phase) => {
      if (phase === 'open' && t < 0) t = ticks * DT;
    };
    body.playAttack(move(), 1);
    for (; ticks < 120; ) {
      ticks++;
      body.fixedUpdate(DT);
    }
    expect(t).toBeGreaterThan(0.95);
    expect(t).toBeLessThan(1.05);
    body.dispose();
  });

  it('a new attack closes the open window before the interrupt ends', () => {
    const { body, log } = make();
    body.playAttack(move(), 0.3);
    run(body, 0.4);
    expect(log).toEqual(['right:open:1']);
    body.playAttack(move({ clip: 'Stomp', activeStart: 0.45, activeEnd: 0.65 }), 0.3);
    expect(log).toEqual(['right:open:1', 'right:close:1', 'end:Slam:true']);
    expect(body.windowSource('right').swingId).toBe(2);
    body.cancelAttack();
    expect(log.slice(-1)).toEqual(['end:Stomp:true']);
    expect(body.windowSource('right').currentTime()).toBeNull();
    body.dispose();
  });

  it('Stagger holds the kneel and the pose changes', () => {
    const { body } = make();
    const rest = body.rig.torso.rotation.x;
    body.play('Stagger', { fade: 0 });
    run(body, 1);
    expect(body.rig.torso.rotation.x).toBeGreaterThan(rest + 0.4);
    body.dispose();
  });

  it('walk cycle follows setSpeed', () => {
    const { body } = make();
    body.play('Walk', { loop: true, fade: 0 });
    body.setSpeed(0);
    run(body, 1);
    const still = Math.abs(body.rig.hipR.rotation.x);
    body.setSpeed(1.2);
    let max = 0;
    for (let i = 0; i < 180; i++) {
      body.fixedUpdate(DT);
      max = Math.max(max, Math.abs(body.rig.hipR.rotation.x));
    }
    expect(still).toBeLessThan(0.05);
    expect(max).toBeGreaterThan(0.3);
    body.dispose();
  });
});

describe('visual', () => {
  it('telegraph ramps the core emissive', () => {
    const { body } = make();
    const cm = body.rig.coreMaterial;
    body.setTelegraph(0, 0xffffff);
    const e0 = cm.emissiveIntensity;
    const c0 = cm.emissive.clone();
    body.setTelegraph(0.5, 0xffffff);
    const e1 = cm.emissiveIntensity;
    body.setTelegraph(1, 0xffffff);
    expect(cm.emissiveIntensity).toBeGreaterThan(e1);
    expect(e1).toBeGreaterThan(e0);
    expect(cm.emissive.g).toBeGreaterThan(c0.g);
    expect(body.rig.crack.uGlow.value).toBeGreaterThan(1.2);
    body.setTelegraph(0, 0xffffff);
    expect(cm.emissive.getHex()).toBe(c0.getHex());
    body.dispose();
  });

  it('setOpacity applies to every material', () => {
    const { body } = make();
    body.setOpacity(0.4);
    for (const m of body.materials) expect(m.opacity).toBeCloseTo(0.4);
    body.dispose();
  });

  it('crack shader samples object-space coordinates only', () => {
    const { material, uniforms } = createCrackMaterial({ tint: 0x444444, crackColor: 0xff6600 });
    const shader: PatchableShader = {
      uniforms: {},
      vertexShader: THREE.ShaderLib.standard.vertexShader,
      fragmentShader: THREE.ShaderLib.standard.fragmentShader,
    };
    (material.onBeforeCompile as unknown as (s: PatchableShader) => void)(shader);
    const src = shader.vertexShader + shader.fragmentShader;
    expect(shader.vertexShader).toContain('vCrackPos');
    expect(shader.fragmentShader).toContain('vCrackPos');
    expect(shader.vertexShader).toContain('instanceMatrix');
    expect(shader.uniforms['uGlow']).toBe(uniforms.uGlow);
    // Everything the patch adds, minus the stock chunks, must stay out of world space.
    const added = src.split('\n').filter((l) => /Crack|crack/.test(l)).join('\n');
    expect(added).not.toMatch(/worldPosition|modelMatrix|vWorldPosition|cameraPosition|viewMatrix/);
    expect(shader.vertexShader).toMatch(/vCrackPos\s*=\s*crackP\.xyz/);
    expect(shader.vertexShader).not.toMatch(/vCrackPos\s*=[^;]*(modelMatrix|worldPosition)/);
    // patching twice from fresh sources is stable
    const again: PatchableShader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
    patchCrackShader(again, uniforms);
    expect(again.fragmentShader).toBe(shader.fragmentShader);
    material.dispose();
  });
});

describe('build', () => {
  const sig = (seed: number) => {
    const rig = buildGolemRig({ ...GOLEM, seed });
    return rig.meshes.map((m) => Array.from(m.instanceMatrix.array)).flat();
  };

  it('is deterministic per seed', () => {
    expect(sig(5)).toEqual(sig(5));
    expect(sig(5)).not.toEqual(sig(6));
  });

  it('buildCairn has no emissive and is about 1.2 m high', () => {
    const cairn = buildCairn(GOLEM);
    let meshes = 0;
    cairn.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      meshes++;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const x of mats) {
        const s = x as THREE.MeshStandardMaterial;
        expect(s.emissive.getHex()).toBe(0);
        expect(s.onBeforeCompile.toString()).not.toContain('Crack');
      }
    });
    expect(meshes).toBeGreaterThan(0);
    cairn.updateMatrixWorld(true);
    const h = new THREE.Box3().setFromObject(cairn);
    expect(h.max.y).toBeGreaterThan(1.0);
    expect(h.max.y).toBeLessThan(1.5);
    disposeCairn(cairn);
  });

  it('dispose frees geometries and materials', () => {
    const { body } = make();
    const geos = new Set<THREE.BufferGeometry>();
    body.owner.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) geos.add(m.geometry);
    });
    const gs = [...geos].map((g) => vi.spyOn(g, 'dispose'));
    const ms = body.materials.map((m) => vi.spyOn(m, 'dispose'));
    body.dispose();
    for (const s of [...gs, ...ms]) expect(s).toHaveBeenCalled();
    body.dispose();
    expect(body.root.parent).toBeNull();
  });

  it('a body update is cheap', () => {
    const { body } = make();
    body.play('Walk', { loop: true });
    run(body, 1);
    const t0 = performance.now();
    for (let i = 0; i < 600; i++) body.fixedUpdate(DT);
    const per = (performance.now() - t0) / 600;
    expect(per).toBeLessThan(0.5);
    body.dispose();
  });
});
