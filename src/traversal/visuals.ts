// Scripted placeholders under agreed ids until Mostafa's models exist (listed in assets/environment-needs-prompts.md):
// `prop.greyfen.ferry-punt` (Dudda's flat ferry punt) and `prop.dragonspine.supply-sled` (a loaded supply sled).
import * as THREE from 'three';

const wood = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 0.9 });

/** A flat punt about 5 x 1.8 m, deck at the origin (the seated player's feet), bow toward -Z. */
export function boatMesh(): THREE.Object3D {
  const g = new THREE.Group();
  g.name = 'prop.greyfen.ferry-punt';
  const hull = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.45, 5), wood(0x5a4630));
  hull.position.y = -0.3;
  const rail = wood(0x3f3122);
  for (const side of [-1, 1]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, 5), rail);
    r.position.set(side * 0.85, 0.05, 0);
    g.add(r);
  }
  const bench = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.5), rail);
  bench.position.set(0, 0.35, 1.2);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 4.2), rail);
  pole.position.set(0.6, 1.6, 2.1);
  pole.rotation.x = 0.35;
  g.add(hull, bench, pole);
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true;
  });
  return g;
}

/** A sled about 1.8 x 0.9 m with lashed crates, origin on the ground at its centre. */
export function sledMesh(): THREE.Object3D {
  const g = new THREE.Group();
  g.name = 'prop.dragonspine.supply-sled';
  const dark = wood(0x4a3a28);
  for (const side of [-1, 1]) {
    const runner = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 1.9), dark);
    runner.position.set(side * 0.38, 0.06, 0);
    g.add(runner);
  }
  const bed = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 1.7), wood(0x6b5638));
  bed.position.y = 0.2;
  const crate = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.6), wood(0x8a6f48));
  crate.position.set(0, 0.49, 0.35);
  const sack = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.35, 0.55), new THREE.MeshStandardMaterial({ color: 0xb8ab8c, roughness: 1 }));
  sack.position.set(0, 0.42, -0.4);
  g.add(bed, crate, sack);
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true;
  });
  return g;
}
