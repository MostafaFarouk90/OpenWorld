import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BRIGHTWATER_LAYOUT } from './brightwater.layout';
import { DEFAULT_HEIGHT, buildGreybox, structureHeight } from './greybox';
import type { StructureSpec } from './layoutTypes';

const base = (over: Partial<StructureSpec>): StructureSpec => ({
  id: 't',
  kind: 'house',
  x: 100,
  z: 200,
  yawDeg: 0,
  footprint: [8, 8],
  mode: 'solid',
  ...over,
});
const size = (o: THREE.Object3D) => new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3());
const bounds = (o: THREE.Object3D) => new THREE.Box3().setFromObject(o);

describe('greybox', () => {
  it('builds every layout structure, centred on its origin and standing on the ground', () => {
    for (const s of BRIGHTWATER_LAYOUT.structures) {
      const o = buildGreybox(s);
      const b = bounds(o);
      expect(b.isEmpty(), s.id).toBe(false);
      expect(b.min.y).toBeGreaterThanOrEqual(-1e-6);
      expect(Math.abs((b.min.x + b.max.x) / 2), s.id).toBeLessThan(Math.max(s.footprint[0], 1));
    }
  });

  it('uses the default height per kind and honours an explicit height', () => {
    expect(structureHeight(base({ kind: 'mill' }))).toBe(7);
    expect(structureHeight(base({ kind: 'mill', height: 9 }))).toBe(9);
    for (const k of Object.keys(DEFAULT_HEIGHT)) expect(DEFAULT_HEIGHT[k as keyof typeof DEFAULT_HEIGHT]).toBeGreaterThan(0);
  });

  it('leaves the bakery doorway open (no wall mesh crosses the doorway centre line below the lintel)', () => {
    const s = base({ kind: 'bakery', mode: 'enterable', footprint: [10, 10], door: { name: 'b', side: 'W', width: 2.4 } });
    const o = buildGreybox(s);
    const ray = new THREE.Raycaster(new THREE.Vector3(-20, 1, 0), new THREE.Vector3(1, 0, 0));
    const walls: THREE.Object3D[] = [];
    o.traverse((c) => c.name === 'wall' && walls.push(c));
    expect(walls.length).toBe(5); // N, S, E plus two west segments around the doorway
    o.updateMatrixWorld(true);
    const hits = ray.intersectObjects(walls);
    expect(hits.every((h) => h.object.position.x > 0)).toBe(true); // only the east wall is crossed
  });

  it('gives the chapel a tower stub reaching the banner anchors at dy 9', () => {
    const chapel = BRIGHTWATER_LAYOUT.structures.find((s) => s.id === 'chapel')!;
    const o = buildGreybox(chapel);
    expect(o.getObjectByName('tower')).toBeDefined();
    expect(bounds(o).max.y).toBeGreaterThanOrEqual(9);
  });

  it('shares materials between meshes', () => {
    const a = buildGreybox(base({ kind: 'pole', footprint: [0.4, 0.4] }));
    const b = buildGreybox(base({ kind: 'pole', footprint: [0.4, 0.4] }));
    const ma = (a.children[0] as THREE.Mesh).material;
    expect(ma).toBe((b.children[0] as THREE.Mesh).material);
    expect((ma as THREE.MeshLambertMaterial).flatShading).toBe(true);
  });

  it('scales a box house with its footprint', () => {
    const s = size(buildGreybox(base({ footprint: [12, 10] })));
    expect(s.x).toBeGreaterThanOrEqual(12);
    expect(s.z).toBeGreaterThanOrEqual(10);
  });

  it('throws for an unknown kind', () => {
    expect(() => buildGreybox(base({ kind: 'castle' as never }))).toThrow(/unknown structure kind/);
  });

  it('handles an enterable without a door (closed box)', () => {
    const o = buildGreybox(base({ kind: 'bakery', mode: 'enterable', footprint: [6, 6] }));
    expect(bounds(o).isEmpty()).toBe(false);
  });
});
