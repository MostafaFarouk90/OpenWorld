// Tobb's look, shared by the pre-join NPC (thread 4) and the companion (4b) so both builders agree: the KayKit
// Rogue_Hooded with a green cape and a primitive lute on his back (the Quaternius lute prop is not available).
import * as THREE from 'three';

export const TOBB_CLOAK_COLOUR = 0x3f7a3a;
const CAPE = 'Rogue_Cape';

/**
 * Tints the cape green on its own cloned material (the rig shares one atlas material, `rogue_texture`, so the
 * clone keeps the rest of him untouched). Returns false when the model has no cape node.
 * Precondition: the cape's current materials are private to this model (as `prepareNpcModel` makes them); they are
 * disposed when replaced, so never pass a model that still shares the loader's source materials.
 */
export function applyTobbCloak(model: THREE.Object3D): boolean {
  let found = false;
  model.traverse((o) => {
    if (o.name !== CAPE) return;
    o.traverse((m) => {
      const mesh = m as THREE.Mesh;
      if (!mesh.isMesh) return;
      const tint = (mat: THREE.Material): THREE.Material => {
        const c = mat.clone();
        const col = (c as THREE.MeshStandardMaterial).color;
        if (col) col.set(TOBB_CLOAK_COLOUR);
        return c;
      };
      // The caller's materials may already be private clones (prepareNpcModel); dispose those we replace.
      const old = mesh.material;
      mesh.material = Array.isArray(old) ? old.map(tint) : tint(old);
      for (const o2 of Array.isArray(old) ? old : [old]) o2.dispose();
      found = true;
    });
  });
  return found;
}

/**
 * A lute in metres, slung across the back of a figure whose feet are at the origin and who faces -Z: a pear-shaped
 * body (scaled sphere), a neck and a bent peg-head. Add it to the figure's root, not to a bone, so it does not
 * depend on the rig's bone scale.
 */
export function buildLute(): THREE.Group {
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x3b2614, roughness: 0.8 });
  const g = new THREE.Group();
  g.name = 'tobb-lute';
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 8), wood);
  body.scale.set(1, 1.25, 0.45);
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.36, 0.03), dark);
  neck.position.y = 0.36;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.03), dark);
  head.position.set(0, 0.58, 0.04);
  head.rotation.x = 0.6;
  g.add(body, neck, head);
  // On the back (+Z is behind a figure facing -Z), slung diagonally.
  g.position.set(0, 1.05, 0.2);
  g.rotation.set(0, 0, 0.6);
  return g;
}

/** Disposes what `buildLute` created. */
export function disposeLute(g: THREE.Object3D): void {
  const mats = new Set<THREE.Material>();
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry.dispose();
    for (const mm of Array.isArray(m.material) ? m.material : [m.material]) mats.add(mm);
  });
  mats.forEach((m) => m.dispose());
}
