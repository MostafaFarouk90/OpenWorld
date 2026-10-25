import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  FERRY_MERE_GREYWATCH_POINTS,
  FERRY_MERE_MIREWEATHER_POINTS,
  FERRY_REEDGATE_MERE_POINTS,
  GREYFEN_WATER_TABLE,
  HATHRENS_MERE,
} from '../../terrain/shape/greyfen';
import { ACT3_WATER_SURFACES, CHANNEL_HALF_WIDTH, FEN_TILE, WATER_SNIPPETS, buildAct3Water, stripEdges } from './act3Water';

const byId = (id: string) => ACT3_WATER_SURFACES.find((s) => s.id === id)!;
const meshes = (o: THREE.Object3D) => o.children.filter((c): c is THREE.Mesh => (c as THREE.Mesh).isMesh);

describe('ACT3_WATER_SURFACES', () => {
  it('has unique ids and every surface at the 6 m water table', () => {
    const ids = ACT3_WATER_SURFACES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(6);
    for (const s of ACT3_WATER_SURFACES) expect(s.surfaceY).toBe(6);
    expect(GREYFEN_WATER_TABLE).toBe(6);
  });

  it('has the Mere deep, its shelf wading from 330 to 380 m, and the fen sheet wading over the Greyfen box', () => {
    const mere = byId('water.mere');
    expect(mere.kind).toBe('deep');
    expect(mere.outline).toMatchObject({ kind: 'circle', x: 3000, z: 12500, radius: 330 });
    const shelf = byId('water.mere-shelf');
    expect(shelf.kind).toBe('wade');
    expect(shelf.outline).toMatchObject({ kind: 'circle', innerRadius: HATHRENS_MERE.radius, radius: HATHRENS_MERE.radius + HATHRENS_MERE.shelfWidth });
    expect((shelf.outline as { radius: number }).radius).toBe(380);
    const fen = byId('water.fen-pools');
    expect(fen.kind).toBe('wade');
    const pts = (fen.outline as unknown as { points: number[][] }).points;
    expect(Math.min(...pts.map((p) => p[0]))).toBe(-500);
    expect(Math.max(...pts.map((p) => p[0]))).toBe(6500);
    expect(Math.min(...pts.map((p) => p[1]))).toBe(9500);
    expect(Math.max(...pts.map((p) => p[1]))).toBe(15500);
  });

  it('has the three channels as deep strips that follow their polylines', () => {
    const lines = {
      'water.ferry-reedgate-mere': FERRY_REEDGATE_MERE_POINTS,
      'water.ferry-mere-greywatch': FERRY_MERE_GREYWATCH_POINTS,
      'water.ferry-mere-mireweather': FERRY_MERE_MIREWEATHER_POINTS,
    };
    for (const [id, line] of Object.entries(lines)) {
      const s = byId(id);
      expect(s.kind).toBe('deep');
      const poly = (s.outline as unknown as { points: number[][] }).points;
      expect(poly.length).toBe(line.length * 2);
      const n = line.length;
      for (let i = 0; i < n; i++) {
        const l = poly[i];
        const r = poly[2 * n - 1 - i];
        // The edges straddle the polyline vertex, 12 m each side.
        expect((l[0] + r[0]) / 2).toBeCloseTo(line[i][0], 6);
        expect((l[1] + r[1]) / 2).toBeCloseTo(line[i][1], 6);
        expect(Math.hypot(l[0] - r[0], l[1] - r[1])).toBeCloseTo(2 * CHANNEL_HALF_WIDTH, 6);
      }
    }
  });

  it('offsets a straight strip at right angles', () => {
    const { left, right } = stripEdges([[0, 0], [100, 0]], 12);
    expect(left).toEqual([[0, 12], [100, 12]].map((p) => p));
    expect(right[0][1]).toBe(-12);
  });
});

describe('buildAct3Water', () => {
  it('builds every mesh about its own centre, with small local vertices', () => {
    const w = buildAct3Water();
    const all = meshes(w.object);
    expect(all.length).toBeGreaterThan(168);
    for (const m of all) {
      const pos = m.geometry.getAttribute('position');
      let max = 0;
      for (let i = 0; i < pos.count; i++) max = Math.max(max, Math.hypot(pos.getX(i), pos.getY(i), pos.getZ(i)));
      expect(max, m.name).toBeLessThan(1000);
      expect(m.position.y).toBe(6);
    }
    // Placed at real engine centres: the Mere disc at its own centre, a fen tile at a tile centre.
    const mere = all.find((m) => m.name === 'water.mere')!;
    expect(mere.position.x).toBe(3000);
    expect(mere.position.z).toBe(12500);
    const tile = all.find((m) => m.name === 'fen-pools@0,0')!;
    expect(tile.position.x).toBe(-500 + FEN_TILE / 2);
    expect(tile.position.z).toBe(9500 + FEN_TILE / 2);
    w.dispose();
  });

  it('covers the whole fen box with tiles, none of them outside it', () => {
    const w = buildAct3Water();
    const tiles = meshes(w.object).filter((m) => m.name.startsWith('fen-pools'));
    expect(tiles.length).toBe(14 * 12);
    for (const t of tiles) {
      expect(t.position.x).toBeGreaterThan(-500);
      expect(t.position.x).toBeLessThan(6500);
      expect(t.position.z).toBeGreaterThan(9500);
      expect(t.position.z).toBeLessThan(15500);
    }
    w.dispose();
  });

  it('shows only meshes within the draw radius of the camera', () => {
    const w = buildAct3Water({ showRadius: 2500 });
    w.update({ x: 3000, z: 12500 }, 1);
    const visible = meshes(w.object).filter((m) => m.visible);
    expect(visible.length).toBeGreaterThan(20);
    expect(visible.length).toBeLessThan(meshes(w.object).length);
    for (const m of meshes(w.object)) {
      const d = Math.hypot(m.position.x - 3000, m.position.z - 12500);
      if (d > 2500 + 400) expect(m.visible, m.name).toBe(false);
      if (d < 2500 - 400) expect(m.visible, m.name).toBe(true);
    }
    // Far from the fen: nothing at all.
    w.update({ x: 15000, z: 2000 }, 2);
    expect(meshes(w.object).some((m) => m.visible)).toBe(false);
    // Moving back brings tiles in again.
    w.update({ x: 600, z: 10000 }, 3);
    expect(meshes(w.object).some((m) => m.name === 'fen-pools@0,0' && m.visible)).toBe(true);
    w.dispose();
  });

  it('advances the ripples and wraps the time', () => {
    const w = buildAct3Water();
    const mat = meshes(w.object)[0].material as THREE.ShaderMaterial;
    w.update({ x: 0, z: 10000 }, 12.5);
    expect(mat.uniforms.uTime.value).toBe(12.5);
    w.update({ x: 0, z: 10000 }, 1e9 + 0.5);
    expect(mat.uniforms.uTime.value).toBeLessThan(7200);
    w.update({ x: 0, z: 10000 }, Number.NaN);
    expect(mat.uniforms.uTime.value).toBe(0);
    w.dispose();
  });

  it('samples Greyfen-local coordinates and declares no GLSL reserved word', () => {
    const { vertex, fragment } = WATER_SNIPPETS;
    expect(vertex).toContain('vLocal = modelMatrix[3].xz - uOrigin + position.xz;');
    expect(fragment).not.toMatch(/worldPosition|vWorld/);
    const mat = meshes(buildAct3Water().object)[0].material as THREE.ShaderMaterial;
    expect(mat.uniforms.uOrigin.value.toArray()).toEqual([3000, 12500]);
    const reserved = ['patch', 'sample', 'input', 'output', 'filter', 'common', 'partition', 'active', 'noise', 'half', 'fixed', 'cast', 'namespace', 'using', 'superp', 'resource', 'buffer', 'shared', 'subroutine'];
    const declared = [...(vertex + fragment).matchAll(/\b(?:float|vec2|vec3|vec4)\s+([A-Za-z_]\w*)/g)].map((m) => m[1]);
    expect(declared.length).toBeGreaterThan(5);
    for (const name of declared) expect(reserved, name).not.toContain(name);
  });

  it('frees every geometry and both materials on dispose, and leaves the scene', () => {
    const w = buildAct3Water();
    const parent = new THREE.Group();
    parent.add(w.object);
    const all = meshes(w.object);
    let geoDisposed = 0;
    const geos = new Set(all.map((m) => m.geometry));
    for (const g of geos) g.addEventListener('dispose', () => geoDisposed++);
    const mats = new Set(all.map((m) => m.material as THREE.Material));
    let matDisposed = 0;
    for (const m of mats) m.addEventListener('dispose', () => matDisposed++);
    expect(mats.size).toBe(2);
    w.dispose();
    expect(geoDisposed).toBe(geos.size);
    expect(matDisposed).toBe(2);
    expect(w.object.parent).toBeNull();
  });
});
