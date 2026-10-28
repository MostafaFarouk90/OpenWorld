// The ferry punt (`prop.greyfen.ferry-punt`, Dudda's flat ferry punt) and the supply sled (`prop.dragonspine.supply-sled`). Both start
// as scripted stand-ins so there is something to draw at once; `useEnvModel` swaps in the generated model of the same id
// (public/assets/env) once it loads, and the stand-in stays when the manifest lacks the id or the file fails.
import * as THREE from 'three';
import { ENV_PREFIX } from '../env/envSource';
import { hasEnvModel } from '../env/envStructureArt';
import { explicitFit } from '../assets/swap/fit';
import { ModelLibrary } from '../assets/swap/ModelLibrary';
import { DECK_HEIGHT } from './ferry/FerryRides';

/** The punt model's floor planking tops out this high above its keel (measured on the glb: 0.04 m). */
export const PUNT_FLOOR_Y = 0.4;
/**
 * Model lift so the punt's floor stays DECK_HEIGHT (0.35 m) above the waterline, where the seated player's feet ride (the ferry puts
 * them at the waterline plus DECK_HEIGHT), as the stand-in's deck did.
 */
export const PUNT_LIFT = DECK_HEIGHT - PUNT_FLOOR_Y;

/**
 * Replaces `root`'s scripted children with the env model `id` at its authored size (the models are sized in metres, base at y 0, front
 * +Z), `lift` m above the root. The root, its position and its rotation are untouched, so whatever moves the root still moves the model.
 * Resolves false and leaves the stand-in when the manifest lacks `id`, the model fails to load, or the root was disposed first
 * (`root.userData.gone`). The model's meshes share the library's geometry and materials and are tagged `sharedModel`.
 */
export async function useEnvModel(root: THREE.Object3D, id: string, lib: ModelLibrary, lift = 0): Promise<boolean> {
  if (!hasEnvModel(id)) return false;
  const t = await lib.template(`${ENV_PREFIX}${id}`);
  if (!t || root.userData.gone) return false;
  for (const child of [...root.children]) {
    root.remove(child);
    child.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    });
  }
  const model = ModelLibrary.object(t, explicitFit(t.bounds, 1, 1, 1));
  model.position.y += lift;
  model.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.userData.sharedModel = true;
    }
  });
  root.add(model);
  return true;
}

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
