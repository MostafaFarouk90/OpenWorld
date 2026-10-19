import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { ModelLibrary } from '../assets/swap/ModelLibrary';
import { diskSource } from '../assets/swap/testing/diskSource';
import { buildInterior } from './build';
import { HARROWMARK_INTERIORS } from './harrowmark';
import { dressInterior, interiorModelIds, planInterior } from './interiorArt';
import { layoutInterior } from './layout';
import { UNDERWAYS_DEF } from './underways/generate';
import { VAULT_DEF } from './vaultDef';
import { SWAP_ASSETS } from '../assets/swap/swapModels';

const DEFS = [VAULT_DEF, ...HARROWMARK_INTERIORS, UNDERWAYS_DEF];
let lib: ModelLibrary;
beforeAll(async () => {
  lib = new ModelLibrary(await diskSource());
  await lib.preload(interiorModelIds());
});
const tpl = (id: string) => lib.peek(id);

describe('interior art', () => {
  it('names only models in the swap manifest', () => {
    for (const id of interiorModelIds()) expect(SWAP_ASSETS[id], id).toBeDefined();
  });

  it('plans pieces that stay inside the boxes they dress (0.05 m) for every interior', () => {
    for (const def of DEFS) {
      const layout = layoutInterior(def, () => 0);
      const { pieces, covers } = planInterior(def.id, layout.boxes, tpl);
      expect(pieces.length, def.id).toBeGreaterThan(0);
      expect(covers.has('floor') && covers.has('wall'), def.id).toBe(true);
      const all = new THREE.Box3();
      for (const b of layout.boxes) all.union(new THREE.Box3(new THREE.Vector3(b.min.x, b.min.y, b.min.z), new THREE.Vector3(b.max.x, b.max.y, b.max.z)));
      all.expandByScalar(0.1);
      for (const p of pieces) {
        const t = tpl(p.model)!;
        const box = new THREE.Box3(new THREE.Vector3(t.bounds.min.x, t.bounds.min.y, t.bounds.min.z), new THREE.Vector3(t.bounds.max.x, t.bounds.max.y, t.bounds.max.z)).applyMatrix4(p.matrix);
        expect(all.containsBox(box), `${def.id} ${p.kind} ${p.model}`).toBe(true);
      }
    }
  });

  it('dresses props by id prefix and leaves stairs, hearths and daises as boxes', () => {
    const layout = layoutInterior(HARROWMARK_INTERIORS.find((d) => d.id === 'tilted-anvil')!, () => 0);
    const { dressedProps } = planInterior('tilted-anvil', layout.boxes, tpl);
    expect(dressedProps.has('table.1')).toBe(true);
    expect(dressedProps.has('counter.1')).toBe(true);
    expect(dressedProps.has('bed.1')).toBe(true);
    expect(dressedProps.has('hearth.1')).toBe(false);
    const counting = planInterior('counting-house', layoutInterior(HARROWMARK_INTERIORS.find((d) => d.id === 'counting-house')!, () => 0).boxes, tpl);
    expect([...counting.dressedProps].some((id) => id.startsWith('stair.'))).toBe(false);
  });

  it('skips a kind whose model is missing instead of throwing', () => {
    const layout = layoutInterior(UNDERWAYS_DEF, () => 0);
    const none = planInterior('underways', layout.boxes, () => null);
    expect(none.pieces).toEqual([]);
    const noWall = planInterior('underways', layout.boxes, (id) => (id === 'dun/wall' ? null : tpl(id)));
    expect(noWall.covers.has('wall')).toBe(false);
    expect(noWall.covers.has('floor')).toBe(true);
  });

  it('is deterministic', () => {
    const layout = layoutInterior(UNDERWAYS_DEF, () => 0);
    const a = planInterior('underways', layout.boxes, tpl).pieces.map((p) => p.model).join();
    const b = planInterior('underways', layout.boxes, tpl).pieces.map((p) => p.model).join();
    expect(a).toBe(b);
  });

  it('dresses a built interior: greybox kinds hidden, art added, nothing casts a shadow, colliders untouched', async () => {
    const layout = layoutInterior(HARROWMARK_INTERIORS[0], () => 0);
    const built = buildInterior(layout, null);
    const boxesBefore = layout.boxes.length;
    const meshes = await dressInterior(lib, built);
    expect(meshes).toBeGreaterThan(0);
    const byName = (n: string) => built.root.getObjectByName(`${built.root.name}-${n}`) as THREE.Mesh;
    expect(byName('floor').visible).toBe(false);
    expect(byName('wall').visible).toBe(false);
    expect(byName('ceiling').visible).toBe(true);
    let casts = 0;
    built.root.traverse((o) => (o as THREE.Mesh).isMesh && (o as THREE.Mesh).castShadow && casts++);
    expect(casts).toBe(0);
    expect(layout.boxes.length).toBe(boxesBefore);
    built.dispose();
  });

  it('keeps the greybox when there is no loader, with no warning', async () => {
    const built = buildInterior(layoutInterior(UNDERWAYS_DEF, () => 0), null);
    expect(await dressInterior(new ModelLibrary(undefined), built)).toBe(0);
    expect((built.root.getObjectByName(`${built.root.name}-wall`) as THREE.Mesh).visible).toBe(true);
    built.dispose();
  });

  it('hidePropBoxes drops only the listed props from the greybox merge', () => {
    const layout = layoutInterior(HARROWMARK_INTERIORS[0], () => 0);
    const built = buildInterior(layout, null);
    const mesh = built.root.getObjectByName(`${built.root.name}-prop`) as THREE.Mesh;
    const before = mesh.geometry.getAttribute('position').count;
    built.hidePropBoxes(new Set(['table.1']));
    expect((built.root.getObjectByName(`${built.root.name}-prop`) as THREE.Mesh).geometry.getAttribute('position').count).toBeLessThan(before);
    built.hidePropBoxes(new Set(layout.boxes.filter((b) => b.propId).map((b) => b.propId!)));
    expect((built.root.getObjectByName(`${built.root.name}-prop`) as THREE.Mesh).visible).toBe(false);
    built.dispose();
  });

  it('adds nothing when the interior was disposed before the models arrived, and frees the dressing on dispose', async () => {
    const layout = layoutInterior(HARROWMARK_INTERIORS[0], () => 0);
    const early = buildInterior(layout, null);
    const pending = dressInterior(lib, early);
    early.dispose();
    expect(await pending).toBe(0);
    expect(early.disposed).toBe(true);
    expect(early.root.children.some((c) => c.name.endsWith('-art'))).toBe(false);

    const built = buildInterior(layoutInterior(HARROWMARK_INTERIORS[0], () => 0), null);
    expect(await dressInterior(lib, built)).toBeGreaterThan(0);
    const freed: string[] = [];
    built.root.traverse((o) => {
      if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).addEventListener('dispose' as never, () => freed.push(o.name));
    });
    built.dispose();
    expect(freed.length).toBeGreaterThan(0);
  });
});
