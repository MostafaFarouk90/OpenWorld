import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { BoxKind, InteriorLayout, SolidBox } from './layout';

interface ColliderLike {
  setEnabled(on: boolean): void;
}

/** An interior's Three root and Rapier colliders. Colliders exist from setup on; the root is shown only while inside. */
export interface BuiltInterior {
  readonly layout: InteriorLayout;
  readonly root: THREE.Group;
  setBlocker(blockerId: string, closed: boolean): boolean;
  hasBlocker(blockerId: string): boolean;
  dispose(): void;
}

const COLOURS: Record<BoxKind, number> = {
  floor: 0x4a4540,
  wall: 0x6b655d,
  ceiling: 0x3a3632,
  pillar: 0x7a736a,
  prop: 0x5e4a36,
  blocker: 0x2b2622,
};

function boxGeometry(b: SolidBox): THREE.BufferGeometry {
  const sx = b.max.x - b.min.x;
  const sy = b.max.y - b.min.y;
  const sz = b.max.z - b.min.z;
  const g = new THREE.BoxGeometry(sx, sy, sz);
  g.translate((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2);
  return g;
}

function addCollider(physics: PhysicsWorld, b: SolidBox) {
  const R = physics.rapier;
  const desc = R.ColliderDesc.cuboid((b.max.x - b.min.x) / 2, (b.max.y - b.min.y) / 2, (b.max.z - b.min.z) / 2).setTranslation(
    (b.min.x + b.max.x) / 2,
    (b.min.y + b.max.y) / 2,
    (b.min.z + b.max.z) / 2,
  );
  return physics.addStaticCollider(desc);
}

/**
 * Greybox meshes (one merged mesh per surface kind, emissive torch heads for the bloom pass) and static colliders. Nothing
 * casts a shadow, so the floating interior never darkens the land below. `physics` may be null in render-free tests.
 */
export function buildInterior(layout: InteriorLayout, physics: PhysicsWorld | null): BuiltInterior {
  const root = new THREE.Group();
  root.name = `interior-${layout.def.id}`;
  root.visible = false;
  const disposables: { dispose(): void }[] = [];

  const byKind = new Map<BoxKind, THREE.BufferGeometry[]>();
  for (const b of layout.boxes) {
    if (b.kind === 'blocker') continue;
    const list = byKind.get(b.kind) ?? [];
    list.push(boxGeometry(b));
    byKind.set(b.kind, list);
  }
  for (const [kind, geos] of byKind) {
    const merged = mergeGeometries(geos);
    for (const g of geos) g.dispose();
    if (!merged) continue;
    const material = new THREE.MeshStandardMaterial({ color: COLOURS[kind], roughness: 0.95, metalness: 0 });
    const mesh = new THREE.Mesh(merged, material);
    mesh.name = `${root.name}-${kind}`;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    root.add(mesh);
    disposables.push(merged, material);
  }

  const torchGeo = new THREE.BoxGeometry(0.18, 0.3, 0.18);
  const torchMat = new THREE.MeshStandardMaterial({ color: 0x331a08, emissive: 0xff9a3c, emissiveIntensity: 2.5 });
  disposables.push(torchGeo, torchMat);
  for (const [i, t] of layout.torches.entries()) {
    const m = new THREE.Mesh(torchGeo, torchMat);
    m.name = `${root.name}-torch-${i}`;
    m.position.set(t.x, t.y, t.z);
    m.castShadow = false;
    root.add(m);
  }

  const blockers = new Map<string, { mesh: THREE.Mesh; collider: ColliderLike | null }>();
  const blockerMat = new THREE.MeshStandardMaterial({ color: COLOURS.blocker, roughness: 0.9 });
  disposables.push(blockerMat);
  const colliders: unknown[] = [];
  for (const b of layout.boxes) {
    const collider = physics ? addCollider(physics, b) : null;
    if (collider) colliders.push(collider);
    if (b.kind !== 'blocker' || !b.blockerId) continue;
    const geo = boxGeometry(b);
    disposables.push(geo);
    const mesh = new THREE.Mesh(geo, blockerMat);
    mesh.name = `${root.name}-${b.blockerId}`;
    mesh.castShadow = false;
    mesh.visible = false;
    root.add(mesh);
    // Blockers start open.
    collider?.setEnabled(false);
    blockers.set(b.blockerId, { mesh, collider });
  }

  let disposed = false;
  return {
    layout,
    root,
    setBlocker(id, closed) {
      const b = blockers.get(id);
      if (!b) return false;
      b.mesh.visible = closed;
      b.collider?.setEnabled(closed);
      return true;
    },
    hasBlocker: (id) => blockers.has(id),
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      for (const d of disposables) d.dispose();
      if (physics) for (const c of colliders) physics.removeCollider(c as Parameters<PhysicsWorld['removeCollider']>[0]);
    },
  };
}
