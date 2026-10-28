// Draws a structure kind with the generated environment model that shares its id (public/assets/env/<id>.glb, listed in the
// manifest), sized to the structure's footprint and height. The scripted art (or the greybox) stays the fallback: a kind whose id
// is not in the manifest, or whose model fails to load, gives `undefined` and the caller keeps what it had. Colliders are never
// touched here: StructureBuilder derives them from the layout spec, and this layer only supplies the visual.
//
// Fit rules (the env models are in metres, Y up, base-centre pivot, sized to src/env/targets.json, which for most structure kinds
// is the layout's own footprint and height):
//   fit      footprint filled with a uniform scale, x and z each allowed 15% off it (the env ingest's tolerance), height 15% off it.
//   height   one uniform scale so the model is exactly the spec height; the footprint is not stretched (a carving stone).
//   natural  authored size, scale 1 (a small marker standing in a loose 4 x 4 box).
//   tile     the model repeated across the footprint, never stretched past its cell: planks, jetties, a trophy wall longer than
//            the 4 m the model is. The model turns a quarter if that matches the footprint's long side better.
import * as THREE from 'three';
import manifest from '../../public/assets/env/manifest.json';
import { explicitFit, fitToBox } from '../assets/swap/fit';
import { ModelLibrary, type ModelSource, type ModelTemplate } from '../assets/swap/ModelLibrary';
import { structureHeight } from '../region/greybox';
import type { StructureSpec } from '../region/layoutTypes';
import type { StructureArt } from '../region/structureArt';
import { ENV_PREFIX, EnvModelSource } from './envSource';

export type EnvFitMode = 'fit' | 'height' | 'natural' | 'tile';

export interface EnvEntry {
  /** Manifest id of the model (default: the spec's kind). */
  id?: string;
  /** Default 'fit'. */
  mode?: EnvFitMode;
  /** tile only: tile along the long side only and scale the other axes uniformly to the spec height (a wall, not a deck). */
  crossUniform?: boolean;
  /** tile only: height of the model's walking surface (model units); it is scaled to the spec height instead of the model's top. */
  deckY?: number;
}

/** How far x and z may differ from the uniform scale in 'fit' mode (the env ingest's 15% tolerance). */
export const ENV_STRETCH = 0.15;

const ENV_IDS: ReadonlySet<string> = new Set(Object.keys(manifest.objects));

/** True when the manifest has a runtime copy of `id`. */
export function hasEnvModel(id: string): boolean {
  return ENV_IDS.has(id);
}

const shared = new WeakMap<object, ModelLibrary>();

/**
 * The library that loads `env/<id>` files (and delegates every other id to the game's loader), one per AssetLoader.
 * Without a loader (headless tests) it has no source: every template is null and callers keep their scripted art.
 */
export function envModelLibraryFor(assets: (ModelSource & object) | null | undefined): ModelLibrary {
  if (!assets) return new ModelLibrary(undefined);
  let lib = shared.get(assets);
  if (!lib || lib.isDisposed) {
    lib = new ModelLibrary(new EnvModelSource(assets));
    shared.set(assets, lib);
  }
  return lib;
}

const dims = (t: ModelTemplate) => ({ x: t.bounds.max.x - t.bounds.min.x, y: t.bounds.max.y - t.bounds.min.y, z: t.bounds.max.z - t.bounds.min.z });

function tiled(t: ModelTemplate, spec: StructureSpec, entry: EnvEntry, h: number): THREE.Object3D {
  const [w, d] = spec.footprint;
  const m = dims(t);
  // A quarter turn when the model's long axis lies across the footprint's long side (4 x 1.6 m planks along a 50 m walk).
  const turn = Math.abs(Math.log(w / d) - Math.log(m.x / m.z)) > Math.abs(Math.log(w / d) - Math.log(m.z / m.x));
  const mw = turn ? m.z : m.x;
  const md = turn ? m.x : m.z;
  const up = h / m.y;
  const plane = entry.crossUniform ? up : 1;
  const cols = Math.max(1, Math.round(w / (mw * plane)));
  const rows = entry.crossUniform ? 1 : Math.max(1, Math.round(d / md));
  const cw = w / cols;
  const cd = entry.crossUniform ? md * plane : d / rows;
  const sy = entry.crossUniform ? up : h / (entry.deckY ?? m.y);
  const root = new THREE.Group();
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const holder = new THREE.Group();
      holder.position.set(-w / 2 + cw * (i + 0.5), 0, entry.crossUniform ? 0 : -d / 2 + cd * (j + 0.5));
      if (turn) holder.rotation.y = Math.PI / 2;
      // Turned, the model's x runs along the spec's z.
      const fit = turn ? explicitFit(t.bounds, cd / m.x, sy, cw / m.z) : explicitFit(t.bounds, cw / m.x, sy, cd / m.z);
      holder.add(ModelLibrary.object(t, fit));
      root.add(holder);
    }
  }
  return root;
}

/**
 * The env model for `spec` fitted to its footprint and height, or `undefined` when the manifest lacks the id or the model did not
 * load (the caller keeps its scripted art). Never throws and never rejects.
 */
export async function envStructure(lib: ModelLibrary, spec: StructureSpec, entry: EnvEntry = {}): Promise<THREE.Object3D | undefined> {
  const id = entry.id ?? spec.kind;
  if (!hasEnvModel(id)) return undefined;
  try {
    const t = await lib.template(`${ENV_PREFIX}${id}`);
    if (!t) return undefined;
    const [w, d] = spec.footprint;
    const h = structureHeight(spec);
    const mode = entry.mode ?? 'fit';
    let obj: THREE.Object3D;
    if (mode === 'tile') obj = tiled(t, spec, entry, h);
    else if (mode === 'natural') obj = ModelLibrary.object(t, explicitFit(t.bounds, 1, 1, 1));
    else if (mode === 'height') {
      const s = h / dims(t).y;
      obj = ModelLibrary.object(t, explicitFit(t.bounds, s, s, s));
    } else obj = ModelLibrary.object(t, fitToBox(t.bounds, { width: w, depth: d, height: h }, { maxStretch: ENV_STRETCH, maxHeightStretch: ENV_STRETCH }));
    obj.userData.envModel = id;
    if (mode === 'tile') obj.name = `tile:${id}:${spec.id}`;
    return obj;
  } catch {
    return undefined;
  }
}

/**
 * A StructureArt that draws the kinds in `table` with their env models. `table` maps a structure kind to its entry, or is a function
 * for kinds that depend on more than the kind (a built-in `bridge` that is a jetty by its id). Anything else gives null.
 */
export function createEnvStructureArt(lib: ModelLibrary, table: Readonly<Record<string, EnvEntry>> | ((spec: StructureSpec) => EnvEntry | undefined)): StructureArt {
  const entryFor = typeof table === 'function' ? table : (spec: StructureSpec) => (Object.prototype.hasOwnProperty.call(table, spec.kind) ? table[spec.kind] : undefined);
  return async (spec) => {
    const entry = entryFor(spec);
    return entry ? ((await envStructure(lib, spec, entry)) ?? null) : null;
  };
}
