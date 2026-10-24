import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { GREYFEN_WATER_TABLE } from '../../terrain/shape/greyfen';
import { GREYFEN_MIST_BLEND, MIST_FOG_FAR, MIST_FOG_NEAR, MIST_GRID, MIST_HAZE, MIST_SHEET_HEIGHTS, MIST_SNIPPETS, buildGreyfenMist, greyfenWeight, mistFog } from './act3Mist';

describe('greyfenWeight', () => {
  it('is 1 inside the box, 0 beyond 600 m outside, a smoothstep between', () => {
    expect(greyfenWeight(3000, 12500)).toBe(1);
    expect(greyfenWeight(-500, 9500)).toBe(1);
    expect(greyfenWeight(6500, 15500)).toBe(1);
    expect(greyfenWeight(6500 + GREYFEN_MIST_BLEND, 12500)).toBe(0);
    expect(greyfenWeight(-500 - GREYFEN_MIST_BLEND - 1, 12500)).toBe(0);
    expect(greyfenWeight(14000, 2000)).toBe(0);
    expect(greyfenWeight(6500 + 300, 12500)).toBeCloseTo(0.5, 6);
    let prev = 1;
    for (let d = 0; d <= 600; d += 25) {
      const w = greyfenWeight(6500 + d, 12500);
      expect(w).toBeLessThanOrEqual(prev + 1e-12);
      prev = w;
    }
    // Diagonal off a corner falls by straight distance.
    expect(greyfenWeight(6500 + 500, 15500 + 500)).toBe(0);
    expect(greyfenWeight(6500 + 300, 15500 + 300)).toBeGreaterThan(0);
  });

  it('is 0 for non-finite input', () => {
    expect(greyfenWeight(Number.NaN, 12000)).toBe(0);
    expect(greyfenWeight(3000, Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('mistFog', () => {
  const base = new THREE.Color(0x889aaa);
  it('gives the base fog back at weight 0', () => {
    const f = mistFog(900, 5040, base, 0);
    expect(f.near).toBe(900);
    expect(f.far).toBe(5040);
    expect(f.color.getHex()).toBe(base.getHex());
  });

  it('reaches near 120 m, far 2600 m and the haze colour at weight 1', () => {
    const f = mistFog(900, 5040, base, 1);
    expect(f.near).toBe(MIST_FOG_NEAR);
    expect(f.far).toBe(MIST_FOG_FAR);
    expect(f.color.getHex()).toBe(MIST_HAZE.getHex());
  });

  it('blends in between, never lengthens a short fog, and does not touch the base colour', () => {
    const h = mistFog(900, 5040, base, 0.5);
    expect(h.near).toBeCloseTo(510, 6);
    expect(h.far).toBeCloseTo(3420, 6);
    const short = mistFog(60, 900, base, 1);
    expect(short.near).toBe(60);
    expect(short.far).toBe(900);
    expect(base.getHex()).toBe(new THREE.Color(0x889aaa).getHex());
    expect(mistFog(900, 5040, base, 7).near).toBe(MIST_FOG_NEAR);
    expect(mistFog(900, 5040, base, Number.NaN).near).toBe(900);
  });
});

describe('buildGreyfenMist', () => {
  const fog = new THREE.Color(0x889aaa);
  const sheets = (o: THREE.Object3D) => o.children as THREE.Mesh[];

  it('builds 3 sheets 1 to 5 m above the water table, hidden until the weight is positive', () => {
    const m = buildGreyfenMist();
    expect(sheets(m.object).length).toBe(3);
    for (const s of sheets(m.object)) {
      expect(s.position.y).toBeGreaterThanOrEqual(GREYFEN_WATER_TABLE + 1);
      expect(s.position.y).toBeLessThanOrEqual(GREYFEN_WATER_TABLE + 5);
    }
    expect(MIST_SHEET_HEIGHTS.length).toBe(3);
    expect(m.object.visible).toBe(false);
    m.update({ x: 3000, z: 12500 }, 0, 1, fog);
    expect(m.object.visible).toBe(false);
    m.update({ x: 3000, z: 12500 }, 1, 1, fog);
    expect(m.object.visible).toBe(true);
    m.update({ x: 3000, z: 12500 }, 0, 2, fog);
    expect(m.object.visible).toBe(false);
    m.dispose();
  });

  it('scales the opacity by the weight', () => {
    const m = buildGreyfenMist();
    const mat = (sheets(m.object)[0].material as THREE.ShaderMaterial).uniforms.uOpacity;
    m.update({ x: 3000, z: 12500 }, 1, 0, fog);
    const full = mat.value as number;
    m.update({ x: 3000, z: 12500 }, 0.5, 0, fog);
    expect(mat.value).toBeCloseTo(full / 2, 9);
    expect(full).toBeGreaterThan(0);
    expect(full).toBeLessThan(0.5);
    m.dispose();
  });

  it('follows the camera snapped to the grid, so the pattern does not swim', () => {
    const m = buildGreyfenMist();
    m.update({ x: 3010, z: 12520 }, 1, 0, fog);
    const a = sheets(m.object)[0].position.clone();
    m.update({ x: 3030, z: 12540 }, 1, 0, fog);
    expect(sheets(m.object)[0].position.x).toBe(a.x);
    expect(sheets(m.object)[0].position.z).toBe(a.z);
    m.update({ x: 3070, z: 12540 }, 1, 0, fog);
    expect(sheets(m.object)[0].position.x).toBe(a.x + MIST_GRID);
    for (const s of sheets(m.object)) {
      expect(s.position.x % MIST_GRID).toBe(0);
      expect(s.position.z % MIST_GRID).toBe(0);
    }
    m.dispose();
  });

  it('samples Greyfen-local coordinates, with no GLSL reserved word', () => {
    const { vertex, fragment } = MIST_SNIPPETS;
    expect(vertex).toContain('vLocal = modelMatrix[3].xz - uOrigin + position.xz;');
    expect(vertex + fragment).not.toMatch(/worldPosition/);
    const reserved = ['patch', 'sample', 'input', 'output', 'filter', 'common', 'partition', 'active', 'noise', 'half', 'fixed', 'cast', 'namespace', 'using', 'superp', 'resource', 'buffer', 'shared', 'subroutine'];
    const declared = [...(vertex + fragment).matchAll(/\b(?:float|vec2|vec3|vec4)\s+([A-Za-z_]\w*)/g)].map((x) => x[1]);
    expect(declared.length).toBeGreaterThan(5);
    for (const name of declared) expect(reserved, name).not.toContain(name);
    const m = buildGreyfenMist();
    expect((sheets(m.object)[0].material as THREE.ShaderMaterial).uniforms.uOrigin.value.toArray()).toEqual([3000, 12500]);
    m.dispose();
  });

  it('frees its geometry and materials on dispose', () => {
    const m = buildGreyfenMist();
    const parent = new THREE.Group();
    parent.add(m.object);
    let g = 0;
    let mt = 0;
    sheets(m.object)[0].geometry.addEventListener('dispose', () => g++);
    for (const s of sheets(m.object)) (s.material as THREE.Material).addEventListener('dispose', () => mt++);
    m.dispose();
    expect(g).toBe(1);
    expect(mt).toBe(3);
    expect(m.object.parent).toBeNull();
  });
});
