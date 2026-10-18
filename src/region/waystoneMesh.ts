// The stone mesh of a waystone: a pillar on a plinth with a dim emissive crystal. Behaviour belongs to thread 6.
import * as THREE from 'three';

const DIM = 0.15;
const LIT = 1.8;
const stoneMat = new THREE.MeshLambertMaterial({ color: 0x8a8d92, flatShading: true });

export function buildWaystoneMesh(): THREE.Object3D {
  const g = new THREE.Group();
  g.name = 'waystone';
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.35, 1.6), stoneMat);
  base.position.y = 0.175;
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, 1.7, 6), stoneMat);
  pillar.position.y = 0.35 + 0.85;
  const crystal = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.28),
    new THREE.MeshStandardMaterial({ color: 0x4fa3d9, emissive: 0x4fa3d9, emissiveIntensity: DIM, flatShading: true }),
  );
  crystal.name = 'crystal';
  crystal.position.y = 2.1;
  g.add(base, pillar, crystal);
  return g;
}

export function setLit(obj: THREE.Object3D, lit: boolean): void {
  const crystal = obj.getObjectByName('crystal') as THREE.Mesh | undefined;
  if (!crystal) return;
  (crystal.material as THREE.MeshStandardMaterial).emissiveIntensity = lit ? LIT : DIM;
}

export function disposeWaystoneMesh(obj: THREE.Object3D): void {
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry.dispose();
    if (m.name === 'crystal') (m.material as THREE.Material).dispose();
  });
}
