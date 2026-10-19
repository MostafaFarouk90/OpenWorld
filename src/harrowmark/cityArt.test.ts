import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { ModelLibrary } from '../assets/swap/ModelLibrary';
import { diskSource } from '../assets/swap/testing/diskSource';
import { CHUNK, LOD_ENTER, LOD_EXIT, ModelChunks, buildCityModels, chunkKey, coverageOf, modelIdsFor, planStructure, type CityModels } from './cityArt';
import { HARROWMARK_LAYOUT } from './harrowmark.layout';
import { SWAP_ASSETS } from '../assets/swap/swapModels';

const structures = HARROWMARK_LAYOUT.structures;
const flat = () => 0;
let lib: ModelLibrary;
let models: CityModels | null;
beforeAll(async () => {
  lib = new ModelLibrary(await diskSource());
  models = await buildCityModels(lib, structures, flat);
});

const byId = (id: string) => structures.find((s) => s.id === id)!;

describe('recipes', () => {
  it('only name models that exist in the swap manifest', () => {
    for (const id of modelIdsFor(structures)) expect(SWAP_ASSETS[id], id).toBeDefined();
  });

  it('leave stair steps, the fountain, the portcullis, the drill blocker and tall rooftop crates to the greybox', () => {
    const keep = structures.filter((s) => s.kind === 'stair-step' || s.kind === 'fountain' || s.id.startsWith('portcullis') || s.id === 'bastion.drill-blocker' || (s.kind === 'crate' && (s.height ?? 0) > 2.5));
    expect(keep.length).toBeGreaterThan(20);
    for (const s of keep) {
      expect(coverageOf(s), s.id).toBeNull();
      expect(planStructure(s, 0, () => null), s.id).toEqual([]);
    }
  });

  it('keeps the Ward deck walkable: sides inset, top untouched, a full-footprint slab added', () => {
    const c = coverageOf(byId('ward.b11'))!;
    expect(c.topInset).toBeGreaterThan(0);
    expect(c.deck).toBeGreaterThan(0);
  });

  it('plans nothing for a template that did not load (the piece is skipped, never thrown)', () => {
    for (const s of structures) expect(() => planStructure(s, 0, () => null)).not.toThrow();
  });
});

describe('placements stay inside their collider footprint', () => {
  const inv = (s: (typeof structures)[number]) => new THREE.Matrix4().makeTranslation(s.x, 0, s.z).multiply(new THREE.Matrix4().makeRotationY((s.yawDeg * Math.PI) / 180)).invert();
  it('for every covered structure (0.6 m tolerance; the Ward facades 0.01 m so its 3 m alleys stay 3 m)', () => {
    const byModel = new Map(modelsOf());
    function modelsOf() {
      return [...new Set(modelIdsFor(structures))].map((id) => [id, lib.peek(id)!] as const);
    }
    let checked = 0;
    for (const s of structures) {
      const pieces = planStructure(s, 0, (id) => byModel.get(id) ?? null);
      if (pieces.length === 0) continue;
      const back = inv(s);
      const tol = s.id.startsWith('ward.') ? 0.01 : 0.6;
      const [w, d] = s.footprint;
      for (const p of pieces) {
        const t = byModel.get(p.model)!;
        const box = new THREE.Box3(new THREE.Vector3(t.bounds.min.x, t.bounds.min.y, t.bounds.min.z), new THREE.Vector3(t.bounds.max.x, t.bounds.max.y, t.bounds.max.z)).applyMatrix4(p.matrix);
        // Corners of a rotated box in structure space: transform the 8 corners individually.
        const corners: THREE.Vector3[] = [];
        for (const x of [t.bounds.min.x, t.bounds.max.x]) for (const y of [t.bounds.min.y, t.bounds.max.y]) for (const z of [t.bounds.min.z, t.bounds.max.z]) corners.push(new THREE.Vector3(x, y, z).applyMatrix4(p.matrix).applyMatrix4(back));
        const local = new THREE.Box3().setFromPoints(corners);
        // Chapel and keep towers/castle may overhang by roofs; the keep hall's castle is inside by construction.
        expect(local.max.x, `${p.structure}/${p.model}`).toBeLessThanOrEqual(w / 2 + tol);
        expect(local.min.x, `${p.structure}/${p.model}`).toBeGreaterThanOrEqual(-w / 2 - tol);
        expect(local.max.z, `${p.structure}/${p.model}`).toBeLessThanOrEqual(d / 2 + tol);
        expect(local.min.z, `${p.structure}/${p.model}`).toBeGreaterThanOrEqual(-d / 2 - tol);
        expect(box.min.y, `${p.structure}/${p.model}`).toBeGreaterThanOrEqual(-2.01);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });
});

describe('chunked model tier', () => {
  it('builds with every model of the recipes and reports meshes, instances and triangles', () => {
    expect(models).not.toBeNull();
    const m = models!;
    expect(m.stats.instances).toBeGreaterThan(1500);
    expect(m.stats.batches).toBeGreaterThan(10);
    expect(m.chunks.groups.size).toBeGreaterThan(10);
    console.info(`harrowmark models: ${m.stats.batches} meshes in ${m.chunks.groups.size} chunks, ${m.stats.instances} instances, ${m.stats.triangles} triangles total`);
  });

  it('keys placements by 96 m cells', () => {
    expect(chunkKey(0, 0)).toBe('0,0');
    expect(chunkKey(CHUNK - 0.1, -0.1)).toBe('0,-1');
    expect(chunkKey(8500, 1250)).toBe(`${Math.floor(8500 / CHUNK)},${Math.floor(1250 / CHUNK)}`);
  });

  it('hides everything beyond the exit radius and shows the near chunks, with hysteresis', () => {
    const m = models!;
    const g = m.chunks;
    // The South Gate square.
    g.update(8500, 50, 1300);
    const near = g.visibleKeys().length;
    expect(near).toBeGreaterThan(0);
    expect(near).toBeLessThan(g.groups.size);
    // Far outside the city nothing shows.
    g.update(8500, 50, -3000);
    expect(g.visibleKeys()).toEqual([]);
    // Hysteresis: walking out, a shown chunk stays until EXIT; walking in it does not show until ENTER.
    const sphere = [...g.groups.values()][0].userData.sphere as THREE.Sphere;
    const at = (dist: number) => [sphere.center.x + sphere.radius + dist, sphere.center.y, sphere.center.z] as const;
    g.update(...at(LOD_ENTER - 5));
    const key = [...g.groups.keys()][0];
    expect(g.groups.get(key)!.visible).toBe(true);
    g.update(...at((LOD_ENTER + LOD_EXIT) / 2));
    expect(g.groups.get(key)!.visible).toBe(true);
    g.update(...at(LOD_EXIT + 5));
    expect(g.groups.get(key)!.visible).toBe(false);
    g.update(...at((LOD_ENTER + LOD_EXIT) / 2));
    expect(g.groups.get(key)!.visible).toBe(false);
  });

  it('shrinks both radii with the quality scale', () => {
    const g = models!.chunks;
    const sphere = [...g.groups.values()][0].userData.sphere as THREE.Sphere;
    const cam = [sphere.center.x + sphere.radius + 200, sphere.center.y, sphere.center.z] as const;
    g.update(...cam, 1);
    const key = [...g.groups.keys()][0];
    expect(g.groups.get(key)!.visible).toBe(true);
    g.update(...cam, 0.6);
    expect(g.groups.get(key)!.visible).toBe(false);
  });

  it('stays inside the frame budget at the measured stops (meshes, triangles)', () => {
    const m = models!;
    const stops: Array<[string, number, number]> = [
      ['gate-square', 8500, 1300],
      ['market', 8760, 1520],
      ['fountain-up-keep-road', 8500, 1730],
      ['forge-row', 8200, 1520],
      ['ring-wall', 8500, 1260],
      ['ward', 8850, 2390],
      ['keep', 8500, 2560],
    ];
    const report: string[] = [];
    let worstMeshes = 0;
    let worstTris = 0;
    for (const [name, x, z] of stops) {
      m.chunks.update(x, 40, z);
      let meshes = 0;
      for (const k of m.chunks.visibleKeys()) m.chunks.groups.get(k)!.traverse((o) => (o as THREE.InstancedMesh).isInstancedMesh && meshes++);
      const tris = m.visibleTriangles();
      worstMeshes = Math.max(worstMeshes, meshes);
      worstTris = Math.max(worstTris, tris);
      report.push(`${name}: ${m.chunks.visibleKeys().length} chunks, ${meshes} meshes, ${tris} triangles`);
    }
    console.info(report.join('\n'));
    // Pinned after measuring (see the PR): the shown chunks' triangles are all drawn when in frustum, so this is the upper bound.
    expect(worstMeshes).toBeLessThanOrEqual(BUDGET.shownMeshes);
    expect(worstTris).toBeLessThanOrEqual(BUDGET.shownTriangles);
    expect(m.stats.batches).toBeLessThanOrEqual(BUDGET.builtMeshes);
  });
});

/** Measured 2026-10-19 (worst stop: 55 meshes, 356k triangles, 238 built); headroom added. Design 14.7 caps visible triangles at 1.5 M and draw calls at 300. */
const BUDGET = { shownMeshes: 64, shownTriangles: 450_000, builtMeshes: 260 };

describe('ModelChunks', () => {
  it('starts hidden', () => {
    const g = new THREE.Group();
    g.userData.sphere = new THREE.Sphere(new THREE.Vector3(), 10);
    g.visible = true;
    const c = new ModelChunks(new Map([['a', g]]));
    expect(g.visible).toBe(false);
    expect(c.update(0, 0, 0)).toBe(1);
  });
});
