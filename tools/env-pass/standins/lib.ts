// Scripted stand-in models for the four Act 2 industry ids that still have no artist file: slag-heap, ore-pile, mine-cart,
// smelter-chimney (plans/env-pass/followups-plan.md item 3). Seeded and deterministic: the same run writes the same bytes.
//
//   npx vite-node tools/env-pass/standins/gen-standins.ts [outDir]        (default public/assets/env-standin); this file is the library
//
// The pieces are built from three.js geometry (flat-shaded lumps, boxes and cylinders, vertex-colour variation), written as glb
// with a small hand-written glb writer, then run through tools/env-pass/ingest.mjs into a scratch folder (fit to src/env/targets.json, pivot at the
// base centre) and only the glb files are copied out: the scratch manifest is dropped, so the stand-ins stay OUTSIDE
// public/assets/env/manifest.json. That keeps ENV_IDS false for these ids and a real glb dropped into public/assets/env still wins
// (src/env/resolve.ts checks the stand-in table after the runtime copies).
import * as THREE from 'three';

export const STANDIN_IDS = ['slag-heap', 'ore-pile', 'mine-cart', 'smelter-chimney'] as const;
export type StandInId = (typeof STANDIN_IDS)[number];

// ---- seeded randomness -----------------------------------------------------------------------------------------------------
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash3(x: number, y: number, z: number, seed: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 2147483647) ^ Math.imul(seed | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise in 0..1. */
export function vnoise(x: number, y: number, z: number, seed: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const s = (t: number): number => t * t * (3 - 2 * t);
  const u = s(fx), v = s(fy), w = s(fz);
  const l = (a: number, b: number, t: number): number => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number): number => hash3(ix + dx, iy + dy, iz + dz, seed);
  return l(
    l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v),
    l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v),
    w,
  );
}

// ---- mesh builder ----------------------------------------------------------------------------------------------------------
export interface MaterialSpec {
  /** Linear-light base colour factor [r, g, b]; vertex colours multiply it. */
  base: [number, number, number];
  /** Emissive colour (linear) and KHR_materials_emissive_strength. */
  emissive?: { color: [number, number, number]; strength: number };
}

interface Prim {
  pos: number[];
  col: number[];
}

/** Collects flat-shaded triangles per material; normals are computed at the end, after the final fit. */
export class MeshBuilder {
  readonly prims = new Map<string, Prim>();

  private prim(mat: string): Prim {
    let p = this.prims.get(mat);
    if (!p) this.prims.set(mat, (p = { pos: [], col: [] }));
    return p;
  }

  /**
   * Adds a geometry under `mat`, transformed by `m`. Each triangle takes `colour` (sRGB hex) with a brightness jitter of +-`jitter`
   * (per face, seeded), times `shade(world position)` when given (a soot gradient).
   */
  add(mat: string, geom: THREE.BufferGeometry, m: THREE.Matrix4, colour: number, jitter: number, rand: () => number, shade?: (p: THREE.Vector3) => number): void {
    const g = geom.index ? geom.toNonIndexed() : geom.clone();
    g.applyMatrix4(m);
    const pos = g.getAttribute('position');
    const p = this.prim(mat);
    const c = new THREE.Color(colour);
    const v = new THREE.Vector3();
    for (let i = 0; i + 2 < pos.count; i += 3) {
      const k = 1 + (rand() * 2 - 1) * jitter;
      for (let j = 0; j < 3; j++) {
        v.fromBufferAttribute(pos, i + j);
        p.pos.push(v.x, v.y, v.z);
        const s = k * (shade ? shade(v) : 1);
        p.col.push(c.r * s, c.g * s, c.b * s);
      }
    }
    g.dispose();
  }

  /** Adds raw triangles (a flat list of x,y,z) with one colour. */
  addTriangles(mat: string, tris: number[], colour: number): void {
    const p = this.prim(mat);
    const c = new THREE.Color(colour);
    for (let i = 0; i < tris.length; i += 3) {
      p.pos.push(tris[i], tris[i + 1], tris[i + 2]);
      p.col.push(c.r, c.g, c.b);
    }
  }

  bounds(): THREE.Box3 {
    const b = new THREE.Box3();
    const v = new THREE.Vector3();
    for (const p of this.prims.values()) for (let i = 0; i < p.pos.length; i += 3) b.expandByPoint(v.set(p.pos[i], p.pos[i + 1], p.pos[i + 2]));
    return b;
  }

  triangles(): number {
    let n = 0;
    for (const p of this.prims.values()) n += p.pos.length / 9;
    return n;
  }

  /** Scale each axis so the box is exactly w x h x d, the footprint centred on x, z = 0 and the base on y = 0. */
  fit(w: number, d: number, h: number): void {
    const b = this.bounds();
    const sx = w / (b.max.x - b.min.x), sy = h / (b.max.y - b.min.y), sz = d / (b.max.z - b.min.z);
    const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
    for (const p of this.prims.values())
      for (let i = 0; i < p.pos.length; i += 3) {
        p.pos[i] = (p.pos[i] - cx) * sx;
        p.pos[i + 1] = (p.pos[i + 1] - b.min.y) * sy;
        p.pos[i + 2] = (p.pos[i + 2] - cz) * sz;
      }
  }
}

/** Binary glTF 2.0 for the builder's primitives (one mesh, one node, one buffer). Written by hand so the tool needs no glTF library. */
export function toGlb(name: string, b: MeshBuilder, mats: Record<string, MaterialSpec>): Uint8Array {
  const chunks: Uint8Array[] = [];
  let offset = 0;
  const bufferViews: unknown[] = [];
  const accessors: unknown[] = [];
  const addAccessor = (data: Float32Array | Uint32Array, type: 'SCALAR' | 'VEC3', target: number, minmax = false): number => {
    const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.byteLength, target });
    chunks.push(bytes);
    offset += bytes.byteLength;
    const comps = type === 'VEC3' ? 3 : 1;
    const acc: Record<string, unknown> = { bufferView: bufferViews.length - 1, componentType: data instanceof Uint32Array ? 5125 : 5126, count: data.length / comps, type };
    if (minmax) {
      const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < data.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], data[i + k]); hi[k] = Math.max(hi[k], data[i + k]); }
      acc.min = lo;
      acc.max = hi;
    }
    accessors.push(acc);
    return accessors.length - 1;
  };
  const materials: unknown[] = [];
  const primitives: unknown[] = [];
  for (const [key, p] of b.prims) {
    const spec = mats[key];
    if (!spec) throw new Error(`${name}: no material spec for "${key}"`);
    const n = p.pos.length / 3;
    const nor = new Float32Array(p.pos.length);
    const a = new THREE.Vector3(), bb = new THREE.Vector3(), c = new THREE.Vector3(), nv = new THREE.Vector3();
    for (let i = 0; i < n; i += 3) {
      a.fromArray(p.pos, i * 3);
      bb.fromArray(p.pos, i * 3 + 3);
      c.fromArray(p.pos, i * 3 + 6);
      nv.crossVectors(bb.sub(a), c.sub(a)).normalize();
      for (let j = 0; j < 3; j++) nv.toArray(nor, (i + j) * 3);
    }
    const index = new Uint32Array(n);
    for (let i = 0; i < n; i++) index[i] = i;
    const material: Record<string, unknown> = { name: key, pbrMetallicRoughness: { baseColorFactor: [...spec.base, 1], metallicFactor: 0, roughnessFactor: 1 } };
    if (spec.emissive) {
      material.emissiveFactor = spec.emissive.color;
      material.extensions = { KHR_materials_emissive_strength: { emissiveStrength: spec.emissive.strength } };
    }
    materials.push(material);
    primitives.push({
      attributes: {
        POSITION: addAccessor(new Float32Array(p.pos), 'VEC3', 34962, true),
        NORMAL: addAccessor(nor, 'VEC3', 34962),
        COLOR_0: addAccessor(new Float32Array(p.col), 'VEC3', 34962),
      },
      indices: addAccessor(index, 'SCALAR', 34963),
      material: materials.length - 1,
    });
  }
  const json = {
    asset: { version: '2.0', generator: 'tools/env-pass/standins/gen-standins.ts' },
    extensionsUsed: Object.values(mats).some((m) => m.emissive) ? ['KHR_materials_emissive_strength'] : [],
    scene: 0,
    scenes: [{ name, nodes: [0] }],
    nodes: [{ name, mesh: 0 }],
    meshes: [{ name, primitives }],
    materials,
    accessors,
    bufferViews,
    buffers: [{ byteLength: offset }],
  };
  const pad = (len: number): number => (4 - (len % 4)) % 4;
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonPad = pad(jsonBytes.length);
  const binPad = pad(offset);
  const total = 12 + 8 + jsonBytes.length + jsonPad + 8 + offset + binPad;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, jsonBytes.length + jsonPad, true);
  dv.setUint32(16, 0x4e4f534a, true);
  out.set(jsonBytes, 20);
  out.fill(0x20, 20 + jsonBytes.length, 20 + jsonBytes.length + jsonPad);
  let o = 20 + jsonBytes.length + jsonPad;
  dv.setUint32(o, offset + binPad, true);
  dv.setUint32(o + 4, 0x004e4942, true);
  o += 8;
  for (const ch of chunks) {
    out.set(ch, o);
    o += ch.byteLength;
  }
  return out;
}

const lin = (hex: number): [number, number, number] => {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
};
const M = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx): THREE.Matrix4 =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));

// ---- slag heap -------------------------------------------------------------------------------------------------------------
const SLAG_GLOW = 0xe04a0e;

interface Heap {
  tris: number[];
  /** Surface height at (x, z) by walking the real triangles, or -Infinity outside the heap. */
  surfaceY(x: number, z: number): number;
  radius(theta: number): number;
}

/** The mound: a polar grid whose height falls from a lumpy crown to nothing at a wavering rim. */
function slagMound(seed: number): Heap {
  const R = 2.5, H = 2.05, RINGS = 9, SECT = 24;
  const radius = (th: number): number => R * (0.84 + 0.16 * vnoise(Math.cos(th) * 1.6 + 4, Math.sin(th) * 1.6 + 4, 0, seed));
  const rand = rng(seed + 1);
  const vert = (ring: number, s: number): THREE.Vector3 => {
    if (ring === 0) return new THREE.Vector3(0, H * (0.92 + 0.1 * vnoise(0.3, 0.3, 1, seed)), 0);
    const th = ((s % SECT) / SECT) * Math.PI * 2;
    const u = ring / RINGS;
    const r = radius(th) * u * (1 + (rand() - 0.5) * 0.05);
    const x = Math.cos(th) * r, z = Math.sin(th) * r;
    const crown = Math.pow(Math.max(0, 1 - u * u), 0.85) * H;
    const lump = (vnoise(x * 1.5, 0, z * 1.5, seed + 2) - 0.45) * 0.7 + (vnoise(x * 3.7, 1, z * 3.7, seed + 3) - 0.5) * 0.28;
    return new THREE.Vector3(x, ring === RINGS ? 0 : Math.max(0.04, crown + lump * Math.min(1, u * 2.2) * (1 - u * 0.5)), z);
  };
  const grid: THREE.Vector3[][] = [];
  for (let k = 0; k <= RINGS; k++) {
    grid.push([]);
    for (let s = 0; s < SECT; s++) grid[k].push(k === 0 ? vert(0, 0) : vert(k, s));
  }
  const tris: number[] = [];
  const push = (...v: THREE.Vector3[]): void => v.forEach((p) => tris.push(p.x, p.y, p.z));
  for (let s = 0; s < SECT; s++) {
    const s2 = (s + 1) % SECT;
    push(grid[0][0], grid[1][s2], grid[1][s]);
    for (let k = 1; k < RINGS; k++) {
      push(grid[k][s], grid[k][s2], grid[k + 1][s]);
      push(grid[k][s2], grid[k + 1][s2], grid[k + 1][s]);
    }
  }
  const surfaceY = (x: number, z: number): number => {
    for (let i = 0; i < tris.length; i += 9) {
      const ax = tris[i], az = tris[i + 2], bx = tris[i + 3], bz = tris[i + 5], cx = tris[i + 6], cz = tris[i + 8];
      const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(d) < 1e-9) continue;
      const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d;
      const l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d;
      const l3 = 1 - l1 - l2;
      if (l1 >= -1e-6 && l2 >= -1e-6 && l3 >= -1e-6) return l1 * tris[i + 1] + l2 * tris[i + 4] + l3 * tris[i + 7];
    }
    return -Infinity;
  };
  return { tris, surfaceY, radius };
}

export function buildSlagHeap(seed = 1101): { builder: MeshBuilder; mats: Record<string, MaterialSpec> } {
  const b = new MeshBuilder();
  const rand = rng(seed);
  const heap = slagMound(seed);
  // Mound faces: dark glassy slag with rust-brown and bluish patches (the colour follows low-frequency noise per face).
  const faceRand = rng(seed + 9);
  for (let i = 0; i < heap.tris.length; i += 9) {
    const cx = (heap.tris[i] + heap.tris[i + 3] + heap.tris[i + 6]) / 3;
    const cy = (heap.tris[i + 1] + heap.tris[i + 4] + heap.tris[i + 7]) / 3;
    const cz = (heap.tris[i + 2] + heap.tris[i + 5] + heap.tris[i + 8]) / 3;
    const n = vnoise(cx * 0.9, cy * 0.9, cz * 0.9, seed + 4);
    const colour = n > 0.66 ? 0x5e4332 : n < 0.28 ? 0x3d4146 : 0x4a423c;
    b.add('Slag', slagTri(heap.tris, i), new THREE.Matrix4(), colour, 0.22, faceRand);
  }
  // Glowing cracks: ribbons laid on the real surface, running from the rim toward the crown.
  const crackSpec: Array<[number, number, number]> = [
    [0.4, 0.95, 0.9],
    [2.3, 0.97, -1.1],
    [4.2, 0.9, 0.7],
  ];
  const crackPts: Array<[number, number]> = [];
  for (const [th0, u0, bend] of crackSpec) {
    const pts: Array<[number, number]> = [];
    const N = 13;
    for (let k = 0; k <= N; k++) {
      const t = k / N;
      const th = th0 + bend * t * 0.55 + (vnoise(k * 0.9, th0, 7, seed + 5) - 0.5) * 0.34;
      const u = u0 * (1 - t * 0.78);
      const r = heap.radius(th) * u;
      pts.push([Math.cos(th) * r, Math.sin(th) * r]);
    }
    pts.forEach((p) => crackPts.push(p));
    const left: THREE.Vector3[] = [];
    const right: THREE.Vector3[] = [];
    for (let k = 0; k <= N; k++) {
      const [x, z] = pts[k];
      const [nx, nz] = pts[Math.min(N, k + 1)];
      const [px, pz] = pts[Math.max(0, k - 1)];
      let dx = nx - px, dz = nz - pz;
      const len = Math.hypot(dx, dz) || 1;
      dx /= len;
      dz /= len;
      const t = k / N;
      const w = 0.05 + 0.1 * Math.sin(Math.PI * Math.min(1, t * 1.15)) * (0.6 + 0.4 * rand());
      const lx = x - dz * w, lz = z + dx * w, rx = x + dz * w, rz = z - dx * w;
      const ly = Math.max(heap.surfaceY(lx, lz), heap.surfaceY(x, z)), ry = Math.max(heap.surfaceY(rx, rz), heap.surfaceY(x, z));
      left.push(new THREE.Vector3(lx, ly + 0.035, lz));
      right.push(new THREE.Vector3(rx, ry + 0.035, rz));
    }
    const strip: number[] = [];
    const pushV = (...v: THREE.Vector3[]): void => v.forEach((p) => strip.push(p.x, p.y, p.z));
    for (let k = 0; k < N; k++) {
      pushV(left[k], left[k + 1], right[k]);
      pushV(right[k], left[k + 1], right[k + 1]);
    }
    b.addTriangles('Glow', strip, SLAG_GLOW);
  }
  // Clinker: angular grey-brown chunks half sunk into the surface, kept off the cracks.
  let placed = 0;
  for (let guard = 0; placed < 14 && guard < 200; guard++) {
    const th = rand() * Math.PI * 2;
    const u = 0.15 + rand() * 0.8;
    const r = heap.radius(th) * u;
    const x = Math.cos(th) * r, z = Math.sin(th) * r;
    if (crackPts.some(([cx, cz]) => Math.hypot(cx - x, cz - z) < 0.42)) continue;
    const y = heap.surfaceY(x, z);
    if (y === -Infinity) continue;
    const s = 0.26 + rand() * 0.3;
    b.add('Clinker', new THREE.IcosahedronGeometry(1, 0), M(x, y + s * 0.15, z, rand() * 3, rand() * 6, rand() * 3, s * (0.8 + rand() * 0.6), s * (0.55 + rand() * 0.4), s * (0.8 + rand() * 0.6)), rand() > 0.5 ? 0x625a52 : 0x4e4a46, 0.2, rand);
    placed++;
  }
  return {
    builder: b,
    mats: {
      Slag: { base: [1, 1, 1] },
      Clinker: { base: [1, 1, 1] },
      Glow: { base: lin(0x2a1408), emissive: { color: lin(SLAG_GLOW), strength: 1.5 } },
    },
  };
}

function slagTri(tris: number[], i: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(tris.slice(i, i + 9), 3));
  return g;
}

// ---- ore pile --------------------------------------------------------------------------------------------------------------
export function buildOrePile(seed = 2202): { builder: MeshBuilder; mats: Record<string, MaterialSpec> } {
  const b = new MeshBuilder();
  const rand = rng(seed);
  // Lumps pile up in a cone: the radius falls with height, so the rim lumps sit low and the crown lumps sit on top.
  const lumps: Array<{ x: number; y: number; z: number; s: number }> = [];
  for (let i = 0; i < 34; i++) {
    const th = rand() * Math.PI * 2;
    const u = Math.sqrt(rand());
    const r = u * 0.82;
    const top = Math.max(0.1, 0.62 * (1 - Math.pow(u, 1.6)));
    const s = 0.13 + rand() * 0.11 + (1 - u) * 0.05;
    lumps.push({ x: Math.cos(th) * r, y: top * (0.55 + rand() * 0.45), z: Math.sin(th) * r * 0.95, s });
  }
  lumps.forEach((l, i) => {
    const rust = i % 3 !== 0;
    b.add(rust ? 'Rust' : 'Grey', new THREE.DodecahedronGeometry(1, 0), M(l.x, l.y + l.s * 0.6, l.z, rand() * 3, rand() * 6, rand() * 3, l.s * (0.9 + rand() * 0.4), l.s * (0.7 + rand() * 0.3), l.s * (0.9 + rand() * 0.4)), rust ? (rand() > 0.5 ? 0x8a4c2e : 0x70402a) : 0x6c6965, 0.22, rand);
  });
  // Copper flecks: small bright-green-grey and copper chips on the upper lumps.
  for (let i = 0; i < 9; i++) {
    const l = lumps[Math.floor(rand() * lumps.length)];
    const a = rand() * Math.PI * 2;
    b.add('Copper', new THREE.OctahedronGeometry(1, 0), M(l.x + Math.cos(a) * l.s * 0.6, l.y + l.s * (0.9 + rand() * 0.5), l.z + Math.sin(a) * l.s * 0.6, rand() * 3, rand() * 6, 0, 0.05 + rand() * 0.035, 0.035, 0.05 + rand() * 0.035), rand() > 0.4 ? 0xc0713c : 0x5f9a82, 0.15, rand);
  }
  return { builder: b, mats: { Rust: { base: [1, 1, 1] }, Grey: { base: [1, 1, 1] }, Copper: { base: [1, 1, 1] } } };
}

// ---- mine cart -------------------------------------------------------------------------------------------------------------
export function buildMineCart(seed = 3303): { builder: MeshBuilder; mats: Record<string, MaterialSpec> } {
  const b = new MeshBuilder();
  const rand = rng(seed);
  // x runs along the rails (1.8 m), z across them (1.0 m). The body is a tapered open box, wider at the rim.
  const bodyH = 0.5, y0 = 0.3;
  const rimHalfX = 0.84, rimHalfZ = 0.44, baseHalfX = 0.7, baseHalfZ = 0.34;
  const quad = (a: number[], bq: number[], c: number[], d: number[]): number[] => [...a, ...bq, ...c, ...a, ...c, ...d];
  const corners = (y: number, hx: number, hz: number): number[][] => [[-hx, y, -hz], [hx, y, -hz], [hx, y, hz], [-hx, y, hz]];
  const lo = corners(y0, baseHalfX, baseHalfZ), hi = corners(y0 + bodyH, rimHalfX, rimHalfZ);
  const tris: number[] = [];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    tris.push(...quad(lo[i], lo[j], hi[j], hi[i])); // outside, wound outward for a box wound about +y
  }
  tris.push(...quad(lo[0], lo[3], lo[2], lo[1])); // underside
  // The wound order above is not guaranteed outward for every face; flip any triangle whose normal points toward the centre.
  const fixed: number[] = [];
  for (let i = 0; i < tris.length; i += 9) {
    const a = new THREE.Vector3().fromArray(tris, i), bb = new THREE.Vector3().fromArray(tris, i + 3), c = new THREE.Vector3().fromArray(tris, i + 6);
    const n = new THREE.Vector3().crossVectors(bb.clone().sub(a), c.clone().sub(a));
    const ctr = a.clone().add(bb).add(c).divideScalar(3).sub(new THREE.Vector3(0, y0 + bodyH * 0.45, 0));
    if (n.dot(ctr) < 0) fixed.push(...tris.slice(i, i + 3), ...tris.slice(i + 6, i + 9), ...tris.slice(i + 3, i + 6));
    else fixed.push(...tris.slice(i, i + 9));
  }
  b.addTriangles('Body', fixed, 0x6b4a36);
  // Rim: a darker iron band round the top edge (four thin boxes), and rivets along it.
  const rim = (cx: number, cz: number, sx: number, sz: number): void =>
    b.add('Iron', new THREE.BoxGeometry(1, 1, 1), M(cx, y0 + bodyH + 0.015, cz, 0, 0, 0, sx, 0.07, sz), 0x34312f, 0.12, rand);
  rim(0, rimHalfZ, rimHalfX * 2 + 0.08, 0.08);
  rim(0, -rimHalfZ, rimHalfX * 2 + 0.08, 0.08);
  rim(rimHalfX, 0, 0.08, rimHalfZ * 2);
  rim(-rimHalfX, 0, 0.08, rimHalfZ * 2);
  for (let i = 0; i < 7; i++) {
    const x = -0.66 + i * 0.22;
    for (const sgn of [-1, 1]) b.add('Iron', new THREE.OctahedronGeometry(0.03, 0), M(x, y0 + bodyH - 0.07, sgn * (rimHalfZ - 0.045), 0, 0, 0), 0x4a4644, 0.1, rand);
  }
  // Two vertical iron straps over the sides.
  for (const sx of [-0.42, 0.42])
    for (const sgn of [-1, 1]) b.add('Iron', new THREE.BoxGeometry(1, 1, 1), M(sx, y0 + bodyH / 2, sgn * (baseHalfZ + (rimHalfZ - baseHalfZ) * 0.5 + 0.008), 0, 0, 0, 0.09, bodyH, 0.035), 0x34312f, 0.1, rand);
  // Chassis: two axle beams and a coupling hook at each end.
  for (const x of [-0.55, 0.55]) {
    b.add('Iron', new THREE.BoxGeometry(1, 1, 1), M(x, 0.17, 0, 0, 0, 0, 0.07, 0.07, 0.96), 0x2e2c2b, 0.1, rand);
  }
  b.add('Iron', new THREE.BoxGeometry(1, 1, 1), M(0, 0.26, 0, 0, 0, 0, 1.5, 0.06, 0.12), 0x2e2c2b, 0.1, rand);
  for (const sgn of [-1, 1]) b.add('Iron', new THREE.BoxGeometry(1, 1, 1), M(sgn * 0.93, 0.34, 0, 0, 0, 0, 0.14, 0.05, 0.05), 0x34312f, 0.1, rand);
  // Flanged wheels: a wide wheel and a larger thin flange on the inner face, axis along z.
  for (const x of [-0.55, 0.55])
    for (const sgn of [-1, 1]) {
      b.add('Iron', new THREE.CylinderGeometry(0.17, 0.17, 0.07, 10), M(x, 0.17, sgn * 0.5, Math.PI / 2, 0, 0), 0x3a3735, 0.12, rand);
      b.add('Iron', new THREE.CylinderGeometry(0.2, 0.2, 0.02, 10), M(x, 0.17, sgn * (0.5 - 0.045), Math.PI / 2, 0, 0), 0x2c2a29, 0.1, rand);
    }
  // The heaped ore: lumps filling the body and rising above the rim (the Knight looks down into the cart).
  const topY = y0 + bodyH;
  for (let i = 0; i < 18; i++) {
    const x = (rand() * 2 - 1) * 0.68, z = (rand() * 2 - 1) * 0.3;
    const dome = 1 - Math.pow(x / 0.78, 2) * 0.6 - Math.pow(z / 0.4, 2) * 0.5;
    const s = 0.1 + rand() * 0.08;
    b.add('Ore', new THREE.DodecahedronGeometry(1, 0), M(x, topY - 0.03 + dome * 0.2 + rand() * 0.04, z, rand() * 3, rand() * 6, rand() * 3, s, s * 0.75, s), rand() > 0.35 ? 0x7a4a30 : 0x66625e, 0.22, rand);
  }
  return {
    builder: b,
    mats: { Body: { base: [1, 1, 1] }, Iron: { base: [1, 1, 1] }, Ore: { base: [1, 1, 1] } },
  };
}

// ---- smelter chimney -------------------------------------------------------------------------------------------------------
export function buildChimney(seed = 4404): { builder: MeshBuilder; mats: Record<string, MaterialSpec> } {
  const b = new MeshBuilder();
  const rand = rng(seed);
  const H = 9, courses = 20, ch = 8.2 / courses;
  const half = (y: number): number => 0.9 - (y / 8.2) * 0.3; // the shaft narrows from 1.8 to 1.2 m across
  // Soot: stone darkens with height and round the flue mouth at the foot.
  const soot = (p: THREE.Vector3): number => Math.max(0.42, 1.05 - (p.y / H) * 0.62 - (p.z > 0.6 && p.y < 2.4 ? 0.22 : 0));
  for (let i = 0; i < courses; i++) {
    const y = i * ch;
    const h = half(y + ch / 2) + 0.03 * (rand() - 0.5);
    b.add('Stone', new THREE.BoxGeometry(1, 1, 1), M((rand() - 0.5) * 0.03, y + ch / 2, (rand() - 0.5) * 0.03, 0, (rand() - 0.5) * 0.06, 0, h * 2, ch * 0.98, h * 2), i % 2 ? 0x6a6560 : 0x77716a, 0.1, rand, soot);
  }
  // Three iron bands, a hand wider than the shaft.
  for (const y of [2.4, 5.1, 7.5]) b.add('Iron', new THREE.BoxGeometry(1, 1, 1), M(0, y, 0, 0, 0, 0, (half(y) + 0.05) * 2, 0.14, (half(y) + 0.05) * 2), 0x2f2d2c, 0.1, rand);
  // Flared brick cap: three corbelled courses stepping out, then a short crown wall round the open flue.
  const capY = 8.2;
  const steps: Array<[number, number, number]> = [[0.64, 0.2, 0], [0.76, 0.2, 0.2], [0.9, 0.2, 0.4]];
  for (const [hh, hgt, dy] of steps) b.add('Brick', new THREE.BoxGeometry(1, 1, 1), M(0, capY + dy + hgt / 2, 0, 0, 0, 0, hh * 2, hgt, hh * 2), 0x8a4a3a, 0.12, rand, (p) => Math.max(0.5, 1.0 - (p.y - 8) * 0.12));
  const wallH = 0.38, inner = 0.34, outer = 0.9;
  const crown = capY + 0.6;
  b.add('Brick', new THREE.BoxGeometry(1, 1, 1), M(0, crown + wallH / 2, (outer + inner) / 2, 0, 0, 0, outer * 2, wallH, outer - inner), 0x7d4436, 0.12, rand);
  b.add('Brick', new THREE.BoxGeometry(1, 1, 1), M(0, crown + wallH / 2, -(outer + inner) / 2, 0, 0, 0, outer * 2, wallH, outer - inner), 0x7d4436, 0.12, rand);
  b.add('Brick', new THREE.BoxGeometry(1, 1, 1), M((outer + inner) / 2, crown + wallH / 2, 0, 0, 0, 0, outer - inner, wallH, inner * 2), 0x7d4436, 0.12, rand);
  b.add('Brick', new THREE.BoxGeometry(1, 1, 1), M(-(outer + inner) / 2, crown + wallH / 2, 0, 0, 0, 0, outer - inner, wallH, inner * 2), 0x7d4436, 0.12, rand);
  // The flue's black mouth, seen from above the rim.
  b.add('Flue', new THREE.BoxGeometry(1, 1, 1), M(0, crown + 0.02, 0, 0, 0, 0, inner * 2, 0.04, inner * 2), 0x080706, 0, rand);
  // Arched flue opening at the foot of the front (+z) face: a dark recess with a half-round head and a brick surround.
  const fz = half(0.6) + 0.002;
  const archW = 0.62, archH = 0.82;
  b.add('Brick', new THREE.BoxGeometry(1, 1, 1), M(0, (archH + 0.3) / 2, fz - 0.02, 0, 0, 0, archW + 0.28, archH + 0.3, 0.08), 0x6e4638, 0.1, rand);
  b.add('Flue', new THREE.BoxGeometry(1, 1, 1), M(0, archH / 2 - 0.04, fz + 0.025, 0, 0, 0, archW, archH - 0.2, 0.04), 0x080706, 0, rand);
  b.add('Flue', new THREE.CylinderGeometry(archW / 2, archW / 2, 0.04, 10, 1, false, 0, Math.PI), M(0, archH - 0.14, fz + 0.025, Math.PI / 2, 0, Math.PI / 2), 0x080706, 0, rand);
  return {
    builder: b,
    mats: { Stone: { base: [1, 1, 1] }, Iron: { base: [1, 1, 1] }, Brick: { base: [1, 1, 1] }, Flue: { base: [1, 1, 1] } },
  };
}

export const BUILDERS: Record<StandInId, (seed?: number) => { builder: MeshBuilder; mats: Record<string, MaterialSpec> }> = {
  'slag-heap': buildSlagHeap,
  'ore-pile': buildOrePile,
  'mine-cart': buildMineCart,
  'smelter-chimney': buildChimney,
};

