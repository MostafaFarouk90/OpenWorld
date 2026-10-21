// The art layer for Deepgate's structures: a composed `StructureArt` (the Act 1 art for house, well, stall, gate, waystone and the
// rest, then these cases) behind a `BuildingLookup`. Hexagon models take a sooted tint, Grisel's buildings a green one; the
// headframe, collar, brazier, rope catwalks and spoil heaps are procedural. Procedural pieces sit in the structure holder's frame,
// so nothing samples raw world position (far coordinates).
import * as THREE from 'three';
import { explicitFit, fitToBox, tileLine } from '../assets/swap/fit';
import { ModelLibrary } from '../assets/swap/ModelLibrary';
import { structureHeight } from '../region/greybox';
import type { StructureSpec } from '../region/layoutTypes';
import { createStructureArt, type StructureArt } from '../region/structureArt';

/** Multiplies a Hexagon model's colours so Deepgate reads sooted. */
export const SOOT_TINT = 0.62;
/** Grisel's buildings (hall, barracks) keep more colour and lean green. */
export const GRISEL_TINT = new THREE.Color(0.62, 0.82, 0.62);

const mat = (color: number, extra: Partial<THREE.MeshLambertMaterialParameters> = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
const MATS = {
  iron: mat(0x2c2a2a),
  plank: mat(0x5b4129),
  rope: mat(0x8a7a58),
  stone: mat(0x6e6a64),
  hatch: mat(0x3a3836),
  spoil: mat(0x4a4038),
  coal: new THREE.MeshBasicMaterial({ color: 0xff7a2a }),
};

function own<T extends THREE.Object3D>(obj: T): T {
  obj.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.userData.ownGeometry = true;
  });
  return obj;
}

function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.userData.ownGeometry = true;
  return m;
}

/** Multiplies a clone's materials by `factor` (a number or a colour) in place; each material is cloned first, the library's templates share theirs. */
export function tintObject(obj: THREE.Object3D, factor: number | THREE.Color = SOOT_TINT): void {
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const swap = (src: THREE.Material): THREE.Material => {
      const c = src.clone();
      const col = (c as THREE.MeshStandardMaterial).color;
      if (col) {
        if (typeof factor === 'number') col.multiplyScalar(factor);
        else col.multiply(factor);
      }
      return c;
    };
    m.material = Array.isArray(m.material) ? m.material.map(swap) : swap(m.material);
  });
}

async function fitted(lib: ModelLibrary, spec: StructureSpec, id: string, maxScale: number, tint: number | THREE.Color = SOOT_TINT): Promise<THREE.Object3D | null> {
  const t = await lib.template(id);
  if (!t) return null;
  const [w, d] = spec.footprint;
  const obj = ModelLibrary.object(t, fitToBox(t.bounds, { width: w, depth: d }, { maxScale }));
  tintObject(obj, tint);
  return obj;
}

/** A run of `hex/wall_straight` along the footprint's long side. */
async function wallRun(lib: ModelLibrary, spec: StructureSpec): Promise<THREE.Object3D | null> {
  const t = await lib.template('hex/wall_straight');
  if (!t) return null;
  const [w, d] = spec.footprint;
  const alongX = w >= d;
  const len = alongX ? w : d;
  const h = structureHeight(spec);
  const raw = { x: t.bounds.max.x - t.bounds.min.x, y: t.bounds.max.y - t.bounds.min.y, z: t.bounds.max.z - t.bounds.min.z };
  const root = new THREE.Group();
  root.name = `wall:${spec.id}`;
  for (const p of tileLine(len, raw.x * (h / raw.y))) {
    const holder = new THREE.Group();
    holder.position.set(alongX ? p.c : 0, 0, alongX ? 0 : p.c);
    holder.rotation.y = alongX ? 0 : Math.PI / 2;
    holder.add(ModelLibrary.object(t, explicitFit(t.bounds, p.len / raw.x, h / raw.y, Math.min(d, w) / raw.z)));
    root.add(holder);
  }
  tintObject(root);
  return root;
}

function brazier(spec: StructureSpec): THREE.Object3D {
  const g = new THREE.Group();
  g.name = `brazier:${spec.id}`;
  g.add(mesh(new THREE.CylinderGeometry(0.08, 0.14, 0.9, 6), MATS.iron, 0, 0.45, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.55, 0.3, 0.35, 8), MATS.iron, 0, 1.0, 0));
  g.add(mesh(new THREE.ConeGeometry(0.36, 0.3, 6), MATS.coal, 0, 1.3, 0));
  return own(g);
}

function headframe(spec: StructureSpec): THREE.Object3D {
  const [w, d] = spec.footprint;
  const h = structureHeight(spec);
  const g = new THREE.Group();
  g.name = `headframe:${spec.id}`;
  const beam = (x0: number, z0: number, x1: number, z1: number, y1: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0, y1);
    const b = mesh(new THREE.BoxGeometry(0.4, len, 0.4), MATS.plank);
    b.position.set((x0 + x1) / 2, y1 / 2, (z0 + z1) / 2);
    b.lookAt(x1, y1, z1);
    b.rotateX(Math.PI / 2);
    g.add(b);
  };
  // Two A-frames, a leg either side of the collar at the front and back, meeting at the sheave.
  for (const sz of [-1, 1]) {
    beam(-w / 2, sz * d / 2, 0, sz * 0.5, h);
    beam(w / 2, sz * d / 2, 0, sz * 0.5, h);
  }
  g.add(mesh(new THREE.BoxGeometry(0.35, 0.35, d + 0.2), MATS.iron, 0, h, 0));
  const wheel = mesh(new THREE.TorusGeometry(1.1, 0.14, 6, 14), MATS.iron, 0, h - 0.6, 0);
  wheel.rotation.y = Math.PI / 2;
  g.add(wheel);
  g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, h - 1.7, 5), MATS.rope, 0, (h - 1.7) / 2 + 0.8, 0));
  return own(g);
}

function collar(spec: StructureSpec): THREE.Object3D {
  const [w, d] = spec.footprint;
  const h = structureHeight(spec);
  const g = new THREE.Group();
  g.name = `collar:${spec.id}`;
  g.add(mesh(new THREE.BoxGeometry(w, h, d), MATS.stone, 0, h / 2, 0));
  g.add(mesh(new THREE.BoxGeometry(w - 1.4, 0.12, d - 1.4), MATS.hatch, 0, h + 0.06, 0));
  for (const sx of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.3, 0.2, d - 1.4), MATS.iron, sx * (w / 2 - 1.4), h + 0.2, 0));
  return own(g);
}

/** Planks and two rope rails on posts, the deck `height` m above the ground (a catwalk; spans the footprint's long side). */
function ropeBridge(spec: StructureSpec): THREE.Object3D {
  const [w, d] = spec.footprint;
  const h = structureHeight(spec);
  const alongX = w >= d;
  const len = alongX ? w : d;
  const wid = alongX ? d : w;
  const g = new THREE.Group();
  g.name = `catwalk:${spec.id}`;
  const deck = new THREE.Group();
  const planks = Math.max(2, Math.round(len / 0.5));
  const plank = new THREE.BoxGeometry(0.42, 0.08, wid);
  for (let i = 0; i < planks; i++) deck.add(mesh(plank, MATS.plank, -len / 2 + (len * (i + 0.5)) / planks, h, 0));
  for (const s of [-1, 1]) {
    deck.add(mesh(new THREE.BoxGeometry(len, 0.05, 0.05), MATS.rope, 0, h + 1, s * (wid / 2 - 0.05)));
    for (const t of [-0.5, 0.5]) deck.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, h + 1, 5), MATS.plank, t * (len - 0.4), (h + 1) / 2, s * (wid / 2 - 0.05)));
  }
  if (!alongX) deck.rotation.y = Math.PI / 2;
  g.add(deck);
  return own(g);
}

function spoil(spec: StructureSpec): THREE.Object3D {
  const [w, d] = spec.footprint;
  const h = structureHeight(spec);
  const g = new THREE.Group();
  g.name = `spoil:${spec.id}`;
  const big = mesh(new THREE.ConeGeometry(Math.min(w, d) * 0.5, h, 7), MATS.spoil, 0, h / 2, 0);
  big.scale.set(w / Math.min(w, d), 1, d / Math.min(w, d));
  g.add(big);
  for (let i = 0; i < 3; i++) {
    const a = i * 2.1 + w;
    g.add(mesh(new THREE.DodecahedronGeometry(Math.min(w, d) * 0.12), MATS.stone, Math.cos(a) * w * 0.28, 0.3, Math.sin(a) * d * 0.28));
  }
  return own(g);
}

const PROCEDURAL: Record<string, (spec: StructureSpec) => THREE.Object3D> = {
  'deepgate-brazier': brazier,
  'deepgate-headframe': headframe,
  'deepgate-collar': collar,
  'deepgate-rope-bridge': ropeBridge,
  'deepgate-spoil': spoil,
};

/** Kinds the art layer draws itself; everything else goes to the Act 1 art (and then to the greybox). */
export const OLDSMOKE_ART_KINDS: readonly string[] = [...Object.keys(PROCEDURAL), 'deepgate-barracks', 'deepgate-hall', 'deepgate-furnace', 'wall', 'tower'];

export function createOldsmokeArt(lib: ModelLibrary): StructureArt {
  const base = createStructureArt(lib);
  return async (spec) => {
    const make = PROCEDURAL[spec.kind];
    if (make) return make(spec);
    switch (spec.kind) {
      case 'deepgate-barracks':
        return fitted(lib, spec, 'hex/building_barracks_red', 12, GRISEL_TINT);
      case 'deepgate-hall':
        return fitted(lib, spec, 'hex/building_castle_red', 16, GRISEL_TINT);
      case 'deepgate-furnace':
        return fitted(lib, spec, 'hex/building_blacksmith_red', 10, 0.5);
      case 'wall':
        return wallRun(lib, spec);
      case 'tower':
        return fitted(lib, spec, 'hex/building_tower_base_red', 12);
      default: {
        const real = await base(spec);
        if (real && ['house', 'well'].includes(spec.kind)) tintObject(real);
        return real;
      }
    }
  };
}
