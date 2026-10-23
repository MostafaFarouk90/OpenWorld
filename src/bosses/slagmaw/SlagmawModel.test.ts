import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildSlagmawModel, HEAD_BONE, patchLavaShader, segmentBone, type SlagmawUniforms } from './SlagmawModel';
import { LOOK } from './tuning';

const uniformsOf = (m: ReturnType<typeof buildSlagmawModel>): SlagmawUniforms => {
  let u: SlagmawUniforms | undefined;
  m.root.traverse((o) => {
    const mat = (o as THREE.Mesh).material as THREE.Material | undefined;
    if (mat && !u) u = mat.userData.slagmawUniforms;
  });
  return u!;
};
const crustOf = (m: ReturnType<typeof buildSlagmawModel>): THREE.MeshStandardMaterial => {
  let c: THREE.MeshStandardMaterial | undefined;
  m.root.traverse((o) => {
    const mat = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (mat && !c) c = mat;
  });
  return c!;
};

describe('SlagmawModel (procedural)', () => {
  it('builds a segmented worm without assets', () => {
    const m = buildSlagmawModel();
    let meshes = 0;
    m.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && o.name.endsWith('-mesh')) meshes++;
    });
    expect(meshes).toBe(LOOK.segments);
    expect(m.root.getObjectByName(HEAD_BONE)).toBeTruthy();
    m.dispose();
  });

  it('has hurtboxes on the head and the first six segments', () => {
    const m = buildSlagmawModel();
    expect(m.hurtboxes.count).toBe(7);
    expect(new Set(m.hurtboxes.capsules.map((c) => c.name)).size).toBe(7);
    expect(m.hurtboxes.missing).toEqual([]);
    m.dispose();
  });

  it('hides the root below 0.05 emergence and shows it again above', () => {
    const m = buildSlagmawModel();
    m.setEmergence(0.04);
    expect(m.root.visible).toBe(false);
    m.setEmergence(0.05);
    expect(m.root.visible).toBe(true);
    m.setEmergence(0);
    expect(m.root.visible).toBe(false);
    m.setEmergence(1);
    expect(m.root.visible).toBe(true);
    m.setEmergence(Number.NaN);
    expect(m.root.visible).toBe(false);
    m.dispose();
  });

  it('raises the head as emergence rises', () => {
    const m = buildSlagmawModel();
    const head = m.root.getObjectByName(HEAD_BONE)!;
    m.setEmergence(0.1);
    const low = head.position.y;
    m.setEmergence(1);
    expect(head.position.y).toBeGreaterThan(low);
    expect(low).toBeLessThan(0);
    m.dispose();
  });

  it('cooled swaps the crust and lava colours and dims the glow, and back', () => {
    const m = buildSlagmawModel();
    const u = uniformsOf(m);
    const hotGlow = u.uGlow.value;
    expect(u.uCooled.value).toBe(0);
    expect(u.uLava.value.getHex()).toBe(LOOK.lavaColor);
    m.setCooled(true);
    expect(u.uCooled.value).toBe(1);
    expect(u.uLava.value.getHex()).toBe(LOOK.cooledColor);
    expect(u.uGlow.value).toBeLessThan(hotGlow);
    m.setCooled(false);
    expect(u.uCooled.value).toBe(0);
    expect(u.uLava.value.getHex()).toBe(LOOK.lavaColor);
    expect(u.uGlow.value).toBe(hotGlow);
    m.dispose();
  });

  it('telegraph clamps to 0..1 and update scrolls the shader time', () => {
    const m = buildSlagmawModel();
    const u = uniformsOf(m);
    m.setTelegraph(2);
    expect(u.uLavaTelegraph.value).toBe(1);
    m.setTelegraph(Number.NaN);
    expect(u.uLavaTelegraph.value).toBe(0);
    m.update(0.5);
    m.update(Number.NaN);
    expect(u.uLavaTime.value).toBeCloseTo(0.5);
    m.dispose();
  });

  it('opacity toggles transparency', () => {
    const m = buildSlagmawModel();
    const crust = crustOf(m);
    m.setOpacity(0.4);
    expect(crust.transparent).toBe(true);
    expect(crust.opacity).toBeCloseTo(0.4);
    m.setOpacity(1);
    expect(crust.transparent).toBe(false);
    m.dispose();
  });

  it('faces toward a point (yaw 0 is -Z) and reports the head in world space', () => {
    const m = buildSlagmawModel();
    m.root.position.set(20000, 3, -5000);
    m.faceToward(20000, -5010);
    expect(m.root.rotation.y).toBeCloseTo(0);
    m.faceToward(20010, -5000);
    expect(m.root.rotation.y).toBeCloseTo(-Math.PI / 2);
    m.setEmergence(1);
    const out = m.headWorld(new THREE.Vector3());
    expect(Math.hypot(out.x - 20000, out.z + 5000)).toBeLessThan(2);
    expect(out.y).toBeGreaterThan(3);
    m.dispose();
  });

  it('the lava shader patch uses object-space position only, never world position', () => {
    const shader = {
      uniforms: {} as Record<string, { value: unknown }>,
      vertexShader: '#include <common>\n#include <begin_vertex>',
      fragmentShader: '#include <common>\n#include <emissivemap_fragment>',
    };
    patchLavaShader(shader, uniformsOf(buildSlagmawModel()));
    expect(shader.vertexShader).toContain('vLavaPos = transformed');
    expect(shader.vertexShader + shader.fragmentShader).not.toMatch(/modelMatrix|worldPosition/);
    expect(shader.uniforms.uLavaTime).toBeTruthy();
  });

  it('stays under the mesh budget and shares geometry and materials', () => {
    const m = buildSlagmawModel();
    const geos = new Set<THREE.BufferGeometry>();
    const mats = new Set<THREE.Material>();
    let meshes = 0;
    m.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      meshes++;
      geos.add(mesh.geometry);
      mats.add(mesh.material as THREE.Material);
    });
    expect(meshes).toBeLessThanOrEqual(70);
    expect(geos.size).toBeLessThanOrEqual(8);
    expect(mats.size).toBeLessThanOrEqual(10);
    m.dispose();
  });

  it('rears up when surfaced: the head 3 to 4.5 m up, the neck arched, the tail low', () => {
    const m = buildSlagmawModel();
    m.setEmergence(1);
    const y = (name: string): number => m.root.getObjectByName(name)!.position.y;
    expect(y(HEAD_BONE)).toBeGreaterThan(3);
    expect(y(HEAD_BONE)).toBeLessThan(4.5);
    expect(y(segmentBone(1))).toBeGreaterThan(3);
    expect(y(segmentBone(LOOK.segments - 1))).toBeLessThan(0.6);
    // The head looks down: its forward (-Z) has a downward component.
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(m.root.getObjectByName(HEAD_BONE)!.quaternion);
    expect(fwd.y).toBeLessThan(0);
    // Mid-eruption the head is already well up while the tail is still under the floor.
    m.setEmergence(0.5);
    expect(y(HEAD_BONE)).toBeGreaterThan(2);
    expect(y(segmentBone(LOOK.segments - 1))).toBeLessThan(0);
    m.dispose();
  });

  it('hurtboxes and headWorld follow the reared head', () => {
    const m = buildSlagmawModel();
    m.root.position.set(20000, 0, -5000);
    m.setEmergence(1);
    m.update(0.3);
    m.root.updateMatrixWorld(true);
    m.hurtboxes.update();
    const head = m.headWorld(new THREE.Vector3());
    const cap = m.hurtboxes.capsules.find((c) => c.name === 'head')!;
    const mid = cap.a.clone().add(cap.b).multiplyScalar(0.5);
    expect(mid.distanceTo(head)).toBeLessThan(0.05);
    expect(head.y).toBeGreaterThan(3);
    m.dispose();
  });

  it('when fully surfaced, low body capsules lie within blade reach of a 1.8 m knight', () => {
    const m = buildSlagmawModel();
    m.setEmergence(1);
    m.update(0);
    m.root.updateMatrixWorld(true);
    m.hurtboxes.update();
    const low = m.hurtboxes.capsules.filter((c) => (c.a.y + c.b.y) / 2 < 1.9 && c.radius >= 0.5);
    expect(low.length).toBeGreaterThanOrEqual(2);
    // A capsule's lowest surface point is well below chest height, so a level sword sweep can touch it.
    for (const c of low) expect(Math.min(c.a.y, c.b.y) - c.radius).toBeLessThan(1.3);
    m.dispose();
  });

  it('the eye, maw and seam glows flare with the telegraph and dim when cooled', () => {
    const m = buildSlagmawModel();
    const glow = (name: string): THREE.ShaderMaterial => {
      let found: THREE.ShaderMaterial | undefined;
      m.root.traverse((o) => {
        const mat = (o as THREE.Mesh).material as THREE.ShaderMaterial | undefined;
        if (mat?.name === name) found = mat;
      });
      return found!;
    };
    for (const name of ['slagmaw-eye', 'slagmaw-throat', 'slagmaw-maw-halo', 'slagmaw-seam-halo']) {
      const mat = glow(name);
      expect(mat).toBeTruthy();
      const hot = mat.uniforms.uIntensity.value as number;
      m.setTelegraph(1);
      expect(mat.uniforms.uIntensity.value).toBeGreaterThan(hot);
      m.setTelegraph(0);
      m.setCooled(true);
      expect(mat.uniforms.uIntensity.value).toBeLessThan(hot);
      m.setCooled(false);
      expect(mat.uniforms.uIntensity.value).toBeCloseTo(hot);
    }
    const halo = glow('slagmaw-seam-halo');
    expect(halo.blending).toBe(THREE.AdditiveBlending);
    expect(halo.depthWrite).toBe(false);
    expect(halo.vertexShader + halo.fragmentShader).not.toMatch(/modelMatrix|worldPosition/);
    m.setOpacity(0.5);
    expect(halo.uniforms.uOpacity.value).toBeCloseTo(0.5);
    m.dispose();
  });

  it('disposes cleanly twice and leaves the scene', () => {
    const m = buildSlagmawModel();
    const scene = new THREE.Scene();
    scene.add(m.root);
    m.update(1 / 60);
    m.dispose();
    m.dispose();
    expect(m.root.parent).toBeNull();
  });
});
