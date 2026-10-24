import * as THREE from 'three';

/** The `proc/` id of the Peat Shambler's mound (`ModelProp.id`), built by `makePeatMound`. */
export const PEAT_MOUND_ID = 'proc/peat-mound';

const PEAT = 0x3a2c1e;
const MOSS = 0x56703a;

/** A small deterministic hash, so every mound has the same lumps (no `Math.random` in a build). */
function lump(x: number, y: number, z: number): number {
  const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * The shambler's peat mound: a displaced, lumpy dome in metres (about 1.1 m across) sitting on the back and shoulders, with
 * crossed moss cards. Own geometry and materials; free it with `disposeGroundProp` (ranged/props.ts).
 */
export function makePeatMound(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'peat-mound';
  const geo = new THREE.IcosahedronGeometry(0.55, 2);
  const pos = geo.attributes['position'] as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const k = 0.82 + 0.3 * lump(Math.round(v.x * 20), Math.round(v.y * 20), Math.round(v.z * 20));
    v.multiplyScalar(k);
    if (v.y < 0) v.y *= 0.35; // flat underside against the back
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  const peat = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: PEAT, roughness: 0.95, flatShading: true }));
  peat.castShadow = true;
  peat.scale.set(1, 0.75, 0.9);
  g.add(peat);
  const mossMat = new THREE.MeshStandardMaterial({ color: MOSS, roughness: 1, side: THREE.DoubleSide });
  const card = new THREE.PlaneGeometry(0.5, 0.28);
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(card, mossMat);
    const a = (i / 4) * Math.PI * 2;
    m.position.set(Math.cos(a) * 0.28, 0.32, Math.sin(a) * 0.24);
    m.rotation.set(-0.4, a, 0.2);
    g.add(m);
  }
  return g;
}
