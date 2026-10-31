import * as THREE from 'three';

/** The `proc/` id of the Crag Ogre's club (`ModelProp.id`), built by `makeOgreClub`. */
export const OGRE_CLUB_ID = 'proc/ogre-club';

const WOOD = 0x5a4632;
const KNOT = 0x3e3024;
const STONE = 0x7d8288;

/**
 * The ogre's club (design 10 row 12): a 1.3 m knotted trunk from the grip along +Y (as the KayKit blades), swelling to a
 * head bound with two rough stones. Own geometry and materials; free it with `disposeGroundProp` (ranged/props.ts).
 */
export function makeOgreClub(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'ogre-club';
  const mat = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.05, 1.3, 7), mat(WOOD));
  shaft.position.y = 0.45;
  const head = new THREE.Mesh(new THREE.DodecahedronGeometry(0.17, 0), mat(KNOT));
  head.position.y = 1.05;
  head.scale.set(1, 1.4, 1);
  const stoneA = new THREE.Mesh(new THREE.DodecahedronGeometry(0.08, 0), mat(STONE));
  stoneA.position.set(0.13, 1.02, 0.04);
  const stoneB = new THREE.Mesh(new THREE.DodecahedronGeometry(0.07, 0), mat(STONE));
  stoneB.position.set(-0.11, 1.12, -0.06);
  for (const m of [shaft, head, stoneA, stoneB]) {
    m.castShadow = true;
    g.add(m);
  }
  return g;
}
