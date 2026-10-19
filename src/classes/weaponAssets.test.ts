// The asset swap's weapons: every class holds a KayKit Adventurers weapon already (the Knight's sword and shield are the
// standalone files; the other four are built into their character glb). The
// standalone weapon files are the same meshes, so swapping them in changes nothing on screen; this pins that, and that the
// Pathfinder's crossbow tip marker still sits on the muzzle.
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { diskSource } from '../assets/swap/testing/diskSource';
import { DEFAULT_KITS } from './kits';
import { CROSSBOW_TIP } from './pathfinder/pathfinder.plugin';

type Source = Awaited<ReturnType<typeof diskSource>>;
let src: Source;

beforeAll(async () => {
  src = await diskSource();
});

/** Vertex count and local bounds of every mesh under `o`, in `o`'s own space. */
function measure(o: THREE.Object3D): { vertices: number; size: number[]; min: number[] } {
  o.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(o.matrixWorld).invert();
  const box = new THREE.Box3();
  let vertices = 0;
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (!m.isMesh) return;
    vertices += m.geometry.attributes.position.count;
    m.geometry.computeBoundingBox();
    box.union(m.geometry.boundingBox!.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld)));
  });
  const size = box.getSize(new THREE.Vector3());
  return { vertices, size: size.toArray(), min: box.min.toArray() };
}

const find = (root: THREE.Object3D, name: string): THREE.Object3D => {
  let hit: THREE.Object3D | null = null;
  root.traverse((o) => {
    if (!hit && o.name === name) hit = o;
  });
  if (!hit) throw new Error(`no "${name}" in the model`);
  return hit;
};

// [kit id, embedded mesh on the class model, the standalone weapon file]
const PAIRS: Array<[string, 'mainhand' | 'offhand' | 'offhandVisual', string]> = [
  ['warden', 'mainhand', 'wpn/axe_2handed'],
  ['ashblade', 'mainhand', 'wpn/dagger'],
  ['ashblade', 'offhandVisual', 'wpn/dagger'],
  ['pathfinder', 'mainhand', 'wpn/crossbow_2handed'],
  ['emberwright', 'offhandVisual', 'wpn/spellbook_closed'],
  ['emberwright', 'mainhand', 'wpn/staff'],
];

describe('class weapons vs the standalone KayKit weapon files', () => {
  for (const [classId, slot, weapon] of PAIRS) {
    it(`${classId} ${slot} is the same mesh as ${weapon}`, async () => {
      const kit = (DEFAULT_KITS as Record<string, any>)[classId];
      const w = kit[slot] ?? (classId === 'emberwright' && slot === 'offhandVisual' ? { embedded: 'Spellbook' } : undefined);
      if (!w) throw new Error(`${classId} has no ${slot}`);
      expect(w, `${classId} has a ${slot}`).toBeTruthy();
      await src.load(kit.model);
      await src.load(weapon);
      const embedded = measure(find(src.instantiate(kit.model), w.embedded));
      const standalone = measure(src.instantiate(weapon));
      expect(standalone.vertices).toBe(embedded.vertices);
      embedded.size.forEach((v, i) => expect(standalone.size[i]).toBeCloseTo(v, 2));
    });
  }

  it('the Pathfinder crossbow tip is at the muzzle of the crossbow it holds', async () => {
    await src.load('wpn/crossbow_2handed');
    const m = measure(src.instantiate('wpn/crossbow_2handed'));
    // CROSSBOW_TIP is in the weapon's grip space: forward (+z) to the muzzle, within the model's length.
    expect(CROSSBOW_TIP.z).toBeGreaterThan(0.5);
    expect(CROSSBOW_TIP.z).toBeLessThan(m.min[2] + m.size[2] + 0.2);
  });
});
