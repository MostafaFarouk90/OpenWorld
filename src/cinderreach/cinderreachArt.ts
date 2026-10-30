// The art layer for Cinderreach's structures: a composed `StructureArt` (the Act 1 art for house, well, tavern, fence, gate,
// waystone and the rest, then these cases) behind a `BuildingLookup`. Hexagon models take the darker "Cinderreach" tint
// (design 5.3); cages, chains, the blightbloom, the boarded well, the ring and the relics are procedural. Procedural pieces
// sit in the structure holder's frame, so nothing samples raw world position (far coordinates).
import * as THREE from 'three';
import { explicitFit, fitToBox, tileLine } from '../assets/swap/fit';
import { ModelLibrary } from '../assets/swap/ModelLibrary';
import { structureHeight } from '../region/greybox';
import type { StructureSpec } from '../region/layoutTypes';
import { createStructureArt, type StructureArt } from '../region/structureArt';
import { createEnvStructureArt, type EnvEntry } from '../env/envStructureArt';

/** Multiplies a Hexagon model's colours by this to read as burnt, ash-dusted foothill buildings. */
export const CINDER_TINT = 0.72;

const mat = (color: number, extra: Partial<THREE.MeshLambertMaterialParameters> = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
const MATS = {
  iron: mat(0x2c2a2a),
  plank: mat(0x5b4129),
  stone: mat(0x76726a),
  paper: mat(0xd9ccb0),
  cloth: mat(0x7a2f26),
  bloom: new THREE.MeshBasicMaterial({ color: 0xff7a2a }),
  stain: new THREE.MeshBasicMaterial({ color: 0x2a1810, transparent: true, opacity: 0.85, depthWrite: false }),
  rune: new THREE.MeshBasicMaterial({ color: 0xffa040 }),
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

/** Darkens a clone's materials in place (clones each material first: the library's templates share theirs). */
export function tintDark(obj: THREE.Object3D, factor = CINDER_TINT): void {
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const swap = (src: THREE.Material): THREE.Material => {
      const c = src.clone();
      const col = (c as THREE.MeshStandardMaterial).color;
      if (col) col.multiplyScalar(factor);
      return c;
    };
    m.material = Array.isArray(m.material) ? m.material.map(swap) : swap(m.material);
  });
}

async function fitted(lib: ModelLibrary, spec: StructureSpec, id: string, maxScale: number): Promise<THREE.Object3D | null> {
  const t = await lib.template(id);
  if (!t) return null;
  const [w, d] = spec.footprint;
  const obj = ModelLibrary.object(t, fitToBox(t.bounds, { width: w, depth: d }, { maxScale }));
  tintDark(obj);
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
  tintDark(root);
  return root;
}

function cage(spec: StructureSpec): THREE.Object3D {
  const [w, d] = spec.footprint;
  const h = structureHeight(spec);
  const g = new THREE.Group();
  g.name = `cage:${spec.id}`;
  g.add(mesh(new THREE.BoxGeometry(w, 0.2, d), MATS.plank, 0, 0.1, 0));
  g.add(mesh(new THREE.BoxGeometry(w, 0.15, d), MATS.iron, 0, h, 0));
  const bars = Math.max(4, Math.round(w / 0.4));
  const bar = (x: number, z: number) => g.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, h, 6), MATS.iron, x, h / 2, z));
  for (let i = 0; i <= bars; i++) {
    const x = -w / 2 + (w * i) / bars;
    bar(x, -d / 2);
    bar(x, d / 2);
  }
  for (let i = 1; i < bars; i++) {
    const z = -d / 2 + (d * i) / bars;
    bar(-w / 2, z);
    bar(w / 2, z);
  }
  // Chain links hang from the roof ring: a short run of tori.
  for (let k = 0; k < 4; k++) {
    const link = mesh(new THREE.TorusGeometry(0.07, 0.02, 5, 8), MATS.iron, 0, h + 0.15 + k * 0.12, 0);
    link.rotation.y = k % 2 ? Math.PI / 2 : 0;
    g.add(link);
  }
  return own(g);
}

function cairn(spec: StructureSpec): THREE.Object3D {
  const [w, d] = spec.footprint;
  const g = new THREE.Group();
  g.name = `cairn:${spec.id}`;
  const rows = [
    [0.5, 0, 0, 1],
    [0.38, 0.2, 0.1, 0.8],
    [0.3, -0.15, 0.05, 0.6],
    [0.22, 0.05, -0.05, 0.4],
  ] as const;
  let y = 0;
  for (const [r, ox, oz, s] of rows) {
    const m = mesh(new THREE.DodecahedronGeometry(Math.min(w, d) * 0.5 * s), MATS.stone, ox * w, y + r * 0.5, oz * d);
    g.add(m);
    y += r * 0.9;
  }
  return own(g);
}

function runeStone(spec: StructureSpec): THREE.Object3D {
  const [w, d] = spec.footprint;
  const h = structureHeight(spec);
  const g = new THREE.Group();
  g.name = `rune-stone:${spec.id}`;
  g.add(mesh(new THREE.BoxGeometry(w, h, d), MATS.stone, 0, h / 2, 0));
  for (let i = 0; i < 3; i++) g.add(mesh(new THREE.PlaneGeometry(w * 0.5, 0.12), MATS.rune, 0, h * (0.35 + i * 0.18), d / 2 + 0.01));
  return own(g);
}

function shield(spec: StructureSpec): THREE.Object3D {
  const h = structureHeight(spec);
  const g = new THREE.Group();
  g.name = `shield:${spec.id}`;
  g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, h * 0.8, 6), MATS.plank, 0, h * 0.4, 0));
  const disc = mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.08, 14), MATS.cloth, 0, h * 0.85, 0);
  disc.rotation.x = Math.PI / 2;
  g.add(disc);
  return own(g);
}

function trialRing(spec: StructureSpec): THREE.Object3D {
  const r = spec.footprint[0] / 2;
  const g = new THREE.Group();
  g.name = `trial-ring:${spec.id}`;
  const n = 28;
  const stone = new THREE.BoxGeometry(0.9, 0.35, 0.5);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const m = mesh(stone, MATS.stone, Math.cos(a) * r, 0.17, Math.sin(a) * r);
    m.rotation.y = -a;
    g.add(m);
  }
  return g;
}

function ledgerDesk(spec: StructureSpec): THREE.Object3D {
  const [w, d] = spec.footprint;
  const h = structureHeight(spec);
  const g = new THREE.Group();
  g.name = `desk:${spec.id}`;
  g.add(mesh(new THREE.BoxGeometry(w, h, d), MATS.plank, 0, h / 2, 0));
  g.add(mesh(new THREE.BoxGeometry(w * 0.35, 0.05, d * 0.6), MATS.paper, -w * 0.15, h + 0.03, 0));
  return own(g);
}

function blightbloom(spec: StructureSpec): THREE.Object3D {
  const [w, d] = spec.footprint;
  const g = new THREE.Group();
  g.name = `blightbloom:${spec.id}`;
  const stain = mesh(new THREE.CircleGeometry(Math.max(w, d) * 0.6, 14), MATS.stain, 0, 0.04, 0);
  stain.rotation.x = -Math.PI / 2;
  g.add(stain);
  const petal = new THREE.ConeGeometry(0.16, 0.7, 5);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + i;
    const rr = (0.25 + (i % 3) * 0.3) * Math.min(w, d) * 0.5;
    const m = mesh(petal, MATS.bloom, Math.cos(a) * rr, 0.35, Math.sin(a) * rr);
    g.add(m);
  }
  return own(g);
}

function boardedWell(spec: StructureSpec): THREE.Object3D {
  const [w, d] = spec.footprint;
  const h = structureHeight(spec);
  const g = new THREE.Group();
  g.name = `boards:${spec.id}`;
  g.add(mesh(new THREE.BoxGeometry(w, 0.25, d), MATS.plank, 0, h - 0.15, 0));
  for (const s of [-1, 1]) {
    const plank = mesh(new THREE.BoxGeometry(w * 1.1, 0.12, 0.35), MATS.plank, 0, h + 0.05, s * d * 0.18);
    plank.rotation.y = s * 0.5;
    g.add(plank);
  }
  g.add(mesh(new THREE.BoxGeometry(w, h - 0.3, d), MATS.stone, 0, (h - 0.3) / 2, 0));
  return own(g);
}

function marker(spec: StructureSpec): THREE.Object3D {
  const [w, d] = spec.footprint;
  const g = new THREE.Group();
  g.name = `marker:${spec.id}`;
  g.add(mesh(new THREE.DodecahedronGeometry(Math.min(w, d) * 0.3), MATS.stone, 0, 0.25, 0));
  return own(g);
}

const PROCEDURAL: Record<string, (spec: StructureSpec) => THREE.Object3D> = {
  'cinder-cage': cage,
  'cinder-cairn': cairn,
  'cinder-rune-stone': runeStone,
  'cinder-shield': shield,
  'cinder-trial-ring': trialRing,
  'cinder-ledger-desk': ledgerDesk,
  'cinder-blightbloom': blightbloom,
  'cinder-boarded-well': boardedWell,
  'cinder-marker': marker,
};

/** Kinds the art layer draws itself; everything else goes to the Act 1 art (and then to the greybox). */
export const CINDERREACH_ART_KINDS: readonly string[] = [...Object.keys(PROCEDURAL), 'cinder-tent', 'wall', 'tower', 'mill', 'bridge'];

/**
 * Kinds drawn by the generated model of the same id (public/assets/env) when the manifest has it; the scripted piece is the fallback.
 * The marker is a small stone in a loose 4 x 4 box, so it keeps the model's own size; the rest fill their footprint.
 */
export const CINDERREACH_ENV_KINDS: Readonly<Record<string, EnvEntry>> = {
  'cinder-cage': {},
  'cinder-cairn': {},
  'cinder-rune-stone': {},
  'cinder-trial-ring': {},
  'cinder-boarded-well': {},
  'cinder-marker': { mode: 'natural' },
};

/** `envLib` loads the `env/<id>` models (see envModelLibraryFor); it defaults to `lib`, whose loader lacks them, so the scripted art stays. */
export function createCinderreachArt(lib: ModelLibrary, envLib: ModelLibrary = lib): StructureArt {
  const base = createStructureArt(lib);
  const env = createEnvStructureArt(envLib, CINDERREACH_ENV_KINDS);
  return async (spec) => {
    const real = await env(spec);
    if (real) return real;
    const make = PROCEDURAL[spec.kind];
    if (make) return make(spec);
    switch (spec.kind) {
      case 'cinder-tent':
        return fitted(lib, spec, 'hex/tent', 6);
      case 'wall':
        return wallRun(lib, spec);
      case 'tower':
        return fitted(lib, spec, 'hex/building_tower_base_red', 12);
      case 'mill':
        return fitted(lib, spec, 'hex/building_watermill_red', 9);
      case 'bridge':
        return fitted(lib, spec, 'hex/building_bridge_A', 12);
      default: {
        const real = await base(spec);
        if (real && ['house', 'tavern', 'well'].includes(spec.kind)) tintDark(real);
        return real;
      }
    }
  };
}
