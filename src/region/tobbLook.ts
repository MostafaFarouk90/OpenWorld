// Tobb Fenwick's look, shared by the NPC at the Grey Goose door (thread 4) and the companion (thread 4b) so the two match:
// the Rogue_Hooded model with a green cloak and a primitive lute (the Quaternius props are not in the repo yet).
import * as THREE from 'three';
import type { NpcModelId } from '../npcs/types';

export const TOBB_LOOK = {
  model: 'rogueHooded' as NpcModelId,
  scale: 1,
  /** Pulls the model's colours toward the cloak green. */
  tint: 0x3f7a3a,
  cloak: 0x3f7a3a,
  lute: 0x8a5a2b,
} as const;

/** Cloak and lute in the figure's frame: feet at the origin, facing -Z (yaw 0), +Z behind. Owns its geometry and materials. */
export function buildTobbExtras(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'tobb-extras';
  const cloakMat = new THREE.MeshStandardMaterial({ color: TOBB_LOOK.cloak, side: THREE.DoubleSide, flatShading: true });
  const cloak = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.95), cloakMat);
  cloak.name = 'cloak';
  cloak.position.set(0, 1.0, 0.26);
  cloak.rotation.x = 0.12;
  g.add(cloak);
  const luteMat = new THREE.MeshStandardMaterial({ color: TOBB_LOOK.lute, flatShading: true });
  const lute = new THREE.Group();
  lute.name = 'lute';
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), luteMat);
  body.scale.set(1, 0.4, 1.25);
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.5), luteMat);
  neck.position.z = -0.45;
  lute.add(body, neck);
  lute.position.set(0.3, 0.95, -0.2);
  lute.rotation.set(0.3, -0.5, 0);
  g.add(lute);
  return g;
}
