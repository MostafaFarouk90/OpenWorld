import * as THREE from 'three';
import { makePeatMound, PEAT_MOUND_ID } from '../fen/shambler/mound';

/** Ids of the procedural props the ground enemies carry (`ModelProp.id` starting `proc/`; the pack has no spear). */
export const GROUND_PROP_IDS = ['proc/hunter-spear', 'proc/hunter-harpoon'] as const;

const SHAFT = 0x6b4a2e;
const STEEL = 0x9aa0a8;
const RED = 0xb02a22;

function mesh(g: THREE.BufferGeometry, color: number, emissive = 0): THREE.Mesh {
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, emissive, roughness: 0.7, metalness: color === STEEL ? 0.6 : 0 }));
  m.castShadow = true;
  return m;
}

/**
 * A fresh procedural prop, built in metres along +Y from the grip (as the KayKit blades), or null for an unknown id.
 * The spear: a 2.0 m shaft, a leaf head and a red pennon. The harpoon: a 1.4 m shaft with a barbed head and a rope coil.
 */
export function makeGroundProp(id: string): THREE.Object3D | null {
  // K6b: the Peat Shambler's mound (fen/shambler/mound.ts).
  if (id === PEAT_MOUND_ID) return makePeatMound();
  if (id === 'proc/hunter-spear') {
    const g = new THREE.Group();
    const shaft = mesh(new THREE.CylinderGeometry(0.018, 0.022, 2.0, 6), SHAFT);
    shaft.position.y = 0.6;
    const head = mesh(new THREE.ConeGeometry(0.05, 0.28, 6), STEEL);
    head.position.y = 1.74;
    const pennon = mesh(new THREE.PlaneGeometry(0.2, 0.12), RED);
    (pennon.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    pennon.position.set(0.1, 1.5, 0);
    g.add(shaft, head, pennon);
    return g;
  }
  if (id === 'proc/hunter-harpoon') {
    const g = new THREE.Group();
    const shaft = mesh(new THREE.CylinderGeometry(0.02, 0.025, 1.4, 6), SHAFT);
    shaft.position.y = 0.3;
    const head = mesh(new THREE.ConeGeometry(0.06, 0.24, 4), STEEL);
    head.position.y = 1.12;
    const barb = mesh(new THREE.ConeGeometry(0.04, 0.12, 4), STEEL);
    barb.position.set(0.05, 0.98, 0);
    barb.rotation.z = -0.9;
    const coil = mesh(new THREE.TorusGeometry(0.1, 0.018, 5, 10), 0x8a7a55);
    coil.position.set(0, -0.15, 0);
    coil.rotation.x = Math.PI / 2;
    g.add(shaft, head, barb, coil);
    return g;
  }
  return null;
}

/** Frees a prop from `makeGroundProp` (its geometries and its materials) and detaches it. */
export function disposeGroundProp(o: THREE.Object3D): void {
  o.removeFromParent();
  o.traverse((n) => {
    const m = n as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry.dispose();
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) mat.dispose();
  });
}
