import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ACTOR_FX_CACHE_KEY, ActorMaterials } from '../../vfx/ActorMaterials';
import { WYRM_CACHE_KEYS } from './builder/materials';
import { WyrmRig } from './builder/rig';

const shader = () => ({
  uniforms: {} as Record<string, { value: unknown }>,
  vertexShader: THREE.ShaderLib.standard.vertexShader,
  fragmentShader: THREE.ShaderLib.standard.fragmentShader,
});

/** Every `uniform`, `varying` and `attribute` name declared more than once (a GLSL redefinition that will not compile). */
function redeclared(src: string): string[] {
  const seen = new Map<string, number>();
  for (const m of src.matchAll(/^\s*(?:uniform|varying|attribute)\s+\w+\s+(\w+)\s*;/gm)) seen.set(m[1]!, (seen.get(m[1]!) ?? 0) + 1);
  return [...seen].filter(([, n]) => n > 1).map(([k]) => k);
}

describe('ActorMaterials over a wyrm (install chaining)', () => {
  it('the chained programs declare nothing twice (scales, membrane: vertex and fragment)', () => {
    const rig = new WyrmRig();
    new ActorMaterials().ensure(rig.root);
    for (const mesh of [rig.spineMesh, rig.membraneMesh]) {
      const s = shader();
      (mesh.material as THREE.Material).onBeforeCompile(s as never, undefined as never);
      expect(redeclared(s.vertexShader)).toEqual([]);
      expect(redeclared(s.fragmentShader)).toEqual([]);
    }
  });

  it('a wyrm clone keeps its scales and membrane patches and adds the actor patch; the key joins both', () => {
    const rig = new WyrmRig();
    const fx = new ActorMaterials();
    const clones = fx.ensure(rig.root);
    expect(clones.length).toBeGreaterThanOrEqual(2);
    const scales = rig.spineMesh.material as THREE.MeshStandardMaterial;
    expect(scales).not.toBe(rig.materials.scales);
    expect(scales.customProgramCacheKey()).toBe(`${ACTOR_FX_CACHE_KEY}|${WYRM_CACHE_KEYS.scales}`);
    const s = shader();
    scales.onBeforeCompile(s as never, undefined as never);
    expect(s.fragmentShader).toContain('wyrmFres');
    expect(s.uniforms['uTelegraph']).toBeDefined();
    expect(s.uniforms['uMouth']).toBe(rig.uniforms.uMouth);
    const membrane = rig.membraneMesh.material as THREE.MeshStandardMaterial;
    const m = shader();
    membrane.onBeforeCompile(m as never, undefined as never);
    expect(m.vertexShader).toContain('uWingL');
    expect(m.uniforms['uDissolve']).toBeDefined();
    expect(membrane.customProgramCacheKey()).toBe(`${ACTOR_FX_CACHE_KEY}|${WYRM_CACHE_KEYS.membrane}`);
    // The billowing wing's shadow stays on its own depth material.
    expect(rig.membraneMesh.customDepthMaterial).toBe(rig.materials.membraneDepth);
    fx.restore(rig.root);
    expect(rig.spineMesh.material).toBe(rig.materials.scales);
  });

  it('a plain standard material (the Knight rig, the hound) gets exactly the actor patch and key, as before', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    const root = new THREE.Group().add(mesh);
    const [clone] = new ActorMaterials().ensure(root);
    expect(clone!.customProgramCacheKey()).toBe(ACTOR_FX_CACHE_KEY);
    const s = shader();
    clone!.onBeforeCompile(s as never, undefined as never);
    expect(s.uniforms['uTelegraph']).toBeDefined();
    expect(s.fragmentShader).not.toContain('wyrm');
  });
});
