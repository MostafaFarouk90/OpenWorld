import { ModelLibrary, type ModelSource } from '../assets/swap/ModelLibrary';
import { EnvModelSource } from '../env/envSource';

/** Hand-held models from the environment pass (public/assets/env): origin at the grip, +Y up, the point toward +Z, 1 unit = 1 m. */
export const HUNTER_SPEAR_PROP = 'env/spear-hunter';
export const REDMANE_LANCE_PROP = 'env/lance-redmane';
/** Edge-to-edge length of each, metres: the prop is held at this size whatever scale the rig carries. */
export const HUNTER_SPEAR_LENGTH = 2.2;
export const REDMANE_LANCE_LENGTH = 3.2;

/**
 * A prop's own rotation on a KayKit hand bone. The bone runs along its local +Y (towards the fingers), and the env models point
 * along +Z, so a quarter turn about X (+Z to +Y) lays the weapon along the bone: grip in the palm, point away from the wrist.
 */
export const HELD_PROP_ROTATION: readonly [number, number, number] = [-Math.PI / 2, 0, 0];

const libraries = new WeakMap<object, ModelLibrary>();

/**
 * The one library for env-pass hand-held models per asset loader (`env/<id>` files load from public/assets/env). A glb that is
 * not there resolves to null and warns once, so callers keep their procedural prop. Without a loader it has no source.
 */
export function envPropLibrary(assets: (ModelSource & object) | null | undefined): ModelLibrary {
  if (!assets) return new ModelLibrary(undefined);
  let lib = libraries.get(assets);
  if (!lib || lib.isDisposed) {
    lib = new ModelLibrary(new EnvModelSource(assets));
    libraries.set(assets, lib);
  }
  return lib;
}
