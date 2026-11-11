// Scripted stand-ins for the Caldera's dressing ids (Act 5 N1 PR 2; the list and sizes are src/caldera/env/calderaEnvIds.ts).
// Primitive geometry in the glb contract (Y up, metres, base centre on the origin, front +Z), fitted to the target size by
// gen-standins.ts and ingest.mjs exactly like the four Act 2 stand-ins in lib.ts. Seeded: the same run writes the same bytes.
// Emissive parts use the material names the env glow system flickers (Fire, Glow).
import * as THREE from 'three';
import { MeshBuilder, rng, type MaterialSpec } from './lib';

type Built = { builder: MeshBuilder; mats: Record<string, MaterialSpec> };

const M = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx): THREE.Matrix4 =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));

const BOX = new THREE.BoxGeometry(1, 1, 1);
const cyl = (seg = 8): THREE.BufferGeometry => new THREE.CylinderGeometry(0.5, 0.5, 1, seg);
const cone = (seg = 6): THREE.BufferGeometry => new THREE.ConeGeometry(0.5, 1, seg);
const lump = (seed: number, detail = 1): THREE.BufferGeometry => {
  const g = new THREE.IcosahedronGeometry(0.5, detail);
  const r = rng(seed);
  const pos = g.getAttribute('position');
  const v = new THREE.Vector3();
  // Displace each distinct vertex the same way (keyed by its rounded position) so the faceted lump stays closed.
  const seen = new Map<string, number>();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const key = `${v.x.toFixed(4)},${v.y.toFixed(4)},${v.z.toFixed(4)}`;
    let k = seen.get(key);
    if (k === undefined) seen.set(key, (k = 0.78 + r() * 0.4));
    pos.setXYZ(i, v.x * k, v.y * k, v.z * k);
  }
  return g;
};

const WHITE: MaterialSpec = { base: [1, 1, 1] };
const FIRE: MaterialSpec = { base: [1, 1, 1], emissive: { color: [1, 0.36, 0.08], strength: 3 } };
const GLOW: MaterialSpec = { base: [1, 1, 1], emissive: { color: [1, 0.3, 0.05], strength: 2 } };

const BASALT = 0x2e2a28;
const BASALT_LIGHT = 0x46403b;
const IRON = 0x2a2826;
const BRONZE = 0x8a6431;
const TIMBER = 0x5a4029;
const BONE = 0xd9d0bb;
const SOOT = 0x1c1a19;
const EMBER = 0xff6a1a;
const CLOTH_EMBER = 0xc4521c;
const CLOTH_BLACK = 0x221f1e;
const GLASS = 0x15161a;

function lanternPost(seed = 5101): Built {
  const b = new MeshBuilder();
  const r = rng(seed);
  b.add('Iron', cyl(6), M(0, 1.25, 0, 0, 0, 0, 0.14, 2.5, 0.14), IRON, 0.08, r);
  b.add('Iron', BOX, M(0, 2.45, 0.22, 0, 0, 0, 0.08, 0.08, 0.5), IRON, 0.08, r);
  b.add('Iron', BOX, M(0, 2.2, 0.42, 0, 0, 0, 0.3, 0.4, 0.3), SOOT, 0.05, r);
  b.add('Fire', BOX, M(0, 2.18, 0.42, 0, 0, 0, 0.18, 0.26, 0.18), EMBER, 0.1, r);
  b.add('Iron', BOX, M(0, 0.06, 0, 0, 0, 0, 0.4, 0.12, 0.4), BASALT, 0.1, r);
  return { builder: b, mats: { Iron: WHITE, Fire: FIRE } };
}

function basaltBoulder(seed = 5102): Built {
  const b = new MeshBuilder();
  const r = rng(seed);
  b.add('Stone', lump(seed, 1), M(0, 0.95, 0, 0, 0.3, 0, 3.0, 1.9, 2.4), BASALT, 0.18, r);
  b.add('Stone', lump(seed + 1, 0), M(0.9, 0.45, 0.7, 0.4, 0.2, 0, 1.2, 0.9, 1.0), BASALT_LIGHT, 0.18, r);
  return { builder: b, mats: { Stone: WHITE } };
}

function glassShard(seed = 5103): Built {
  const b = new MeshBuilder();
  const r = rng(seed);
  const shards: [number, number, number, number, number][] = [
    [0, 0, 1.1, 0.0, 0.0],
    [0.35, 0.2, 0.8, 0.35, -0.2],
    [-0.35, -0.15, 0.7, -0.4, 0.25],
  ];
  for (const [x, z, h, tx, tz] of shards) b.add('Glass', cone(4), M(x, h / 2, z, tz, 0, -tx, 0.42, h, 0.42), GLASS, 0.15, r);
  b.add('Glow', BOX, M(0, 0.03, 0, 0, 0.5, 0, 0.9, 0.06, 0.12), EMBER, 0.1, r);
  b.add('Glow', BOX, M(0.1, 0.03, 0.1, 0, -0.6, 0, 0.7, 0.06, 0.1), EMBER, 0.1, r);
  return { builder: b, mats: { Glass: WHITE, Glow: GLOW } };
}

function wallModule(seed: number, h: number, d: number, bands: boolean): Built {
  const b = new MeshBuilder();
  const r = rng(seed);
  const W = 6;
  const courses = Math.round(h / 0.75);
  for (let i = 0; i < courses; i++) {
    const y = i * (h - 0.6) / courses;
    const ch = (h - 0.6) / courses;
    const off = i % 2 ? 0.75 : 0;
    for (let x = -W / 2 - off; x < W / 2; x += 1.5) {
      const x0 = Math.max(-W / 2, x);
      const x1 = Math.min(W / 2, x + 1.5);
      if (x1 - x0 < 0.05) continue;
      b.add('Stone', BOX, M((x0 + x1) / 2, y + ch / 2, 0, 0, 0, 0, (x1 - x0) * 0.98, ch * 0.97, d), r() < 0.5 ? BASALT : BASALT_LIGHT, 0.12, r);
    }
  }
  // Merlons (rim wall) or a coping course (foundry wall).
  if (!bands) for (const x of [-2, 0, 2]) b.add('Stone', BOX, M(x, h - 0.3, 0, 0, 0, 0, 1.2, 0.6, d * 0.9), BASALT, 0.12, r);
  else b.add('Stone', BOX, M(0, h - 0.3, 0, 0, 0, 0, W, 0.6, d * 1.05), BASALT_LIGHT, 0.08, r);
  if (bands) {
    for (const y of [1.2, 2.6, 4.0]) b.add('Bronze', BOX, M(0, y, d / 2 + 0.03, 0, 0, 0, W, 0.16, 0.06), BRONZE, 0.1, r);
    for (const x of [-2.2, -0.7, 0.8, 2.3]) b.add('Glow', BOX, M(x, 0.35, d / 2 + 0.03, 0, 0, 0, 0.5, 0.25, 0.05), EMBER, 0.1, r);
  }
  return { builder: b, mats: bands ? { Stone: WHITE, Bronze: WHITE, Glow: GLOW } : { Stone: WHITE } };
}

function banner(seed: number, cloth: number, device: number, pole: number): Built {
  const b = new MeshBuilder();
  const r = rng(seed);
  b.add('Pole', cyl(6), M(0, 3, 0, 0, 0, 0, 0.12, 6, 0.12), pole, 0.06, r);
  b.add('Pole', BOX, M(0, 5.7, 0, 0, 0, 0, 1.2, 0.08, 0.08), pole, 0.06, r);
  b.add('Cloth', BOX, M(0, 4.0, 0.08, 0, 0, 0, 1.1, 3.3, 0.04), cloth, 0.06, r);
  b.add('Cloth', BOX, M(0, 4.3, 0.11, 0, 0, Math.PI / 4, 0.45, 0.45, 0.02), device, 0.06, r);
  b.add('Pole', BOX, M(0, 0.1, 0, 0, 0, 0, 0.5, 0.2, 0.2), BASALT, 0.1, r);
  return { builder: b, mats: { Pole: WHITE, Cloth: WHITE } };
}

function weaponRack(seed = 5108): Built {
  const b = new MeshBuilder();
  const r = rng(seed);
  for (const x of [-1, 1]) {
    b.add('Wood', BOX, M(x, 0.9, 0.15, 0.25, 0, 0, 0.1, 1.85, 0.1), TIMBER, 0.1, r);
    b.add('Wood', BOX, M(x, 0.9, -0.15, -0.25, 0, 0, 0.1, 1.85, 0.1), TIMBER, 0.1, r);
  }
  b.add('Wood', BOX, M(0, 1.5, 0, 0, 0, 0, 2.2, 0.1, 0.1), TIMBER, 0.1, r);
  for (const x of [-0.7, -0.25, 0.2, 0.65]) {
    b.add('Wood', cyl(5), M(x, 0.95, 0.12, 0.12, 0, 0, 0.05, 1.9, 0.05), TIMBER, 0.1, r);
    b.add('Iron', cone(4), M(x, 1.95, 0.24, 0.12, 0, 0, 0.08, 0.2, 0.08), IRON, 0.05, r);
  }
  for (const x of [-0.5, 0.5]) b.add('Iron', cyl(10), M(x, 0.45, 0.3, Math.PI / 2 - 0.15, 0, 0, 0.7, 0.06, 0.7), BRONZE, 0.1, r);
  return { builder: b, mats: { Wood: WHITE, Iron: WHITE } };
}

function gongFrame(seed = 5109): Built {
  const b = new MeshBuilder();
  const r = rng(seed);
  for (const x of [-1.9, 1.9]) {
    b.add('Iron', BOX, M(x, 2.2, 0, 0, 0, 0, 0.22, 4.4, 0.22), IRON, 0.08, r);
    b.add('Iron', BOX, M(x, 0.1, 0, 0, 0, 0, 0.3, 0.2, 1.2), IRON, 0.08, r);
  }
  b.add('Iron', BOX, M(0, 4.45, 0, 0, 0, 0, 4.2, 0.26, 0.26), IRON, 0.08, r);
  b.add('Bronze', cyl(18), M(0, 2.3, 0, Math.PI / 2, 0, 0, 3.0, 0.12, 3.0), BRONZE, 0.12, r);
  b.add('Bronze', cyl(12), M(0, 2.3, 0.05, Math.PI / 2, 0, 0, 0.8, 0.06, 0.8), 0x6e4e26, 0.1, r);
  for (const x of [-0.9, 0.9]) b.add('Iron', BOX, M(x, 4.0, 0, 0, 0, 0, 0.05, 0.7, 0.05), IRON, 0.05, r);
  return { builder: b, mats: { Iron: WHITE, Bronze: WHITE } };
}

/** A frame round an opening on the +Z face: posts either side, a lintel, and a back wall behind the opening. */
function portal(seed: number, W: number, D: number, H: number, ow: number, oh: number, post: number, lintel: number, back: number, leaves: boolean): Built {
  const b = new MeshBuilder();
  const r = rng(seed);
  const side = (W - ow) / 2;
  for (const s of [-1, 1]) b.add('Frame', BOX, M(s * (ow / 2 + side / 2), H / 2, 0, 0, 0, 0, side, H, D), post, 0.12, r);
  b.add('Frame', BOX, M(0, oh + (H - oh) / 2, 0, 0, 0, 0, ow, H - oh, D), lintel, 0.12, r);
  // The dark of the way in (the door anchor stands in front of it).
  b.add('Dark', BOX, M(0, oh / 2, -D / 2 + 0.1, 0, 0, 0, ow, oh, 0.2), back, 0, r);
  if (leaves) for (const s of [-1, 1]) b.add('Bronze', BOX, M(s * (ow / 2 + 0.05), oh / 2, D / 2 + ow / 4, 0, 0, 0, 0.12, oh * 0.95, ow / 2), BRONZE, 0.1, r);
  return { builder: b, mats: leaves ? { Frame: WHITE, Dark: WHITE, Bronze: WHITE } : { Frame: WHITE, Dark: WHITE } };
}

function stairhead(seed = 5112): Built {
  const b = new MeshBuilder();
  const r = rng(seed);
  const W = 7, H = 4.5, t = 0.8, ow = 3.2, oh = 3.2;
  b.add('Stone', BOX, M(0, H / 2, -W / 2 + t / 2, 0, 0, 0, W, H, t), BASALT, 0.12, r);
  for (const s of [-1, 1]) b.add('Stone', BOX, M(s * (W / 2 - t / 2), H / 2, 0, 0, 0, 0, t, H, W), BASALT, 0.12, r);
  const side = (W - ow) / 2;
  for (const s of [-1, 1]) b.add('Stone', BOX, M(s * (ow / 2 + side / 2), H / 2, W / 2 - t / 2, 0, 0, 0, side, H, t), BASALT_LIGHT, 0.12, r);
  b.add('Stone', BOX, M(0, oh + (H - oh) / 2, W / 2 - t / 2, 0, 0, 0, ow, H - oh, t), BASALT_LIGHT, 0.12, r);
  b.add('Stone', BOX, M(0, H - 0.2, 0, 0, 0, 0, W + 0.3, 0.4, W + 0.3), BASALT, 0.1, r);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add('Bronze', BOX, M(sx * (W / 2), H, sz * (W / 2), 0, 0, 0, 0.6, 0.3, 0.6), BRONZE, 0.1, r);
  // The stair going down: dark steps inside the archway.
  for (let i = 0; i < 4; i++) b.add('Dark', BOX, M(0, 0.05, W / 2 - 1.2 - i * 1.1, 0, 0, 0, ow, 0.1, 1.0), 0x0d0b0a, 0, r);
  b.add('Glow', BOX, M(0, oh + 0.15, W / 2 + 0.02, 0, 0, 0, ow + 0.4, 0.1, 0.05), EMBER, 0.1, r);
  return { builder: b, mats: { Stone: WHITE, Bronze: WHITE, Dark: WHITE, Glow: GLOW } };
}

function rib(seed = 5113): Built {
  const b = new MeshBuilder();
  const r = rng(seed);
  // A bent tusk: tapering segments leaning further over as they rise (toward -X, the curve's inside faces +X).
  let x = 0, y = 0, a = 0;
  for (let i = 0; i < 7; i++) {
    const len = 0.85;
    const w = 0.55 - i * 0.06;
    const cx = x - Math.sin(a) * len / 2;
    const cy = y + Math.cos(a) * len / 2;
    b.add('Bone', cyl(6), M(cx, cy, 0, 0, 0, a, w, len * 1.05, w), i > 4 ? SOOT : BONE, 0.08, r);
    x -= Math.sin(a) * len;
    y += Math.cos(a) * len;
    a += 0.11;
  }
  return { builder: b, mats: { Bone: WHITE } };
}

function skull(seed = 5114): Built {
  const b = new MeshBuilder();
  const r = rng(seed);
  b.add('Bone', lump(seed, 1), M(0, 1.2, -1.2, 0, 0, 0, 3.2, 2.4, 2.6), BONE, 0.08, r);
  b.add('Bone', BOX, M(0, 0.7, 1.0, 0.08, 0, 0, 1.8, 1.0, 3.0), BONE, 0.08, r);
  b.add('Bone', BOX, M(0, 0.25, 1.3, 0, 0, 0, 1.6, 0.5, 2.6), 0xc8bea6, 0.08, r);
  for (const s of [-1, 1]) {
    b.add('Bone', cone(6), M(s * 1.1, 2.0, -2.0, -1.0, 0, s * 0.5, 0.5, 2.2, 0.5), SOOT, 0.08, r);
    b.add('Dark', BOX, M(s * 0.8, 1.6, -0.1, 0, 0, 0, 0.6, 0.5, 0.3), 0x0d0b0a, 0, r);
  }
  return { builder: b, mats: { Bone: WHITE, Dark: WHITE } };
}

function nest(seed = 5115): Built {
  const b = new MeshBuilder();
  const r = rng(seed);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + r() * 0.2;
    b.add('Rock', lump(seed + i, 0), M(Math.sin(a) * 2.5, 0.45, Math.cos(a) * 2.5, r(), r() * 3, 0, 1.4, 0.9 + r() * 0.4, 1.2), i % 3 ? GLASS : BASALT, 0.15, r);
  }
  b.add('Ash', cyl(14), M(0, 0.06, 0, 0, 0, 0, 4.2, 0.12, 4.2), 0x6c6660, 0.05, r);
  for (let i = 0; i < 4; i++) b.add('Shell', BOX, M(r() * 1.6 - 0.8, 0.25, r() * 1.6 - 0.8, r(), r() * 3, r(), 0.6, 0.35, 0.08), BONE, 0.1, r);
  return { builder: b, mats: { Rock: WHITE, Ash: WHITE, Shell: WHITE } };
}

function warTent(seed = 5116): Built {
  const b = new MeshBuilder();
  const r = rng(seed);
  const W = 5, D = 6, H = 3.2;
  // A ridge tent: two sloped canvas sides meeting at the ridge, gable ends front and back with the door on +Z.
  const slope = Math.atan2(H, W / 2);
  const len = Math.hypot(W / 2, H);
  for (const s of [-1, 1]) b.add('Canvas', BOX, M((s * W) / 4, H / 2, 0, 0, 0, -s * (Math.PI / 2 - slope), len, 0.06, D), CLOTH_BLACK, 0.06, r);
  b.add('Stripe', BOX, M(0, H - 0.05, 0, 0, 0, 0, 0.5, 0.1, D + 0.05), BRONZE, 0.06, r);
  const gable = new THREE.BufferGeometry();
  gable.setAttribute('position', new THREE.Float32BufferAttribute([-W / 2, 0, 0, W / 2, 0, 0, 0, H, 0, W / 2, 0, 0, -W / 2, 0, 0, 0, H, 0], 3));
  b.add('Canvas', gable, M(0, 0, -D / 2), CLOTH_BLACK, 0.06, r);
  b.add('Canvas', gable, M(0, 0, D / 2), 0x2c2826, 0.06, r);
  b.add('Dark', BOX, M(0, 0.9, D / 2 + 0.03, 0, 0, 0, 1.1, 1.8, 0.04), 0x0d0b0a, 0, r);
  for (const s of [-1, 1]) for (const z of [-D / 2, D / 2]) b.add('Pole', cyl(5), M(s * (W / 2 + 0.25), 0.15, z, 0, 0, 0, 0.08, 0.3, 0.08), IRON, 0.05, r);
  return { builder: b, mats: { Canvas: WHITE, Stripe: WHITE, Dark: WHITE, Pole: WHITE } };
}

export const CALDERA_STANDIN_BUILDERS: Readonly<Record<string, () => Built>> = {
  'caldera-lantern-post-a': () => lanternPost(),
  'basalt-boulder-a': () => basaltBoulder(),
  'lava-glass-shard-a': () => glassShard(),
  'rim-wall-a': () => wallModule(5104, 4, 1.6, false),
  'foundry-wall-a': () => wallModule(5105, 5, 2, true),
  'rim-banner-a': () => banner(5106, CLOTH_EMBER, SOOT, IRON),
  'warhost-banner-a': () => banner(5107, CLOTH_BLACK, BRONZE, IRON),
  'weapon-rack-a': () => weaponRack(),
  'forge-gong-frame-a': () => gongFrame(),
  'cooling-hall-portal-a': () => portal(5110, 8, 2.5, 6.5, 3.2, 3.8, BASALT, BRONZE, 0x0d0b0a, true),
  'tunnel-portal-a': () => portal(5111, 6, 2, 4.5, 2.8, 3.1, TIMBER, TIMBER, 0x0d0b0a, false),
  'foundry-stairhead-a': () => stairhead(),
  'wyrm-rib-a': () => rib(),
  'wyrm-skull-a': () => skull(),
  'scorched-nest-a': () => nest(),
  'warhost-tent-a': () => warTent(),
};

export const CALDERA_STANDIN_IDS = Object.keys(CALDERA_STANDIN_BUILDERS);
