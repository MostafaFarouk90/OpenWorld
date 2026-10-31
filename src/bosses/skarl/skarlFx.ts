import * as THREE from 'three';
import { LOOK } from './tuning';

const shaft = new THREE.CylinderGeometry(0.025, 0.025, 0.7, 6).rotateX(Math.PI / 2);
const fletch = new THREE.BoxGeometry(0.12, 0.01, 0.12);
const shaftMat = new THREE.MeshStandardMaterial({ color: LOOK.bolt, roughness: 0.8 });
const fletchMat = new THREE.MeshStandardMaterial({ color: LOOK.fletch, roughness: 0.7 });

/** A crossbow bolt (shared geometry and materials; points along +Z). Remove it from the scene to drop it. */
export function boltMesh(): THREE.Object3D {
  const g = new THREE.Group();
  g.name = 'skarl-bolt';
  const s = new THREE.Mesh(shaft, shaftMat);
  const f1 = new THREE.Mesh(fletch, fletchMat);
  f1.position.z = -0.3;
  const f2 = f1.clone();
  f2.rotation.z = Math.PI / 2;
  g.add(s, f1, f2);
  return g;
}
