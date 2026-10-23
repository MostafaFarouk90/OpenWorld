import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildSlagmawModel, HEAD_BONE, patchLavaShader, type SlagmawUniforms } from './SlagmawModel';
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
      if ((o as THREE.Mesh).isMesh) meshes++;
    });
    expect(meshes).toBe(LOOK.segments);
    expect(m.root.getObjectByName(HEAD_BONE)).toBeTruthy();
    m.dispose();
  });

  it('has hurtboxes on the head and the first three segments', () => {
    const m = buildSlagmawModel();
    expect(m.hurtboxes.count).toBe(4);
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
    const crust = crustOf(m);
    const hotGlow = u.uGlow.value;
    expect(crust.color.getHex()).toBe(LOOK.crustColor);
    expect(u.uLava.value.getHex()).toBe(LOOK.lavaColor);
    m.setCooled(true);
    expect(crust.color.getHex()).toBe(LOOK.cooledColor);
    expect(u.uLava.value.getHex()).toBe(LOOK.cooledColor);
    expect(u.uGlow.value).toBeLessThan(hotGlow);
    m.setCooled(false);
    expect(crust.color.getHex()).toBe(LOOK.crustColor);
    expect(u.uLava.value.getHex()).toBe(LOOK.lavaColor);
    expect(u.uGlow.value).toBe(hotGlow);
    m.dispose();
  });

  it('telegraph clamps to 0..1 and update scrolls the shader time', () => {
    const m = buildSlagmawModel();
    const u = uniformsOf(m);
    m.setTelegraph(2);
    expect(u.uTelegraph.value).toBe(1);
    m.setTelegraph(Number.NaN);
    expect(u.uTelegraph.value).toBe(0);
    m.update(0.5);
    m.update(Number.NaN);
    expect(u.uTime.value).toBeCloseTo(0.5);
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
    expect(shader.uniforms.uTime).toBeTruthy();
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
