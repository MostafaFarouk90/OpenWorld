// Maps a structure kind to a real model when one exists, else the greybox. The real packs are not in
// the repo yet: filling STRUCTURE_MODELS later swaps models in without touching the layout.
import * as THREE from 'three';
import type { AssetId } from '../assets/AssetManifest';
import { buildGreybox } from './greybox';
import type { StructureKind, StructureSpec } from './layoutTypes';

export const STRUCTURE_MODELS: Record<StructureKind, AssetId | null> = {
  loft: null,
  gate: null,
  cart: null,
  fence: null,
  house: null,
  bakery: null,
  tavern: null,
  mill: null,
  well: null,
  chapel: null,
  altar: null,
  waystone: null,
  board: null,
  'yard-fence': null,
  pole: null,
};

export interface ModelLoader {
  load(id: AssetId): Promise<unknown>;
  /** Returns a fresh clone of the loaded model. */
  instantiate(id: AssetId): THREE.Object3D;
}

export class BuildingLookup {
  private readonly warned = new Set<string>();

  constructor(
    private readonly loader?: ModelLoader,
    private readonly models: Record<string, AssetId | null> = STRUCTURE_MODELS,
  ) {}

  private assertKind(spec: StructureSpec): void {
    if (!Object.prototype.hasOwnProperty.call(this.models, spec.kind)) {
      throw new Error(`BuildingLookup: unknown structure kind "${String(spec.kind)}" (structure "${spec.id}")`);
    }
  }

  /** The real model for the spec, or null when the kind has none or it failed to load. Unknown kind throws. */
  async tryReal(spec: StructureSpec): Promise<THREE.Object3D | null> {
    this.assertKind(spec);
    const id = this.models[spec.kind];
    if (!id || !this.loader) return null;
    try {
      await this.loader.load(id);
      return this.loader.instantiate(id);
    } catch (err) {
      if (!this.warned.has(spec.kind)) {
        this.warned.add(spec.kind);
        console.warn(`BuildingLookup: model "${id}" for kind "${spec.kind}" failed to load, using greybox`, err);
      }
      return null;
    }
  }

  async get(spec: StructureSpec): Promise<THREE.Object3D> {
    return (await this.tryReal(spec)) ?? buildGreybox(spec);
  }
}
