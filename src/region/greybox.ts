// Primitive stand-ins for every structure kind. Origin is the footprint centre on the ground; the caller
// applies yaw. Materials are shared and flat-shaded; geometries are per mesh (the builder disposes them).
import * as THREE from 'three';
import { doorFillBox, wallBoxes } from './geometry';
import type { StructureKind, StructureSpec } from './layoutTypes';
import { buildWaystoneMesh } from './waystoneMesh';

export const DEFAULT_HEIGHT: Record<StructureKind, number> = {
  house: 5,
  tavern: 5,
  bakery: 5,
  mill: 7,
  chapel: 8,
  well: 1,
  altar: 1.1,
  waystone: 2.4,
  board: 2,
  pole: 2.5,
  cart: 1,
  fence: 0.9,
  gate: 3,
  loft: 3,
  'yard-fence': 1.1,
  rock: 2,
  bridge: 0.3,
  stair: 0.2,
};

/** Height of a door slab; the wall above the doorway is closed by a lintel. */
export const DOOR_HEIGHT = 2.6;

export function structureHeight(spec: StructureSpec): number {
  if (spec.height !== undefined) return spec.height;
  const h = DEFAULT_HEIGHT[spec.kind];
  if (h === undefined) throw new Error(`greybox: unknown structure kind "${String(spec.kind)}"`);
  return h;
}

const materials = new Map<number, THREE.MeshLambertMaterial>();
export function greyMat(hex: number): THREE.MeshLambertMaterial {
  let m = materials.get(hex);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color: hex, flatShading: true });
    materials.set(hex, m);
  }
  return m;
}

const WALL = 0xc9b79c;
const ROOF = 0x8a4b3a;
const WOOD = 0x7a5a3a;
const STONE = 0x8d8d8d;

function box(w: number, h: number, d: number, x: number, y: number, z: number, color: number, name?: string): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), greyMat(color));
  m.position.set(x, y + h / 2, z);
  if (name) m.name = name;
  return m;
}

function cyl(rTop: number, rBot: number, h: number, x: number, y: number, z: number, color: number, seg = 10): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), greyMat(color));
  m.position.set(x, y + h / 2, z);
  return m;
}

/** Four-sided pyramid roof covering w x d. */
function pyramid(w: number, d: number, h: number, y: number, color: number): THREE.Mesh {
  const r = Math.hypot(w, d) / 2;
  const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 4, 1), greyMat(color));
  m.rotation.y = Math.PI / 4;
  m.scale.set(w / (r * Math.SQRT2), 1, d / (r * Math.SQRT2));
  m.position.y = y + h / 2;
  return m;
}

function hollowEnterable(spec: StructureSpec, g: THREE.Group, h: number): void {
  for (const b of wallBoxes(spec)) {
    g.add(box(b.hx * 2, h, b.hz * 2, b.cx - spec.x, 0, b.cz - spec.z, WALL, 'wall'));
  }
  const [w, d] = spec.footprint;
  g.add(box(w + 0.4, 0.4, d + 0.4, 0, h, 0, ROOF, 'roof'));
  const fill = doorFillBox(spec);
  if (fill && h > DOOR_HEIGHT) {
    g.add(box(fill.hx * 2, h - DOOR_HEIGHT, fill.hz * 2, fill.cx - spec.x, DOOR_HEIGHT, fill.cz - spec.z, WALL, 'lintel'));
  }
  if (spec.kind === 'chapel') {
    // Tower stub on the ridge, tall enough for the banner anchors (dy 9 over a height-8 nave).
    g.add(box(Math.max(1, w - 2), 3.5, Math.min(4, d), 0, h + 0.4, 0, STONE, 'tower'));
  }
}

function post(g: THREE.Group, x: number, z: number, h: number, color = WOOD): void {
  g.add(box(0.4, h, 0.4, x, 0, z, color));
}

export function buildGreybox(spec: StructureSpec): THREE.Object3D {
  const h = structureHeight(spec);
  const [w, d] = spec.footprint;
  const g = new THREE.Group();
  g.name = `greybox:${spec.id}`;
  g.userData.greybox = true;

  switch (spec.kind) {
    case 'house':
    case 'tavern':
      g.add(box(w, h * 0.65, d, 0, 0, 0, WALL, 'walls'));
      g.add(pyramid(w + 0.6, d + 0.6, h * 0.35, h * 0.65, ROOF));
      break;
    case 'bakery':
    case 'chapel':
      hollowEnterable(spec, g, h);
      break;
    case 'mill':
      g.add(cyl(Math.min(w, d) * 0.3, Math.min(w, d) * 0.4, h * 0.8, 0, 0, 0, WALL, 12));
      g.add(new THREE.Mesh(new THREE.ConeGeometry(Math.min(w, d) * 0.38, h * 0.3, 12), greyMat(ROOF)));
      g.children[1].position.y = h * 0.8 + h * 0.15;
      for (let i = 0; i < 4; i++) {
        const vane = box(0.5, h * 0.7, 0.1, 0, 0, 0, WOOD, 'vane');
        vane.geometry.translate(0, h * 0.35, 0);
        vane.position.set(0, h * 0.7, Math.min(w, d) * 0.4 + 0.2);
        vane.rotation.z = (i * Math.PI) / 2;
        g.add(vane);
      }
      break;
    case 'well':
      g.add(cyl(Math.min(w, d) * 0.45, Math.min(w, d) * 0.45, h, 0, 0, 0, STONE, 12));
      post(g, -w * 0.4, 0, h * 2);
      post(g, w * 0.4, 0, h * 2);
      g.add(box(w, 0.15, d * 0.6, 0, h * 2, 0, ROOF));
      break;
    case 'altar':
      g.add(box(w, h, d, 0, 0, 0, STONE, 'altar'));
      break;
    case 'waystone': {
      const m = buildWaystoneMesh();
      m.scale.setScalar(h / 2.4);
      g.add(m);
      break;
    }
    case 'board':
      post(g, -w * 0.4, 0, h);
      post(g, w * 0.4, 0, h);
      g.add(box(w, h * 0.5, 0.15, 0, h * 0.45, 0, 0xb08d57, 'panel'));
      break;
    case 'pole':
      g.add(cyl(0.18, 0.22, h, 0, 0, 0, WOOD, 8));
      break;
    case 'cart':
      g.add(box(w, 0.4, d, 0, 0.45, 0, WOOD, 'bed'));
      for (const sx of [-1, 1]) {
        const wheel = cyl(0.45, 0.45, 0.12, sx * (w / 2 - 0.2), 0, d / 2 + 0.05, 0x4a3a2a, 12);
        wheel.rotation.x = Math.PI / 2;
        wheel.position.y = 0.45;
        g.add(wheel);
        const wheel2 = wheel.clone();
        wheel2.position.z = -d / 2 - 0.05;
        g.add(wheel2);
      }
      break;
    case 'fence': {
      const n = Math.max(2, Math.round(w / 2) + 1);
      for (let i = 0; i < n; i++) post(g, -w / 2 + (i * w) / (n - 1), 0, h);
      g.add(box(w, 0.12, 0.12, 0, h * 0.4, 0, WOOD));
      g.add(box(w, 0.12, 0.12, 0, h * 0.8, 0, WOOD));
      break;
    }
    case 'gate':
      post(g, -w / 2 + 0.3, 0, h);
      post(g, w / 2 - 0.3, 0, h);
      g.add(box(w, 0.4, 0.4, 0, h - 0.2, 0, WOOD, 'lintel'));
      break;
    case 'loft':
      g.add(box(w, 0.2, d, 0, 0, 0, WOOD, 'floor'));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) post(g, sx * (w / 2 - 0.25), sz * (d / 2 - 0.25), h);
      g.add(pyramid(w + 0.8, d + 0.8, 1.2, h, 0xb59a5a));
      break;
    case 'yard-fence': {
      const step = 3;
      for (const sz of [-1, 1]) {
        for (let x = -w / 2; x <= w / 2 + 1e-6; x += step) post(g, x, sz * (d / 2), h);
        g.add(box(w, 0.1, 0.1, 0, h * 0.7, sz * (d / 2), WOOD));
      }
      for (const sx of [-1, 1]) {
        for (let z = -d / 2 + step; z < d / 2 - 1e-6; z += step) post(g, sx * (w / 2), z, h);
        g.add(box(0.1, 0.1, d, sx * (w / 2), h * 0.7, 0, WOOD));
      }
      break;
    }
    case 'rock': {
      // A boulder pile: the main block plus two offset blocks so the silhouette is not a box.
      g.add(box(w, h, d, 0, 0, 0, 0x7d7a74, 'rock'));
      g.add(box(w * 0.55, h * 0.35, d * 0.5, w * 0.12, h, -d * 0.1, 0x8a8780));
      g.add(box(w * 0.3, h * 0.2, d * 0.3, -w * 0.25, h, d * 0.2, 0x6f6c66));
      break;
    }
    case 'bridge': {
      g.add(box(w, h, d, 0, 0, 0, WOOD, 'deck'));
      for (const sz of [-1, 1]) {
        g.add(box(w, 0.08, 0.1, 0, h + 0.8, sz * (d / 2 - 0.05), WOOD, 'rail'));
        for (const sx of [-1, 0, 1]) post(g, sx * (w / 2 - 0.1), sz * (d / 2 - 0.05), h + 0.9);
      }
      break;
    }
    case 'stair': {
      // A stone frame round a dark opening: the crypt stair beside the altar.
      g.add(box(w, h, d, 0, 0, 0, 0x2a2622, 'opening'));
      g.add(box(w + 0.4, 0.15, 0.2, 0, h, -d / 2 - 0.1, STONE));
      g.add(box(w + 0.4, 0.15, 0.2, 0, h, d / 2 + 0.1, STONE));
      g.add(box(0.2, 0.15, d, -w / 2 - 0.1, h, 0, STONE));
      g.add(box(0.2, 0.15, d, w / 2 + 0.1, h, 0, STONE));
      break;
    }
    default:
      throw new Error(`greybox: unknown structure kind "${String(spec.kind)}"`);
  }
  return g;
}

/** Disposes the geometries of a greybox (materials are shared and stay). Real model clones are left alone. */
export function disposeGreybox(obj: THREE.Object3D): void {
  if (!obj.userData.greybox) return;
  obj.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose();
  });
}
