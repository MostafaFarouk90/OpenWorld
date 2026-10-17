import * as THREE from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { ASSETS, isSupportedModelUrl, type AssetEntry, type AssetId } from './AssetManifest';

export interface AssetLoaderOptions {
  manager?: THREE.LoadingManager;
  /** Entries to load from; defaults to the game manifest. */
  manifest?: Record<string, AssetEntry>;
  /**
   * A load that has not settled after this long rejects. Guards against a decoder that never
   * answers (e.g. a missing Draco or Basis file behind a server that does not return 404). It
   * includes download time, so keep it generous. 0 or Infinity disables it. Default 60 000.
   */
  timeoutMs?: number;
}

/**
 * Loads, caches and instantiates glTF assets from the manifest.
 *
 * DRACO and KTX2 loaders are created on the first load. GLTFLoader only fetches their
 * decoders (wasm/transcoder) when a file actually uses the matching extension.
 */
export class AssetLoader {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly manager: THREE.LoadingManager | undefined;
  private gltfLoader: GLTFLoader | null = null;
  private dracoLoader: DRACOLoader | null = null;
  private ktx2Loader: KTX2Loader | null = null;
  private readonly manifest: Record<string, AssetEntry>;
  private readonly timeoutMs: number;
  private readonly cache = new Map<AssetId, Promise<GLTF>>();
  private readonly loaded = new Map<AssetId, GLTF>();
  /** Bumped by dispose(), so loads still in flight from before it do not repopulate the cache. */
  private generation = 0;

  constructor(renderer: THREE.WebGLRenderer, options: AssetLoaderOptions = {}) {
    this.renderer = renderer;
    this.manager = options.manager;
    this.manifest = options.manifest ?? ASSETS;
    this.timeoutMs = options.timeoutMs ?? 60_000;
  }

  /**
   * Loads an asset once; concurrent and repeated calls share one promise. Unknown ids and
   * unsupported formats reject without fetching. Failures (network, decoder, timeout) reject with
   * the asset id and URL in the message and are evicted, so a later call retries.
   */
  load(id: AssetId): Promise<GLTF> {
    const cached = this.cache.get(id);
    if (cached) return cached;

    const entry = this.manifest[id];
    if (!entry) return Promise.reject(new Error(`AssetLoader: unknown asset "${id}"`));
    if (!isSupportedModelUrl(entry.url)) {
      return Promise.reject(
        new Error(`AssetLoader: "${id}" has unsupported format (${entry.url}); expected .glb or .gltf`),
      );
    }

    const generation = this.generation;
    const promise = withTimeout(this.getLoader().loadAsync(entry.url), this.timeoutMs).then(
      (gltf) => {
        if (generation === this.generation) this.loaded.set(id, gltf);
        else disposeObject(gltf.scene); // Finished after dispose(): nobody owns it.
        return gltf;
      },
      (err: unknown) => {
        if (generation === this.generation) this.cache.delete(id);
        const reason = err instanceof Error ? err.message : String(err);
        throw new Error(`AssetLoader: failed to load "${id}" from ${entry.url}: ${reason}`, { cause: err });
      },
    );
    this.cache.set(id, promise);
    return promise;
  }

  /** Loads several assets in parallel. */
  async preload(ids: AssetId[]): Promise<void> {
    await Promise.all(ids.map((id) => this.load(id)));
  }

  /** Returns an already-loaded asset or throws. */
  get(id: AssetId): GLTF {
    const gltf = this.loaded.get(id);
    if (!gltf) throw new Error(`AssetLoader: "${id}" is not loaded; call load()/preload() first`);
    return gltf;
  }

  /** Clones the asset's scene (skeleton-safe) with shadows enabled on all meshes. */
  instantiate(id: AssetId): THREE.Object3D {
    const clone = SkeletonUtils.clone(this.get(id).scene);
    clone.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
    return clone;
  }

  /** Animation clips of a loaded asset (shared, not cloned). */
  animations(id: AssetId): THREE.AnimationClip[] {
    return this.get(id).animations;
  }

  /** Frees GPU resources of all cached assets and the decoder loaders. */
  dispose(): void {
    this.generation++;
    for (const gltf of this.loaded.values()) disposeObject(gltf.scene);
    this.loaded.clear();
    this.cache.clear();
    this.dracoLoader?.dispose();
    this.ktx2Loader?.dispose();
    this.dracoLoader = null;
    this.ktx2Loader = null;
    this.gltfLoader = null;
  }

  private getLoader(): GLTFLoader {
    if (this.gltfLoader) return this.gltfLoader;
    const base = import.meta.env.BASE_URL;
    const draco = new DRACOLoader(this.manager);
    draco.setDecoderPath(`${base}decoders/draco/`);
    draco.setDecoderConfig({ type: 'wasm' });
    const ktx2 = new KTX2Loader(this.manager);
    ktx2.setTranscoderPath(`${base}decoders/basis/`);
    ktx2.detectSupport(this.renderer);
    const loader = new GLTFLoader(this.manager);
    loader.setMeshoptDecoder(MeshoptDecoder);
    loader.setDRACOLoader(draco);
    loader.setKTX2Loader(ktx2);
    this.dracoLoader = draco;
    this.ktx2Loader = ktx2;
    this.gltfLoader = loader;
    return loader;
  }
}

function disposeObject(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) {
      for (const value of Object.values(mat)) {
        if (value instanceof THREE.Texture) value.dispose();
      }
      mat.dispose();
    }
  });
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  if (!(ms > 0) || !Number.isFinite(ms)) return promise;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
