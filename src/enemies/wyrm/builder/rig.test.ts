import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { makeUniforms, patchMembrane, patchMembraneDepth, patchScales, WYRM_CACHE_KEYS, type ShaderLike } from './materials';
import { WYRM_PALETTES } from './palettes';
import { WYRM_SHAPE, wyrmParams } from './params';
import { BREATH, restPose, WYRM_JOINTS, WyrmRig, type RootFrame } from './rig';

const DT = 1 / 60;

function posed(rig: WyrmRig, root: RootFrame, ticks = 1, pose = restPose()) {
  const head = rig.headWorld(root, 0, pose);
  rig.spine.reset(head, { x: Math.sin(root.yaw), y: -0.3, z: Math.cos(root.yaw) });
  rig.root.position.set(root.x, root.y, root.z);
  rig.root.rotation.set(0, root.yaw, 0);
  for (let i = 0; i < ticks; i++) {
    rig.spine.step(DT, rig.headWorld(root, 0, pose), { speed: 0, flying: false });
    rig.apply(root, pose, DT);
  }
  return rig;
}

const matrices = (m: THREE.InstancedMesh) => [...(m.instanceMatrix.array as Float32Array)].slice(0, m.count * 16);

function stockShader(kind: 'standard' | 'depth'): ShaderLike {
  const lib = kind === 'standard' ? THREE.ShaderLib.standard : THREE.ShaderLib.depth;
  return { uniforms: {}, vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader };
}

describe('wyrm params', () => {
  it('rejects bad builds', () => {
    expect(() => wyrmParams({ scale: 0 })).toThrow();
    expect(() => wyrmParams({ segments: 3 })).toThrow();
    expect(() => wyrmParams({ segments: 12.5 })).toThrow();
    expect(() => wyrmParams({ wingspan: -1 })).toThrow();
    for (const k of ['stance', 'legScale', 'legGirth'] as const) {
      expect(() => wyrmParams({ [k]: 0 })).toThrow(k);
      expect(() => wyrmParams({ [k]: NaN })).toThrow(k);
      expect(() => wyrmParams({ [k]: Infinity })).toThrow(k);
    }
    expect(wyrmParams()).toMatchObject({ stance: 1, legScale: 1, legGirth: 1 });
    expect(wyrmParams().segments).toBe(28);
  });
});

describe('WyrmRig', () => {
  it('builds 28 spine instances by default, 15 for a wyrmling build, and every palette builds', () => {
    const rig = posed(new WyrmRig(), { x: 0, y: 0, z: 0, yaw: 0 });
    expect(rig.spineMesh.count).toBe(28);
    const small = posed(new WyrmRig({ scale: 0.35, segments: 15, palette: 'wyrmling', legs: 'small', spikes: false }), { x: 0, y: 0, z: 0, yaw: 0 });
    expect(small.spineMesh.count).toBe(15);
    expect(small.spikeMesh).toBeNull();
    for (const id of Object.keys(WYRM_PALETTES) as (keyof typeof WYRM_PALETTES)[]) {
      const r = new WyrmRig({ palette: id });
      expect(r.uniforms.uScale.value.getHex()).toBe(WYRM_PALETTES[id].scale);
      r.dispose();
    }
  });

  it('is deterministic: the same build and pose give identical matrices', () => {
    const a = posed(new WyrmRig({ seed: 5 }), { x: 3, y: 1, z: -2, yaw: 0.7 }, 30);
    const b = posed(new WyrmRig({ seed: 5 }), { x: 3, y: 1, z: -2, yaw: 0.7 }, 30);
    expect(matrices(a.spineMesh)).toEqual(matrices(b.spineMesh));
    expect(matrices(a.boneMesh)).toEqual(matrices(b.boneMesh));
    expect([...(a.headMesh.geometry.getAttribute('position').array as Float32Array)]).toEqual([
      ...(b.headMesh.geometry.getAttribute('position').array as Float32Array),
    ]);
  });

  it('scale scales the body: Orsk at 3x is three times as long', () => {
    const one = new WyrmRig();
    const three = new WyrmRig({ scale: 3, palette: 'orsk' });
    expect(three.spine.length).toBeCloseTo(one.spine.length * 3, 9);
    expect(three.spine.length).toBeCloseTo(WYRM_SHAPE.bodyLength * 3, 9);
    expect(three.jointSize.head.radius).toBeCloseTo(one.jointSize.head.radius * 3, 9);
  });

  it('keeps every matrix local to the root: a wyrm at x 22,000 draws the same local matrices as at the origin', () => {
    const near = posed(new WyrmRig(), { x: 0, y: 0, z: 0, yaw: 0.4 }, 20);
    const far = posed(new WyrmRig(), { x: 22000, y: 40, z: 3000, yaw: 0.4 }, 20);
    const a = matrices(near.spineMesh);
    const b = matrices(far.spineMesh);
    for (let i = 0; i < a.length; i++) expect(b[i]).toBeCloseTo(a[i]!, 3);
    // And nothing in the instance data is anywhere near world-sized.
    expect(Math.max(...b.map(Math.abs))).toBeLessThan(20);
  });

  it('places every hurtbox joint and both weapon channels', () => {
    const rig = posed(new WyrmRig(), { x: 0, y: 0, z: 0, yaw: 0 });
    for (const j of WYRM_JOINTS) expect(rig.owner.getObjectByName(j)).toBe(rig.joints[j]);
    // The head is ahead (-Z) of the torso; the wings sit left and right of it.
    expect(rig.joints.head.position.z).toBeLessThan(rig.joints.torso.position.z);
    expect(rig.joints.wingL.position.x).toBeLessThan(-0.5);
    expect(rig.joints.wingR.position.x).toBeGreaterThan(0.5);
    expect(rig.mouth.tip.position.z).toBeLessThan(rig.mouth.hilt.position.z);
  });

  it('the jet reaches its length and falls toward the ground; the cone decal shows only while it fills', () => {
    const rig = posed(new WyrmRig(), { x: 0, y: 0, z: 0, yaw: 0 });
    expect(rig.coneDecal.visible).toBe(false);
    const pose = { ...restPose(), breath: 1, breathReach: 7, cone: 0.5, coneReach: 7 };
    rig.apply({ x: 0, y: 0, z: 0, yaw: 0 }, pose, DT);
    const hilt = rig.mouth.hilt.position;
    const tip = rig.mouth.tip.position;
    expect(Math.hypot(tip.x - hilt.x, tip.z - hilt.z)).toBeGreaterThan(6.5);
    expect(tip.y).toBeLessThan(hilt.y);
    expect(rig.coneDecal.visible).toBe(true);
    expect(rig.coneDecal.scale.x).toBeCloseTo(7 * (0.35 + 0.65 * 0.5), 6);
  });

  it('the tail whip swings the tail tracer round the chest', () => {
    const rig = posed(new WyrmRig(), { x: 0, y: 0, z: 0, yaw: 0 });
    const tips: number[] = [];
    for (const whip of [-1.1, 0, 1.1]) {
      rig.apply({ x: 0, y: 0, z: 0, yaw: 0 }, { ...restPose(), whip: whip === 0 ? 1e-6 : whip }, DT);
      tips.push(rig.tailTip.tip.position.x);
    }
    expect(tips[0]! * tips[2]!).toBeLessThan(0);
  });

  it('breath: no points at rest, a jet while breathing, half and no smoke on Low quality', () => {
    const rig = posed(new WyrmRig(), { x: 0, y: 0, z: 0, yaw: 0 });
    expect(rig.breathPoints.visible).toBe(false);
    for (let i = 0; i < 20; i++) rig.apply({ x: 0, y: 0, z: 0, yaw: 0 }, { ...restPose(), breath: 1, breathReach: 7 }, DT);
    expect(rig.breathAlive).toBeGreaterThan(10);
    expect(rig.breathPoints.visible).toBe(true);
    expect(rig.breathAlive).toBeLessThanOrEqual(BREATH.flame + BREATH.smoke);
    const low = new WyrmRig({}, { lowQuality: true });
    expect(low.breathBudget).toEqual({ flame: BREATH.flame / 2, smoke: 0 });
    expect(low.breathPoints.geometry.getAttribute('position').count).toBe(BREATH.flame / 2);
  });

  it('draw calls: 7 at rest up close (8 with the breath), 3 in the shadow pass; 6 and 2 past 40 m; no shadow past 90 m', () => {
    const rig = posed(new WyrmRig(), { x: 0, y: 0, z: 0, yaw: 0 });
    expect(rig.drawCalls()).toEqual({ color: 7, shadow: 3 });
    for (let i = 0; i < 5; i++) rig.apply({ x: 0, y: 0, z: 0, yaw: 0 }, { ...restPose(), breath: 1, breathReach: 7 }, DT);
    expect(rig.drawCalls().color).toBe(8);
    const lod1 = posed(new WyrmRig(), { x: 0, y: 0, z: 0, yaw: 0 });
    lod1.lod = 1;
    lod1.apply({ x: 0, y: 0, z: 0, yaw: 0 }, restPose(), DT);
    expect(lod1.drawCalls()).toEqual({ color: 6, shadow: 2 });
    expect(lod1.spineMesh.count).toBe(14);
    lod1.lod = 2;
    lod1.apply({ x: 0, y: 0, z: 0, yaw: 0 }, restPose(), DT);
    expect(lod1.drawCalls().shadow).toBe(0);
  });

  it('a chain is one extra draw call and runs collar to post', () => {
    const rig = posed(new WyrmRig({ scale: 0.35, segments: 15 }), { x: 0, y: 0, z: 0, yaw: 0 });
    const before = rig.drawCalls().color;
    rig.setChain({ x: 2, y: 0, z: 2 });
    rig.apply({ x: 0, y: 0, z: 0, yaw: 0 }, restPose(), DT);
    expect(rig.drawCalls().color).toBe(before + 1);
    const last = new THREE.Matrix4();
    rig.chainMesh.getMatrixAt(rig.chainMesh.count - 1, last);
    const p = new THREE.Vector3().setFromMatrixPosition(last);
    expect(Math.hypot(p.x - 2, p.z - 2)).toBeLessThan(0.3);
    rig.setChain(null);
    expect(rig.chainMesh.visible).toBe(false);
  });

  it('dispose frees every geometry and material once and leaves the scene', () => {
    const scene = new THREE.Scene();
    const rig = new WyrmRig();
    scene.add(rig.root);
    const geos: THREE.BufferGeometry[] = [];
    rig.root.traverse((o) => {
      const g = (o as THREE.Mesh).geometry;
      if (g) geos.push(g);
    });
    const spies = [...geos, ...rig.materials.all].map((x) => vi.spyOn(x, 'dispose'));
    rig.dispose();
    rig.dispose();
    for (const s of spies) expect(s).toHaveBeenCalledTimes(1);
    expect(rig.root.parent).toBeNull();
    expect(rig.disposedYet).toBe(true);
  });
});

describe('wyrm shader patches', () => {
  const u = makeUniforms(WYRM_PALETTES.ember, 28);

  it('each patch hits its chunks, keeps the shadow chunk A0 patches, and never samples world position', () => {
    const scales = stockShader('standard');
    patchScales(scales, u);
    expect(scales.vertexShader).toContain('attribute float aPart;');
    expect(scales.fragmentShader).toContain('wyrmFres');
    expect(scales.fragmentShader).toContain('wyrmCrack');
    const membrane = stockShader('standard');
    patchMembrane(membrane, u);
    expect(membrane.vertexShader).toContain('uWingL');
    const depth = stockShader('depth');
    patchMembraneDepth(depth, u);
    expect(depth.vertexShader).toContain('wyrmWv');
    expect(THREE.ShaderLib.standard.vertexShader).toContain('#include <shadowmap_vertex>');
    for (const s of [scales, membrane]) expect(s.vertexShader).toContain('#include <shadowmap_vertex>');
    for (const s of [scales, membrane, depth]) {
      // Only the patch's own lines are checked: three's chunks are untouched.
      const added = s.vertexShader.split('\n').filter((l) => l.includes('wyrm')).join('\n') + s.fragmentShader.split('\n').filter((l) => l.includes('wyrm')).join('\n');
      expect(added).not.toMatch(/worldPosition|modelMatrix|cameraPosition/);
    }
    expect(scales.uniforms['uMouth']).toBe(u.uMouth);
    expect(membrane.uniforms['uWingR']).toBe(u.uWingR);
  });

  it('every role has one cache key whatever the palette, and uniforms live in closures, not userData', () => {
    const a = new WyrmRig({ palette: 'ember' });
    const b = new WyrmRig({ palette: 'orsk' });
    expect(a.materials.scales.customProgramCacheKey()).toBe(WYRM_CACHE_KEYS.scales);
    expect(b.materials.scales.customProgramCacheKey()).toBe(WYRM_CACHE_KEYS.scales);
    expect(a.materials.membrane.customProgramCacheKey()).toBe(b.materials.membrane.customProgramCacheKey());
    expect(Object.keys(a.materials.scales.userData)).toEqual([]);
    // The onBeforeCompile closure binds this rig's own uniform objects.
    const s = stockShader('standard');
    a.materials.scales.onBeforeCompile(s as never, undefined as never);
    expect(s.uniforms['uMouth']).toBe(a.uniforms.uMouth);
  });
});
