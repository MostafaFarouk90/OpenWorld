// The art layer for the Dragonspine's structures: a composed `StructureArt` (the Act 1 art for house, gate, waystone, pole and the
// rest) behind a `BuildingLookup`. Hexagon walls, towers and the hall take a snow tint; everything the pack lacks is greybox from
// stacked primitives (the Act 2 way). Procedural pieces sit in the structure holder's frame, so nothing samples raw world position.
import * as THREE from 'three';
import { explicitFit, fitToBox, tileLine } from '../assets/swap/fit';
import { ModelLibrary } from '../assets/swap/ModelLibrary';
import { structureHeight } from '../region/greybox';
import type { StructureSpec } from '../region/layoutTypes';
import { createStructureArt, type StructureArt } from '../region/structureArt';
import { tintObject } from '../oldsmoke/oldsmokeArt';
import { createEnvStructureArt, type EnvEntry } from '../env/envStructureArt';

/** Multiplies a Hexagon model's colours: cold and pale, as if snow lay on it. */
export const SNOW_TINT = new THREE.Color(0.9, 0.96, 1.05);

const mats = new Map<number, THREE.MeshLambertMaterial>();
const mat = (color: number): THREE.MeshLambertMaterial => {
  let m = mats.get(color);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, flatShading: true });
    mats.set(color, m);
  }
  return m;
};

type Prim =
  | { t: 'box'; w: number; h: number; d: number; x: number; y: number; z: number; c: number }
  | { t: 'cyl'; r0: number; r1: number; h: number; x: number; y: number; z: number; c: number }
  | { t: 'cone'; r: number; h: number; x: number; y: number; z: number; c: number };

const box = (w: number, h: number, d: number, x: number, y: number, z: number, c: number): Prim => ({ t: 'box', w, h, d, x, y, z, c });
const cyl = (r0: number, r1: number, h: number, x: number, y: number, z: number, c: number): Prim => ({ t: 'cyl', r0, r1, h, x, y, z, c });
const cone = (r: number, h: number, x: number, y: number, z: number, c: number): Prim => ({ t: 'cone', r, h, x, y, z, c });

const STONE = 0x7a7770;
const WOOD = 0x5b4129;
const SNOW = 0xe8eef2;
const ASH = 0x2e2b29;
const HIDE = 0x8a6a4a;
const BONE = 0xd8d0bc;
/** Black glass (the Wyrm's Hearth): a glossy standard material, no texture, nothing sampled from world position. */
const GLASS = 0x0e0f13;
const GOLD = 0xc9a23a;
const ROPE = 0x8b7a55;
const IRON = 0x3c3d40;
const FLAME = 0xff7a1a;
const EMBER = 0xffc040;
/** Colours drawn unlit (fire and embers glow). */
const GLOW: ReadonlySet<number> = new Set([FLAME, EMBER]);
let glassMat: THREE.MeshStandardMaterial | null = null;
const glowMats = new Map<number, THREE.MeshBasicMaterial>();
const matFor = (color: number): THREE.Material => {
  if (color === GLASS) return (glassMat ??= new THREE.MeshStandardMaterial({ color: GLASS, roughness: 0.12, metalness: 0.35, flatShading: true }));
  if (GLOW.has(color)) {
    let m = glowMats.get(color);
    if (!m) glowMats.set(color, (m = new THREE.MeshBasicMaterial({ color })));
    return m;
  }
  return mat(color);
};

/** The rope lattice of a net section: verticals and horizontals across its width and height. */
const netLattice = (w: number, h: number): Prim[] => {
  const nx = Math.max(2, Math.round(w / 0.8));
  const nz = Math.max(2, Math.round(h / 0.6));
  return [
    ...Array.from({ length: nx + 1 }, (_, i) => box(0.05, h, 0.05, -w / 2 + (w * i) / nx, h / 2, 0, ROPE)),
    ...Array.from({ length: nz + 1 }, (_, i) => box(w, 0.05, 0.05, 0, (h * i) / nz, 0, ROPE)),
  ];
};

/** Each kind as primitives in the structure's own frame: (w, d, h) are its footprint and height. */
const PROCEDURAL: Record<string, (w: number, d: number, h: number) => Prim[]> = {
  'dragonspine-stable': (w, d, h) => [box(w, 0.3, d, 0, 0.15, 0, WOOD), box(w, h - 1, 0.4, 0, h / 2, d / 2 - 0.2, WOOD), box(0.4, h - 1, d, -w / 2 + 0.2, h / 2, 0, WOOD), box(0.4, h - 1, d, w / 2 - 0.2, h / 2, 0, WOOD), box(w + 0.6, 0.35, d + 0.6, 0, h - 0.4, 0, SNOW)],
  'dragonspine-shed': (w, d, h) => [box(w, h - 1.2, d, 0, (h - 1.2) / 2, 0, WOOD), box(w + 0.8, 0.5, d + 0.8, 0, h - 0.9, 0, SNOW), box(w * 0.5, h - 2, 0.3, 0, (h - 2) / 2, -d / 2 - 0.05, 0x2f2a26)],
  'dragonspine-fire-pit': (w) => [...Array.from({ length: 8 }, (_, i) => box(0.6, 0.45, 0.6, Math.cos((i * Math.PI) / 4) * (w / 2 - 0.3), 0.22, Math.sin((i * Math.PI) / 4) * (w / 2 - 0.3), STONE)), cyl(w / 2 - 0.5, w / 2 - 0.5, 0.1, 0, 0.05, 0, ASH)],
  'dragonspine-rack': (w, _d, h) => [cyl(0.08, 0.08, h, -w / 2 + 0.2, h / 2, 0, WOOD), cyl(0.08, 0.08, h, w / 2 - 0.2, h / 2, 0, WOOD), box(w, 0.1, 0.1, 0, h - 0.2, 0, WOOD), box(0.7, 0.9, 0.08, -w / 4, h - 0.8, 0, HIDE), box(0.7, 0.9, 0.08, w / 4, h - 0.8, 0, HIDE)],
  'dragonspine-drying-rack': (w, _d, h) => [cyl(0.07, 0.07, h, -w / 2 + 0.2, h / 2, 0, WOOD), cyl(0.07, 0.07, h, w / 2 - 0.2, h / 2, 0, WOOD), box(w, 0.08, 0.08, 0, h - 0.15, 0, WOOD), box(0.35, 0.8, 0.05, -1, h - 0.7, 0, 0x9a6a5a), box(0.35, 0.8, 0.05, 0.4, h - 0.7, 0, 0x9a6a5a)],
  'dragonspine-trophy-wall': (w, d, h) => [box(w, h, d, 0, h / 2, 0, WOOD), box(w + 0.4, 0.3, d + 0.6, 0, h + 0.1, 0, SNOW), cone(0.2, 0.7, -w * 0.4, h * 0.6, -d / 2 - 0.1, BONE), box(1.1, 0.12, 0.12, -w * 0.2, h * 0.55, -d / 2 - 0.1, 0x555555), box(0.6, 0.8, 0.05, 0, h * 0.6, -d / 2 - 0.05, 0xd8c9a0), box(0.9, 0.7, 0.05, w * 0.2, h * 0.6, -d / 2 - 0.05, 0xb59a6a), box(0.7, 0.5, 0.05, w * 0.4, h * 0.55, -d / 2 - 0.05, 0xc2b08a)],
  'dragonspine-woodpile': (w, d, h) => Array.from({ length: Math.max(1, Math.floor(w / 0.7)) }, (_, i) => box(0.6, h * (i % 2 ? 0.8 : 1), d, -w / 2 + 0.35 + i * 0.7, (h * (i % 2 ? 0.8 : 1)) / 2, 0, WOOD)),
  'dragonspine-leanto': (w, d, h) => [box(0.25, h, 0.25, -w / 2 + 0.2, h / 2, d / 2 - 0.2, WOOD), box(0.25, h, 0.25, w / 2 - 0.2, h / 2, d / 2 - 0.2, WOOD), box(w, 0.25, d + 0.4, 0, h - 0.3, 0, SNOW), box(w, h - 0.4, 0.3, 0, (h - 0.4) / 2, d / 2 - 0.1, WOOD)],
  'dragonspine-straw': (w, d) => [box(w, 0.2, d, 0, 0.1, 0, 0xc2a85a)],
  'dragonspine-sack': () => [cyl(0.35, 0.5, 0.8, 0, 0.4, 0, 0xa8946a)],
  'dragonspine-tracks': (w) => Array.from({ length: Math.floor(w / 0.8) }, (_, i) => box(0.35, 0.04, 0.5, -w / 2 + 0.4 + i * 0.8, 0.02, (i % 2 ? 0.3 : -0.3), 0x3a3834)),
  'dragonspine-shell': () => [cone(0.3, 0.3, 0, 0.15, 0, 0xe6e2d4), cone(0.2, 0.2, 0.3, 0.1, 0.1, 0xe6e2d4)],
  'dragonspine-nest': (w) => [cyl(w / 2, w / 2 - 0.3, 0.5, 0, 0.25, 0, 0x6a5238), cyl(w / 2 - 0.4, w / 2 - 0.6, 0.2, 0, 0.5, 0, 0x8a7a5a), cone(0.18, 0.28, 0, 0.64, 0, 0xe0dccb)],
  'dragonspine-pad': (w, d) => [box(w, 0.1, d, 0, 0.05, 0, 0x8d8a84), box(w - 2, 0.12, d - 2, 0, 0.07, 0, 0x9c9992)],
  'dragonspine-carving': (w, d, h) => [box(w, h, d, 0, h / 2, 0, STONE), box(w * 0.7, 0.9, 0.06, 0, h * 0.6, -d / 2 - 0.03, 0x4c4a46), cone(w * 0.6, 0.5, 0, h + 0.2, 0, SNOW)],
  'dragonspine-mark': (w, d, h) => [box(w, h, d, 0, h / 2, 0, 0x6a6862), box(w * 0.5, 0.5, 0.06, 0, h * 0.6, -d / 2 - 0.03, 0x45433f)],
  'dragonspine-bench': (w, d) => [box(w, 0.1, d, 0, 0.5, 0, WOOD), box(0.12, 0.5, d, -w / 2 + 0.2, 0.25, 0, WOOD), box(0.12, 0.5, d, w / 2 - 0.2, 0.25, 0, WOOD)],
  // ---- the summit (PR 2)
  'dragonspine-gate-pillar': (w, d, h) => [box(w, h, d, 0, h / 2, 0, STONE), box(w + 0.4, 0.5, d + 0.4, 0, h - 0.25, 0, 0x8a877f), cone(w * 0.6, 0.8, 0, h + 0.4, 0, SNOW)],
  'dragonspine-gate-arch': (w, d, h) => [box(w, 1.4, d, 0, h - 0.7, 0, 0x6e6b64), box(w * 0.4, 1, d * 0.9, 0, h + 0.5, 0, 0x6e6b64), box(w + 0.4, 0.3, d + 0.4, 0, h + 1.1, 0, SNOW)],
  'dragonspine-hearth-basin': (w) => [...Array.from({ length: 16 }, (_, i) => box(w * 0.2, 0.5, 0.8, Math.cos((i * Math.PI) / 8) * (w / 2 - 0.4), 0.25, Math.sin((i * Math.PI) / 8) * (w / 2 - 0.4), GLASS)), cyl(w / 2 - 1, w / 2 - 1, 0.08, 0, 0.04, 0, ASH)],
  'dragonspine-glass-tier': (w, d, h) => [box(w, h, d, 0, h / 2, 0, GLASS), box(w * 0.98, 0.04, d * 0.3, 0, h + 0.02, -d * 0.3, 0x2a2c33)],
  'dragonspine-keeper-stone': (w, d, h) => [box(w, h, d, 0, h / 2, 0, 0x55524c), box(w * 0.6, h * 0.5, 0.06, 0, h * 0.55, -d / 2 - 0.03, EMBER), cone(w * 0.5, 0.5, 0, h + 0.25, 0, SNOW)],
  'dragonspine-hoard': (w, d) => [cyl(w * 0.35, w * 0.45, 0.9, -w * 0.15, 0.45, 0, GOLD), cyl(w * 0.25, w * 0.3, 0.6, w * 0.25, 0.3, d * 0.15, GOLD), box(0.3, 0.12, 1.4, w * 0.3, 0.7, -d * 0.2, IRON), cyl(0.12, 0.12, 2.2, -w * 0.35, 0.15, d * 0.3, IRON)],
  'dragonspine-hoard-axe': (w) => [box(w, 0.08, 0.1, 0, 0.12, 0, WOOD), box(0.3, 0.06, 0.45, w / 2 - 0.15, 0.14, 0, 0xa8acb0)],
  'dragonspine-glide-marker': (w, _d, h) => [cone(w / 2, h * 0.6, 0, h * 0.3, 0, STONE), cyl(0.05, 0.05, h, 0, h / 2 + 0.4, 0, WOOD), box(0.5, 0.35, 0.03, 0.25, h, 0, 0x9a3a2a)],
  'dragonspine-horn': (w) => [cone(0.12, w, 0, 0.12, 0, BONE), cyl(0.02, 0.02, w * 0.8, 0, 0.1, 0.15, HIDE)],
  'dragonspine-scale': (w, d) => [box(w, 0.08, d, 0, 0.06, 0, 0x5a3328), box(w * 0.7, 0.04, d * 0.6, 0, 0.12, 0, 0xc0602a)],
  'dragonspine-rig-tent': (w, d, h) => [cone(Math.max(w, d) * 0.6, h, 0, h / 2, 0, 0x8c7a5c), box(w * 0.3, h * 0.6, 0.05, 0, h * 0.3, -d / 2, 0x2f2a26)],
  'dragonspine-rig-table': (w, d, h) => [box(w, 0.08, d, 0, h, 0, WOOD), box(0.08, h, 0.08, -w / 2 + 0.1, h / 2, -d / 2 + 0.1, WOOD), box(0.08, h, 0.08, w / 2 - 0.1, h / 2, d / 2 - 0.1, WOOD), box(0.7, 0.02, 0.5, -0.4, h + 0.05, 0, 0xd8c9a0), box(0.15, 0.06, 0.15, 0.5, h + 0.07, 0.1, 0x8a1a1a)],
  'dragonspine-rope-coil': (w, _d, h) => [cyl(w / 2, w / 2, h, 0, h / 2, 0, ROPE), cyl(w / 4, w / 4, h + 0.02, 0, h / 2, 0, 0x4a3e2c)],
  'dragonspine-net-rack': (w, _d, h) => [cyl(0.06, 0.06, h, -w / 2 + 0.1, h / 2, 0, WOOD), cyl(0.06, 0.06, h, w / 2 - 0.1, h / 2, 0, WOOD), ...netLattice(w - 0.2, h - 0.2)],
  'dragonspine-net': (w, _d, h) => [box(w, 0.12, 0.12, 0, h, 0, ROPE), ...netLattice(w, h)],
  'dragonspine-aerie-gate': (w, d, h) => [box(w, h, d, 0, h / 2, 0, 0x4a3a2a), ...Array.from({ length: 5 }, (_, i) => box(w + 0.1, 0.15, d * 0.95, 0, (h * (i + 1)) / 6, 0, IRON))],
  'dragonspine-keep': (w, d, h) => [box(w, h, d, 0, h / 2, 0, STONE), box(w + 0.8, 0.6, d + 0.8, 0, h, 0, SNOW), box(w * 0.2, h * 0.3, 0.3, 0, h * 0.15, -d / 2 - 0.1, 0x2a2622)],
  'dragonspine-winch': (w, d, h) => [box(w, h * 0.6, d, 0, h * 0.3, 0, WOOD), cyl(0.3, 0.3, w, 0, h * 0.75, 0, ROPE), box(0.08, 0.6, 0.08, w / 2, h, 0, IRON)],
  'dragonspine-hawk-cage': (w, d, h) => [box(w, 0.1, d, 0, 0.05, 0, WOOD), ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => box(0.06, h, 0.06, (sx * w) / 2, h / 2, (sz * d) / 2, IRON))), box(w, 0.08, d, 0, h, 0, IRON), cone(0.25, 0.4, 0, 0.45, 0, 0x9a8a72)],
  'dragonspine-chain-post': (w, _d, h) => [cyl(w / 2, w / 2, h, 0, h / 2, 0, WOOD), cyl(w * 0.3, w * 0.3, 0.12, 0, h * 0.7, 0, IRON), box(0.1, 0.1, 1.6, 0, 0.3, -0.9, IRON)],
  'dragonspine-feed-trough': (w, d, h) => [box(w, h, d, 0, h / 2, 0, WOOD), box(w * 0.9, 0.05, d * 0.7, 0, h, 0, 0x6a2a22)],
  'dragonspine-wind-banner': (_w, _d, h) => [cyl(0.06, 0.08, h, 0, h / 2, 0, WOOD), box(0.04, 0.6, 1.6, 0, h - 0.5, 0.8, 0xb03a2a)],
  'dragonspine-landing-marker': (w, d) => [...Array.from({ length: 8 }, (_, i) => box(0.35, 0.15, 0.35, Math.cos((i * Math.PI) / 4) * (w / 2 - 0.2), 0.07, Math.sin((i * Math.PI) / 4) * (d / 2 - 0.2), 0xd8d4c8))],
  'dragonspine-fire-lit': (w, _d, h) => [cyl(w / 2 - 0.4, w / 2 - 0.2, 0.25, 0, 0.12, 0, EMBER), cone(w * 0.28, h, 0, h / 2 + 0.2, 0, FLAME), cone(w * 0.16, h * 0.7, w * 0.15, h * 0.35 + 0.2, 0.1, EMBER), box(w * 0.7, 0.12, 0.12, 0, 0.25, 0, WOOD)],
  'dragonspine-banner-burned': (_w, _d, h) => [cyl(0.07, 0.09, h, 0, h / 2, 0, 0x1a1816), box(0.04, 0.5, 0.6, 0, h - 0.4, 0.3, 0x2a2420), cyl(0.7, 0.8, 0.06, 0, 0.03, 0, ASH)],
  'dragonspine-drake-roost': (w, d, h) => [cyl(Math.min(w, d) * 0.42, Math.min(w, d) * 0.36, h * 0.6, 0, h * 0.3, 0, 0x6a5238), cyl(Math.min(w, d) * 0.3, Math.min(w, d) * 0.32, h * 0.2, 0, h * 0.6, 0, 0x8a7a5a), box(0.15, 0.15, 1.4, w * 0.3, h * 0.65, 0, IRON)],
  'dragonspine-cave-mouth': (w, d, h) => [
    box(w, h, d, 0, h / 2, 0, 0x4e4c48),
    box(w * 0.4, h * 0.6, 0.4, 0, h * 0.3, -d / 2 - 0.1, 0x070707),
    cone(w * 0.5, 1.4, -w * 0.2, h + 0.5, 0, SNOW),
    cone(w * 0.35, 1.0, w * 0.25, h + 0.3, 0, SNOW),
  ],
};

function build(prims: Prim[]): THREE.Group {
  const g = new THREE.Group();
  for (const p of prims) {
    const geo = p.t === 'box' ? new THREE.BoxGeometry(p.w, p.h, p.d) : p.t === 'cyl' ? new THREE.CylinderGeometry(p.r0, p.r1, p.h, 7) : new THREE.ConeGeometry(p.r, p.h, 6);
    const m = new THREE.Mesh(geo, matFor(p.c));
    m.position.set(p.x, p.y, p.z);
    m.userData.ownGeometry = true;
    g.add(m);
  }
  return g;
}

async function fitted(lib: ModelLibrary, spec: StructureSpec, id: string, maxScale: number, tint: number | THREE.Color): Promise<THREE.Object3D | null> {
  const t = await lib.template(id);
  if (!t) return null;
  const [w, d] = spec.footprint;
  const obj = ModelLibrary.object(t, fitToBox(t.bounds, { width: w, depth: d }, { maxScale }));
  tintObject(obj, tint);
  return obj;
}

/** A run of `hex/wall_straight` along the footprint's long side, snow-tinted. */
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
  tintObject(root, SNOW_TINT);
  return root;
}

/** Kinds the art layer draws itself; everything else goes to the Act 1 art (and then to the greybox). */
export const DRAGONSPINE_ART_KINDS: readonly string[] = [...Object.keys(PROCEDURAL), 'dragonspine-hall', 'wall', 'tower'];

/**
 * Kinds drawn by a generated model (public/assets/env) when the manifest has it; the primitives are the fallback. The kind names differ
 * from the model ids for five of them. The trophy wall (12 m) is the 4 m model repeated three times; the carving stone keeps its
 * proportions at the spec height; the sled shed (18 x 10) is the 8 x 5 model stretched within the 15% rule, a little over the box.
 * Not drawn by models: the m28 and bend cairns and hawk perches (built-in `rock` columns that follow the slope), the rockfall (an
 * interior blocker).
 */
export const DRAGONSPINE_ENV_KINDS: Readonly<Record<string, EnvEntry>> = {
  'dragonspine-trophy-wall': { mode: 'tile', crossUniform: true },
  'dragonspine-leanto': { id: 'dragonspine-lean-to' },
  'dragonspine-nest': { id: 'dragonspine-hawk-nest' },
  'dragonspine-carving': { id: 'dragonspine-carving-stone', mode: 'height' },
  // The lodge puts the shed's open front (the sled depot) at -z.
  'dragonspine-shed': { id: 'dragonspine-sled-shed', frontNegZ: true },
};

/** `envLib` loads the `env/<id>` models (see envModelLibraryFor); it defaults to `lib`, whose loader lacks them, so the primitives stay. */
export function createDragonspineArt(lib: ModelLibrary, envLib: ModelLibrary = lib): StructureArt {
  const base = createStructureArt(lib);
  const env = createEnvStructureArt(envLib, DRAGONSPINE_ENV_KINDS);
  return async (spec) => {
    const real = await env(spec);
    if (real) return real;
    if (spec.kind === 'dragonspine-keep') {
      const keep = await fitted(lib, spec, 'hex/building_castle_red', 16, SNOW_TINT);
      if (keep) return keep;
    }
    const make = PROCEDURAL[spec.kind];
    if (make) {
      const g = build(make(spec.footprint[0], spec.footprint[1], structureHeight(spec)));
      g.name = `${spec.kind}:${spec.id}`;
      // The lit fire pit throws light (M34's midpoint).
      if (spec.kind === 'dragonspine-fire-lit') {
        const light = new THREE.PointLight(0xffa050, 6, 18, 2);
        light.position.set(0, structureHeight(spec), 0);
        g.add(light);
      }
      return g;
    }
    switch (spec.kind) {
      case 'dragonspine-hall':
        return fitted(lib, spec, 'hex/building_castle_red', 16, SNOW_TINT);
      case 'wall':
        return wallRun(lib, spec);
      case 'tower':
        return fitted(lib, spec, 'hex/building_tower_base_red', 12, SNOW_TINT);
      default:
        return base(spec);
    }
  };
}
