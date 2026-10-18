import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createFresnelShell, createShockRing, disposeFx, setRingProgress, setShellProgress } from './fresnelShell';

describe('fresnel shell and shock ring', () => {
  it('constructs a shell with additive material', () => {
    const m = createFresnelShell({ radius: 2, color: 0xff8800 });
    const mat = m.material as THREE.ShaderMaterial;
    expect(mat.blending).toBe(THREE.AdditiveBlending);
    expect(mat.depthWrite).toBe(false);
    expect(mat.uniforms.uIntensity.value).toBeGreaterThan(0);
    expect((mat.uniforms.uColor.value as THREE.Color).getHex()).toBe(0xff8800);
    expect(createFresnelShell({ radius: 1, color: 0, intensity: 3 }).material).toHaveProperty('uniforms.uIntensity.value', 3);
    setShellProgress(m, 0.4);
    expect(mat.uniforms.uProgress.value).toBe(0.4);
    setShellProgress(m, 7);
    expect(mat.uniforms.uProgress.value).toBe(1);
  });

  it('constructs a flat ring in XZ', () => {
    const r = createShockRing({ inner: 0.5, outer: 1, color: 0xffffff });
    r.geometry.computeBoundingBox();
    const bb = r.geometry.boundingBox!;
    expect(bb.max.y - bb.min.y).toBeLessThan(1e-6);
    expect(bb.max.x).toBeCloseTo(1);
    const mat = r.material as THREE.ShaderMaterial;
    expect(mat.side).toBe(THREE.DoubleSide);
    expect(mat.blending).toBe(THREE.AdditiveBlending);
    setRingProgress(r, 0.25);
    expect(mat.uniforms.uProgress.value).toBe(0.25);
    setRingProgress(r, NaN);
    expect(mat.uniforms.uProgress.value).toBe(0);
  });

  it('disposeFx detaches and disposes', () => {
    const g = new THREE.Group();
    const m = createFresnelShell({ radius: 1, color: 1 });
    g.add(m);
    let n = 0;
    m.geometry.addEventListener('dispose', () => n++);
    (m.material as THREE.Material).addEventListener('dispose', () => n++);
    disposeFx(m);
    expect(n).toBe(2);
    expect(m.parent).toBeNull();
  });
});
