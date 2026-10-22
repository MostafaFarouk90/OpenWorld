// Model source for the environment pass: `env/<id>` files come from public/assets/env (own GLTF load, cached), everything else is
// delegated to the game's AssetLoader (the KayKit swap ids). Kept apart from the asset manifest because the environment art is the
// project's own work, not a CC0 pack with provenance entries.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { ModelSource } from '../assets/swap/ModelLibrary';

export const ENV_PREFIX = 'env/';

export class EnvModelSource implements ModelSource {
  private readonly loader = new GLTFLoader();
  private readonly scenes = new Map<string, Promise<THREE.Object3D>>();
  private readonly resolved = new Map<string, THREE.Object3D>();

  constructor(private readonly delegate: ModelSource | undefined, private readonly base: string = import.meta.env.BASE_URL) {}

  load(id: string): Promise<unknown> {
    if (!id.startsWith(ENV_PREFIX)) return this.delegate ? this.delegate.load(id) : Promise.reject(new Error(`no source for ${id}`));
    let p = this.scenes.get(id);
    if (!p) {
      p = this.loader.loadAsync(`${this.base}assets/env/${id.slice(ENV_PREFIX.length)}.glb`).then((g) => {
        this.resolved.set(id, g.scene);
        return g.scene;
      });
      this.scenes.set(id, p);
    }
    return p;
  }

  instantiate(id: string): THREE.Object3D {
    if (!id.startsWith(ENV_PREFIX)) {
      if (!this.delegate) throw new Error(`no source for ${id}`);
      return this.delegate.instantiate(id);
    }
    // ModelLibrary awaits load() before it instantiates, so the scene is here.
    const scene = this.resolved.get(id);
    if (!scene) throw new Error(`${id} not loaded`);
    return scene.clone(true);
  }

  packOf(id: string): string | undefined {
    return id.startsWith(ENV_PREFIX) ? undefined : this.delegate?.packOf?.(id);
  }
}
