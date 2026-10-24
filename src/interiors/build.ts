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
  /** Hides or shows the merged greybox of a surface kind (the asset swap dresses it with models). Colliders are untouched. */
  setKindVisible(kind: BoxKind, visible: boolean): void;
  /** Rebuilds the prop greybox without the props whose `propId` is listed (the dressed ones). */
  hidePropBoxes(propIds: ReadonlySet<string>): void;
  dispose(): void;
  /** True once `dispose` has run (late dressing checks it). */
  readonly disposed: boolean;
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
  const kindMeshes = new Map<BoxKind, THREE.Mesh>();
  // Prop boxes keep their own geometry so the dressed ones can be dropped from the merge later.
  const propGeos: Array<{ propId?: string; geo: THREE.BufferGeometry }> = [];
  for (const [kind, geos] of byKind) {
    const merged = mergeGeometries(geos);
    if (kind === 'prop') for (const [i, b] of layout.boxes.filter((x) => x.kind === 'prop').entries()) propGeos.push({ propId: b.propId, geo: geos[i] });
    else for (const g of geos) g.dispose();
    if (!merged) continue;
    const material = new THREE.MeshStandardMaterial({ color: COLOURS[kind], roughness: 0.95, metalness: 0 });
    const mesh = new THREE.Mesh(merged, material);
    mesh.name = `${root.name}-${kind}`;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    root.add(mesh);
    kindMeshes.set(kind, mesh);
    disposables.push(merged, material);
  }
  disposables.push({ dispose: () => propGeos.forEach((p) => p.geo.dispose()) });

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
    // Blockers start open, unless the def builds one closed (v0.7 `startClosed`: a bridge that drops later).
    const closed = layout.def.blockers.find((d) => d.id === b.blockerId)?.startClosed === true;
    mesh.visible = closed;
    root.add(mesh);
    collider?.setEnabled(closed);
    blockers.set(b.blockerId, { mesh, collider });
  }

  let disposed = false;
  let current: THREE.BufferGeometry | null = null;
  return {
    layout,
    get disposed() {
      return disposed;
    },
    root,
    setBlocker(id, closed) {
      const b = blockers.get(id);
      if (!b) return false;
      b.mesh.visible = closed;
      b.collider?.setEnabled(closed);
      return true;
    },
    hasBlocker: (id) => blockers.has(id),
    setKindVisible(kind, visible) {
      const m = kindMeshes.get(kind);
      if (m) m.visible = visible;
    },
    hidePropBoxes(propIds) {
      const mesh = kindMeshes.get('prop');
      if (!mesh) return;
      const keep = propGeos.filter((p) => !(p.propId && propIds.has(p.propId))).map((p) => p.geo);
      const next = keep.length > 0 ? mergeGeometries(keep) : null;
      mesh.geometry.dispose();
      current = next;
      if (next) {
        mesh.geometry = next;
        mesh.visible = true;
      } else {
        mesh.geometry = new THREE.BufferGeometry();
        mesh.visible = false;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      for (const d of disposables) d.dispose();
      current?.dispose();
      // The dressing's instance buffers (geometry and atlas material are the shared library's).
      root.traverse((o) => (o as THREE.InstancedMesh).isInstancedMesh && (o as THREE.InstancedMesh).dispose());
      if (physics) for (const c of colliders) physics.removeCollider(c as Parameters<PhysicsWorld['removeCollider']>[0]);
    },
  };
}
