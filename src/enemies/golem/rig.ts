import * as THREE from 'three';
import { GOLEM_DIMS, type GolemParams } from './params';
import { createCrackMaterial, type CrackUniforms } from './shader';

export interface GolemRig {
  readonly owner: THREE.Group;
  readonly hips: THREE.Group;
  readonly torso: THREE.Group;
  readonly head: THREE.Group;
  readonly shoulderR: THREE.Group;
  readonly shoulderL: THREE.Group;
  readonly hipR: THREE.Group;
  readonly hipL: THREE.Group;
  readonly kneeR: THREE.Group;
  readonly kneeL: THREE.Group;
  readonly core: THREE.Mesh;
  readonly coreMaterial: THREE.MeshStandardMaterial;
  readonly stoneMaterial: THREE.MeshStandardMaterial;
  readonly crack: CrackUniforms;
  readonly meshes: THREE.InstancedMesh[];
  readonly geometries: THREE.BufferGeometry[];
}

/** mulberry32: a small deterministic PRNG. */
export function makeRng(seed: number): () => number {
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
  let h = (Math.round(x * 1000) * 73856093) ^ (Math.round(y * 1000) * 19349663) ^ (Math.round(z * 1000) * 83492791) ^ seed;
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/** A lumpy unit rock: an icosahedron whose vertices are displaced by a position hash (seams stay closed). */
export function makeRockGeometry(seed: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(0.5, 1);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 0.82 + 0.36 * hash3(x, y, z, seed);
    p.setXYZ(i, x * k, y * k, z * k);
  }
  g.computeVertexNormals();
  return g;
}

interface Piece {
  rock?: boolean;
  pos: [number, number, number];
  size: [number, number, number];
}

const TINT_VARIATION = 0.18;

function addPieces(
  parent: THREE.Object3D,
  name: string,
  geo: THREE.BufferGeometry,
  material: THREE.Material,
  pieces: Piece[],
  rng: () => number,
  out: THREE.InstancedMesh[],
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geo, material, pieces.length);
  mesh.name = name;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const pos = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const c = new THREE.Color();
  pieces.forEach((p, i) => {
    const j = (s: number) => (rng() - 0.5) * 2 * s;
    e.set(j(0.08), j(0.25), j(0.08));
    q.setFromEuler(e);
    pos.set(p.pos[0] + j(0.02), p.pos[1] + j(0.02), p.pos[2] + j(0.02));
    const f = 1 + j(0.07);
    sc.set(p.size[0] * f, p.size[1] * (1 + j(0.05)), p.size[2] * f);
    m.compose(pos, q, sc);
    mesh.setMatrixAt(i, m);
    const v = 1 - TINT_VARIATION * rng();
    mesh.setColorAt(i, c.setRGB(v, v, v));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  out.push(mesh);
  parent.add(mesh);
  return mesh;
}

const group = (name: string, parent: THREE.Object3D, x = 0, y = 0, z = 0): THREE.Group => {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(x, y, z);
  parent.add(g);
  return g;
};

/**
 * Builds the golem from instanced rock/box pieces under pivot groups (hips, torso, head, shoulders, hips and knees).
 * Deterministic for a `seed`. Free with `disposeGolemRig`.
 */
export function buildGolemRig(params: GolemParams): GolemRig {
  const D = GOLEM_DIMS;
  const rng = makeRng(params.seed);
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const rockGeo = makeRockGeometry(params.seed | 0);
  const { material: stone, uniforms: crack } = createCrackMaterial({ tint: params.tint, crackColor: params.emissive });
  const emissive = new THREE.Color(params.emissive);
  const coreMat = new THREE.MeshStandardMaterial({
    color: emissive.clone().multiplyScalar(0.25),
    emissive,
    emissiveIntensity: 1.5,
    roughness: 0.4,
  });
  coreMat.name = 'golem-core';
  const coreGeo = new THREE.IcosahedronGeometry(D.core.radius, 1);
  const meshes: THREE.InstancedMesh[] = [];

  const owner = new THREE.Group();
  owner.name = 'golem';
  owner.scale.setScalar(params.scale);
  const hips = group('golem-hips', owner, 0, D.hipHeight);
  const torso = group('golem-torso', hips);
  const head = group('golem-head', torso, 0, D.headY);
  const shoulderR = group('golem-armR', torso, D.shoulderX, D.shoulderY);
  const shoulderL = group('golem-armL', torso, -D.shoulderX, D.shoulderY);
  const hipR = group('golem-legR', hips, D.hipX, 0);
  const hipL = group('golem-legL', hips, -D.hipX, 0);
  const kneeR = group('golem-kneeR', hipR, 0, -D.thigh);
  const kneeL = group('golem-kneeL', hipL, 0, -D.thigh);

  const box = (pos: Piece['pos'], size: Piece['size']): Piece => ({ pos, size });
  const rock = (pos: Piece['pos'], size: Piece['size']): Piece => ({ rock: true, pos, size });
  // One InstancedMesh per rigid part; box and rock pieces of a part are separate meshes, so split them.
  const part = (name: string, parent: THREE.Object3D, pieces: Piece[]) => {
    const boxes = pieces.filter((p) => !p.rock);
    const rocks = pieces.filter((p) => p.rock);
    if (boxes.length) addPieces(parent, `${name}-wall`, boxGeo, stone, boxes, rng, meshes);
    if (rocks.length) addPieces(parent, `${name}-rock`, rockGeo, stone, rocks, rng, meshes);
  };

  part('torso', torso, [
    box([0, 0.85, 0], [1.3, 1.0, 0.9]),
    box([0, 0.3, 0], [0.95, 0.5, 0.75]),
    rock([0, 1.2, 0.05], [1.5, 0.6, 1.0]),
    rock([0.88, 1.3, 0], [0.6, 0.55, 0.6]),
    rock([-0.88, 1.3, 0], [0.6, 0.55, 0.6]),
    rock([0.38, 1.05, 0.42], [0.3, 0.3, 0.25]),
    rock([-0.38, 1.05, 0.42], [0.3, 0.3, 0.25]),
    rock([0, 0.55, 0.42], [0.45, 0.25, 0.2]),
  ]);
  part('head', head, [
    box([0, 0.3, 0], [0.55, 0.5, 0.5]),
    box([0, 0.5, -0.22], [0.62, 0.14, 0.2]),
    rock([0, 0.08, -0.12], [0.4, 0.2, 0.3]),
  ]);
  const arm = (parent: THREE.Object3D, side: 'R' | 'L') =>
    part(`arm${side}`, parent, [
      box([0, -0.35, 0], [0.45, 0.7, 0.45]),
      box([0, -0.95, 0], [0.5, 0.6, 0.5]),
      rock([0, -1.45, 0], [0.7, 0.65, 0.7]),
      rock([0, -0.05, 0], [0.5, 0.4, 0.5]),
    ]);
  arm(shoulderR, 'R');
  arm(shoulderL, 'L');
  const leg = (hip: THREE.Object3D, knee: THREE.Object3D, side: 'R' | 'L') => {
    part(`thigh${side}`, hip, [box([0, -0.3, 0], [0.5, 0.65, 0.5]), rock([0, 0, 0], [0.55, 0.4, 0.55])]);
    part(`shin${side}`, knee, [
      box([0, -0.28, 0], [0.45, 0.6, 0.45]),
      box([0, -0.5, -0.1], [0.55, 0.2, 0.8]),
      rock([0, 0, 0], [0.4, 0.35, 0.4]),
    ]);
  };
  leg(hipR, kneeR, 'R');
  leg(hipL, kneeL, 'L');

  const core = new THREE.Mesh(coreGeo, coreMat);
  core.name = 'golem-core';
  core.position.set(D.core.x, D.core.y, D.core.z);
  torso.add(core);

  return {
    owner, hips, torso, head, shoulderR, shoulderL, hipR, hipL, kneeR, kneeL,
    core, coreMaterial: coreMat, stoneMaterial: stone, crack, meshes,
    geometries: [boxGeo, rockGeo, coreGeo],
  };
}

/** Frees the geometries and materials of a rig and detaches it. */
export function disposeGolemRig(rig: GolemRig): void {
  for (const g of rig.geometries) g.dispose();
  for (const m of rig.meshes) m.dispose();
  rig.stoneMaterial.dispose();
  rig.coreMaterial.dispose();
  rig.owner.removeFromParent();
}

/**
 * The calmed golem's cairn: a static pile of the same rock pieces, about 1.2 m high at scale 1, cold stone with
 * no emissive. Free with `disposeCairn`.
 */
export function buildCairn(params: GolemParams): THREE.Object3D {
  const rng = makeRng((params.seed ^ 0x5eed) >>> 0);
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const rockGeo = makeRockGeometry(params.seed | 0);
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(params.tint).multiplyScalar(0.8),
    roughness: 0.95,
    metalness: 0,
    emissive: 0x000000,
  });
  mat.name = 'golem-cairn';
  const root = new THREE.Group();
  root.name = 'golem-cairn';
  root.scale.setScalar(params.scale);
  const tiers: Array<{ y: number; r: number; n: number; s: number }> = [
    { y: 0.18, r: 0.55, n: 6, s: 0.55 },
    { y: 0.55, r: 0.3, n: 4, s: 0.5 },
    { y: 0.9, r: 0.1, n: 2, s: 0.4 },
  ];
  const rocks: Piece[] = [];
  for (const t of tiers) {
    for (let i = 0; i < t.n; i++) {
      const a = (i / t.n) * Math.PI * 2 + rng();
      rocks.push({ rock: true, pos: [Math.cos(a) * t.r, t.y, Math.sin(a) * t.r], size: [t.s, t.s * 0.8, t.s] });
    }
  }
  rocks.push({ rock: true, pos: [0, 1.0, 0], size: [0.4, 0.4, 0.4] });
  const slabs: Piece[] = [{ pos: [0.05, 0.12, 0], size: [1.0, 0.24, 0.9] }, { pos: [0, 1.12, 0], size: [0.2, 0.16, 0.2] }];
  const meshes: THREE.InstancedMesh[] = [];
  addPieces(root, 'cairn-rock', rockGeo, mat, rocks, rng, meshes);
  addPieces(root, 'cairn-wall', boxGeo, mat, slabs, rng, meshes);
  return root;
}

/** Frees a cairn built by `buildCairn`. */
export function disposeCairn(cairn: THREE.Object3D): void {
  const mats = new Set<THREE.Material>();
  const geos = new Set<THREE.BufferGeometry>();
  cairn.traverse((o) => {
    const m = o as THREE.InstancedMesh;
    if (m.isMesh) {
      geos.add(m.geometry);
      for (const x of Array.isArray(m.material) ? m.material : [m.material]) mats.add(x);
      (m as THREE.InstancedMesh).dispose?.();
    }
  });
  geos.forEach((g) => g.dispose());
  mats.forEach((x) => x.dispose());
  cairn.removeFromParent();
}
