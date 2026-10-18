import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { ACTOR_FX_CACHE_KEY, ActorMaterials, getFx, patchActorShader } from './ActorMaterials';

const box = () => new THREE.BoxGeometry(1, 1, 1);
function actor(shared: THREE.Material) {
  const root = new THREE.Group();
  root.add(new THREE.Mesh(box(), shared));
  return root;
}

describe('ActorMaterials', () => {
  it('clones are distinct per root even with shared originals', () => {
    const shared = new THREE.MeshStandardMaterial();
    const a = actor(shared);
    const b = actor(shared);
    const am = new ActorMaterials();
    const ca = am.ensure(a);
    const cb = am.ensure(b);
    expect(ca).toHaveLength(1);
    expect(ca[0]).not.toBe(shared);
    expect(ca[0]).not.toBe(cb[0]);
    expect(getFx(ca[0])).not.toBe(getFx(cb[0]));
    expect((a.children[0] as THREE.Mesh).material).toBe(ca[0]);
  });

  it('second ensure returns the same clones; has/get', () => {
    const am = new ActorMaterials();
    const r = actor(new THREE.MeshStandardMaterial());
    expect(am.has(r)).toBe(false);
    const c1 = am.ensure(r);
    const c2 = am.ensure(r);
    expect(c2[0]).toBe(c1[0]);
    expect(c2).toHaveLength(1);
    expect(am.has(r)).toBe(true);
    expect(am.get(r)[0]).toBe(c1[0]);
  });

  it('restore puts originals back, disposes clones, twice is safe', () => {
    const am = new ActorMaterials();
    const orig = new THREE.MeshStandardMaterial();
    const r = actor(orig);
    const [c] = am.ensure(r);
    const spy = vi.fn();
    c.addEventListener('dispose', spy);
    am.restore(r);
    expect((r.children[0] as THREE.Mesh).material).toBe(orig);
    expect(spy).toHaveBeenCalledOnce();
    expect(am.has(r)).toBe(false);
    expect(() => am.restore(r)).not.toThrow();
  });

  it('ignores non-standard materials and handles arrays', () => {
    const am = new ActorMaterials();
    const basic = new THREE.MeshBasicMaterial();
    const r1 = actor(basic);
    expect(am.ensure(r1)).toHaveLength(0);
    expect((r1.children[0] as THREE.Mesh).material).toBe(basic);

    const std = new THREE.MeshStandardMaterial();
    const r2 = new THREE.Group();
    r2.add(new THREE.Mesh(box(), [basic, std]));
    const cl = am.ensure(r2);
    const arr = (r2.children[0] as THREE.Mesh).material as THREE.Material[];
    expect(cl).toHaveLength(1);
    expect(arr[0]).toBe(basic);
    expect(arr[1]).toBe(cl[0]);
    am.restore(r2);
    expect((r2.children[0] as THREE.Mesh).material).toEqual([basic, std]);
  });

  it('picks up meshes added later', () => {
    const am = new ActorMaterials();
    const r = actor(new THREE.MeshStandardMaterial());
    const first = am.ensure(r)[0];
    r.add(new THREE.Mesh(box(), new THREE.MeshStandardMaterial()));
    const all = am.ensure(r);
    expect(all).toHaveLength(2);
    expect(all[0]).toBe(first);
  });

  it('onBeforeCompile patch injects uniforms and chunks, shared cache key', () => {
    const am = new ActorMaterials();
    const [c] = am.ensure(actor(new THREE.MeshStandardMaterial()));
    const shader = {
      uniforms: {} as Record<string, { value: unknown }>,
      vertexShader: '#include <common>\nvoid main(){\n}',
      fragmentShader: 'void main(){\n#include <emissivemap_fragment>\n#include <dithering_fragment>\n}',
    };
    c.onBeforeCompile(shader as never, null as never);
    const fx = getFx(c)!;
    expect(shader.uniforms.uTelegraph).toBe(fx.uTelegraph);
    expect(shader.uniforms.uDissolve).toBe(fx.uDissolve);
    expect(shader.uniforms.uTelegraphColor).toBe(fx.uTelegraphColor);
    expect(shader.uniforms.uDissolveTint).toBe(fx.uDissolveTint);
    expect(shader.uniforms.uTime).toBe(fx.uTime);
    expect(shader.vertexShader).toContain('varying vec3 vFxPos');
    expect(shader.vertexShader).toContain('vFxPos = position');
    expect(shader.fragmentShader).toContain('uniform float uDissolve');
    expect(shader.fragmentShader).toContain('if (fxDissolveNoise < uDissolve) discard');
    expect(shader.fragmentShader).toContain('uTelegraphColor * uTelegraph * 1.5');
    expect(shader.fragmentShader).toContain('uDissolveTint');
    expect(shader.fragmentShader).toContain('#include <dithering_fragment>');
    expect(shader.fragmentShader).not.toContain('undefined');
    expect(c.customProgramCacheKey()).toBe(ACTOR_FX_CACHE_KEY);
    const [d] = am.ensure(actor(new THREE.MeshStandardMaterial()));
    expect(d.customProgramCacheKey()).toBe(c.customProgramCacheKey());
  });

  it('patchActorShader tolerates a vertex shader without common', () => {
    const am = new ActorMaterials();
    const [c] = am.ensure(actor(new THREE.MeshStandardMaterial()));
    const s = { uniforms: {}, vertexShader: 'void main(){}', fragmentShader: 'void main(){}' };
    patchActorShader(s, getFx(c)!);
    expect(s.vertexShader).toContain('vFxPos');
  });
});
