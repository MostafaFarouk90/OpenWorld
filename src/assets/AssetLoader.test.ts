import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { AssetEntry, AssetId } from './AssetManifest';

const mocks = vi.hoisted(() => ({
  loadAsync: vi.fn(),
  gltfLoaders: [] as unknown[],
  dracoLoaders: [] as { setDecoderPath: (p: string) => void; dispose: () => void }[],
  ktx2Loaders: [] as { setTranscoderPath: (p: string) => void; dispose: () => void }[],
}));

vi.mock('three/examples/jsm/loaders/GLTFLoader.js', () => ({
  GLTFLoader: class {
    loadAsync = mocks.loadAsync;
    setMeshoptDecoder = vi.fn();
    setDRACOLoader = vi.fn();
    setKTX2Loader = vi.fn();
    constructor() {
      mocks.gltfLoaders.push(this);
    }
  },
}));
vi.mock('three/examples/jsm/loaders/DRACOLoader.js', () => ({
  DRACOLoader: class {
    setDecoderPath = vi.fn();
    setDecoderConfig = vi.fn();
    dispose = vi.fn();
    constructor() {
      mocks.dracoLoaders.push(this);
    }
  },
}));
vi.mock('three/examples/jsm/loaders/KTX2Loader.js', () => ({
  KTX2Loader: class {
    setTranscoderPath = vi.fn();
    detectSupport = vi.fn();
    dispose = vi.fn();
    constructor() {
      mocks.ktx2Loaders.push(this);
    }
  },
}));
vi.mock('three/examples/jsm/libs/meshopt_decoder.module.js', () => ({ MeshoptDecoder: {} }));

import { AssetLoader } from './AssetLoader';

const renderer = {} as THREE.WebGLRenderer;

function makeGltf(scene: THREE.Object3D = new THREE.Group(), animations: THREE.AnimationClip[] = []): GLTF {
  return { scene, scenes: [scene], animations } as unknown as GLTF;
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  mocks.loadAsync.mockReset();
  mocks.gltfLoaders.length = 0;
  mocks.dracoLoaders.length = 0;
  mocks.ktx2Loaders.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('AssetLoader caching', () => {
  it('shares one fetch between concurrent and sequential load calls', async () => {
    const gltf = makeGltf();
    mocks.loadAsync.mockResolvedValue(gltf);
    const loader = new AssetLoader(renderer);
    const [a, b] = await Promise.all([loader.load('knight'), loader.load('knight')]);
    const c = await loader.load('knight');
    expect(mocks.loadAsync).toHaveBeenCalledTimes(1);
    expect(a).toBe(gltf);
    expect(b).toBe(gltf);
    expect(c).toBe(gltf);
    expect(loader.get('knight')).toBe(gltf);
  });

  it('fetches each different id with its manifest url', async () => {
    mocks.loadAsync.mockImplementation((url: string) => Promise.resolve(makeGltf(new THREE.Group()).scene && { url }));
    const loader = new AssetLoader(renderer);
    await loader.load('knight');
    await loader.load('sword');
    expect(mocks.loadAsync).toHaveBeenCalledTimes(2);
    expect(mocks.loadAsync).toHaveBeenNthCalledWith(1, '/assets/kaykit-adventurers/characters/Knight.glb');
    expect(mocks.loadAsync).toHaveBeenNthCalledWith(2, '/assets/kaykit-adventurers/weapons/sword_1handed.gltf');
  });
});

describe('AssetLoader failures', () => {
  it('rejects with id, url and reason, evicts the entry and allows a retry', async () => {
    mocks.loadAsync.mockRejectedValueOnce(new Error('404 Not Found'));
    const loader = new AssetLoader(renderer);
    const failure = loader.load('knight');
    await expect(failure).rejects.toThrow(/knight/);
    await expect(failure).rejects.toThrow(/Knight\.glb/);
    await expect(failure).rejects.toThrow(/404 Not Found/);
    expect(() => loader.get('knight')).toThrow('not loaded');

    const gltf = makeGltf();
    mocks.loadAsync.mockResolvedValueOnce(gltf);
    await expect(loader.load('knight')).resolves.toBe(gltf);
    expect(mocks.loadAsync).toHaveBeenCalledTimes(2);
    expect(loader.get('knight')).toBe(gltf);
  });

  it('stringifies non-Error rejection reasons', async () => {
    mocks.loadAsync.mockRejectedValueOnce('boom');
    await expect(new AssetLoader(renderer).load('knight')).rejects.toThrow(/boom/);
  });

  it('surfaces a decoder failure reason in the error', async () => {
    mocks.loadAsync.mockRejectedValueOnce(new Error('Failed to fetch draco_wasm_wrapper.js'));
    await expect(new AssetLoader(renderer).load('knight')).rejects.toThrow(
      /Failed to fetch draco_wasm_wrapper\.js/,
    );
  });

  it('rejects with a timed out error when the load hangs, and evicts the entry', async () => {
    vi.useFakeTimers();
    mocks.loadAsync.mockReturnValueOnce(new Promise(() => {}));
    const loader = new AssetLoader(renderer, { timeoutMs: 1000 });
    const result = loader.load('knight').then(
      () => 'resolved',
      (e: Error) => e.message,
    );
    await vi.advanceTimersByTimeAsync(1000);
    expect(await result).toMatch(/timed out/);
    expect(() => loader.get('knight')).toThrow('not loaded');

    const gltf = makeGltf();
    mocks.loadAsync.mockResolvedValueOnce(gltf);
    await expect(loader.load('knight')).resolves.toBe(gltf);
    expect(mocks.loadAsync).toHaveBeenCalledTimes(2);
  });

  it('does not time out a load that settles in time', async () => {
    vi.useFakeTimers();
    const gltf = makeGltf();
    mocks.loadAsync.mockResolvedValueOnce(gltf);
    const loader = new AssetLoader(renderer, { timeoutMs: 1000 });
    const result = loader.load('knight');
    await vi.advanceTimersByTimeAsync(5000);
    await expect(result).resolves.toBe(gltf);
  });

  it.each([0, Infinity])('never times out when timeoutMs is %s', async (timeoutMs) => {
    vi.useFakeTimers();
    const d = deferred<GLTF>();
    mocks.loadAsync.mockReturnValueOnce(d.promise);
    const loader = new AssetLoader(renderer, { timeoutMs });
    const result = loader.load('knight');
    await vi.advanceTimersByTimeAsync(10 * 60 * 60 * 1000);
    expect(vi.getTimerCount()).toBe(0);
    const gltf = makeGltf();
    d.resolve(gltf);
    await expect(result).resolves.toBe(gltf);
    expect(loader.get('knight')).toBe(gltf);
  });

  it('still rejects a failure when the timeout is disabled', async () => {
    mocks.loadAsync.mockRejectedValueOnce(new Error('boom'));
    await expect(new AssetLoader(renderer, { timeoutMs: 0 }).load('knight')).rejects.toThrow(/boom/);
  });

  it('uses a 60 s default timeout', async () => {
    vi.useFakeTimers();
    mocks.loadAsync.mockReturnValueOnce(new Promise(() => {}));
    const result = new AssetLoader(renderer).load('knight').then(
      () => 'resolved',
      (e: Error) => e.message,
    );
    await vi.advanceTimersByTimeAsync(59_999);
    let settled = false;
    void result.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toMatch(/timed out after 60000 ms/);
  });

  it('rejects an unsupported format without fetching', async () => {
    const manifest: Record<string, AssetEntry> = {
      bad: { id: 'bad', url: '/assets/bad.fbx', pack: 'kaykit-adventurers', kind: 'prop' },
    };
    const loader = new AssetLoader(renderer, { manifest });
    await expect(loader.load('bad' as AssetId)).rejects.toThrow(/unsupported format/);
    expect(mocks.loadAsync).not.toHaveBeenCalled();
    expect(mocks.gltfLoaders).toHaveLength(0);
  });

  it('rejects an unknown id without fetching', async () => {
    const loader = new AssetLoader(renderer);
    await expect(loader.load('nope' as AssetId)).rejects.toThrow(/unknown asset/);
    expect(mocks.loadAsync).not.toHaveBeenCalled();
  });
});

describe('AssetLoader.preload', () => {
  it('resolves once every asset has loaded', async () => {
    mocks.loadAsync.mockImplementation(() => Promise.resolve(makeGltf()));
    const loader = new AssetLoader(renderer);
    await expect(loader.preload(['knight', 'sword', 'shieldRound'])).resolves.toBeUndefined();
    expect(() => loader.get('shieldRound')).not.toThrow();
  });

  it('rejects when any asset fails', async () => {
    mocks.loadAsync.mockImplementation((url: string) =>
      url.endsWith('sword_1handed.gltf') ? Promise.reject(new Error('nope')) : Promise.resolve(makeGltf()),
    );
    const loader = new AssetLoader(renderer);
    await expect(loader.preload(['knight', 'sword'])).rejects.toThrow(/sword/);
  });

  it('resolves immediately for an empty list', async () => {
    await expect(new AssetLoader(renderer).preload([])).resolves.toBeUndefined();
    expect(mocks.loadAsync).not.toHaveBeenCalled();
  });
});

describe('AssetLoader.dispose', () => {
  it('does not resurrect an entry whose load resolves after dispose', async () => {
    const d = deferred<GLTF>();
    mocks.loadAsync.mockReturnValueOnce(d.promise);
    const loader = new AssetLoader(renderer);
    const first = loader.load('knight');
    loader.dispose();
    d.resolve(makeGltf());
    await first;
    expect(() => loader.get('knight')).toThrow('not loaded');

    const gltf = makeGltf();
    mocks.loadAsync.mockResolvedValueOnce(gltf);
    await expect(loader.load('knight')).resolves.toBe(gltf);
    expect(mocks.loadAsync).toHaveBeenCalledTimes(2);
  });

  it('disposes the scene of a load that resolves after dispose and does not cache it', async () => {
    const d = deferred<GLTF>();
    mocks.loadAsync.mockReturnValueOnce(d.promise);
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial();
    const scene = new THREE.Group();
    scene.add(new THREE.Mesh(geometry, material));
    const spies = [vi.spyOn(geometry, 'dispose'), vi.spyOn(material, 'dispose')];
    const loader = new AssetLoader(renderer);
    const first = loader.load('knight');
    loader.dispose();
    d.resolve(makeGltf(scene));
    await first;
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
    expect(() => loader.get('knight')).toThrow('not loaded');
  });

  it('does not dispose the scene of a load that resolves without a dispose', async () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const scene = new THREE.Group();
    scene.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial()));
    const spy = vi.spyOn(geometry, 'dispose');
    mocks.loadAsync.mockResolvedValueOnce(makeGltf(scene));
    await new AssetLoader(renderer).load('knight');
    expect(spy).not.toHaveBeenCalled();
  });

  it('does not delete a newer cache entry when an old load rejects after dispose', async () => {
    const old = deferred<GLTF>();
    const fresh = deferred<GLTF>();
    mocks.loadAsync.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    const loader = new AssetLoader(renderer);
    const first = loader.load('knight');
    loader.dispose();
    const second = loader.load('knight');

    old.reject(new Error('late failure'));
    await expect(first).rejects.toThrow(/late failure/);

    // The new entry must still be cached: no third fetch.
    expect(loader.load('knight')).toBe(second);
    expect(mocks.loadAsync).toHaveBeenCalledTimes(2);

    const gltf = makeGltf();
    fresh.resolve(gltf);
    await expect(second).resolves.toBe(gltf);
    expect(loader.get('knight')).toBe(gltf);
  });

  it('disposes geometries, materials and textures of loaded scenes', async () => {
    const map = new THREE.Texture();
    const material = new THREE.MeshStandardMaterial({ map });
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const scene = new THREE.Group();
    scene.add(new THREE.Mesh(geometry, material));
    const spies = [vi.spyOn(geometry, 'dispose'), vi.spyOn(material, 'dispose'), vi.spyOn(map, 'dispose')];
    mocks.loadAsync.mockResolvedValueOnce(makeGltf(scene));

    const loader = new AssetLoader(renderer);
    await loader.load('knight');
    loader.dispose();

    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
    expect(() => loader.get('knight')).toThrow('not loaded');
  });

  it('disposes every material of a multi-material mesh', async () => {
    const mats = [new THREE.MeshStandardMaterial(), new THREE.MeshStandardMaterial()];
    const spies = mats.map((m) => vi.spyOn(m, 'dispose'));
    const scene = new THREE.Group();
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(), mats));
    mocks.loadAsync.mockResolvedValueOnce(makeGltf(scene));
    const loader = new AssetLoader(renderer);
    await loader.load('knight');
    loader.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
  });

  it('disposes the decoder loaders and recreates them on the next load', async () => {
    mocks.loadAsync.mockImplementation(() => Promise.resolve(makeGltf()));
    const loader = new AssetLoader(renderer);
    await loader.load('knight');
    const draco = mocks.dracoLoaders[0] as unknown as { dispose: ReturnType<typeof vi.fn> };
    const ktx2 = mocks.ktx2Loaders[0] as unknown as { dispose: ReturnType<typeof vi.fn> };
    loader.dispose();
    expect(draco.dispose).toHaveBeenCalledTimes(1);
    expect(ktx2.dispose).toHaveBeenCalledTimes(1);
    await loader.load('knight');
    expect(mocks.gltfLoaders).toHaveLength(2);
  });

  it('is safe to call before anything was loaded and more than once', () => {
    const loader = new AssetLoader(renderer);
    expect(() => {
      loader.dispose();
      loader.dispose();
    }).not.toThrow();
  });
});

describe('AssetLoader.instantiate and animations', () => {
  it('returns a new object with shadows enabled on meshes, leaving the cached scene alone', async () => {
    const scene = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    scene.add(mesh);
    mocks.loadAsync.mockResolvedValueOnce(makeGltf(scene));
    const loader = new AssetLoader(renderer);
    await loader.load('knight');

    const clone = loader.instantiate('knight');
    expect(clone).not.toBe(scene);
    const cloneMeshes: THREE.Mesh[] = [];
    clone.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) cloneMeshes.push(o as THREE.Mesh);
    });
    expect(cloneMeshes).toHaveLength(1);
    expect(cloneMeshes[0]).not.toBe(mesh);
    expect(cloneMeshes[0].castShadow).toBe(true);
    expect(cloneMeshes[0].receiveShadow).toBe(true);
    expect(mesh.castShadow).toBe(false);
  });

  it('returns the clips of the loaded gltf', async () => {
    const clips = [new THREE.AnimationClip('Idle', 1, [])];
    mocks.loadAsync.mockResolvedValueOnce(makeGltf(new THREE.Group(), clips));
    const loader = new AssetLoader(renderer);
    await loader.load('knight');
    expect(loader.animations('knight')).toBe(clips);
  });

  it('throws from get, instantiate and animations before the asset is loaded', () => {
    const loader = new AssetLoader(renderer);
    expect(() => loader.get('knight')).toThrow('not loaded');
    expect(() => loader.instantiate('knight')).toThrow('not loaded');
    expect(() => loader.animations('knight')).toThrow('not loaded');
  });
});

describe('AssetLoader lazy decoder setup', () => {
  it('creates no loaders until the first load', () => {
    new AssetLoader(renderer);
    expect(mocks.gltfLoaders).toHaveLength(0);
    expect(mocks.dracoLoaders).toHaveLength(0);
    expect(mocks.ktx2Loaders).toHaveLength(0);
  });

  it('creates each loader once with decoder paths set, and reuses them on later loads', async () => {
    mocks.loadAsync.mockImplementation(() => Promise.resolve(makeGltf()));
    const loader = new AssetLoader(renderer);
    await loader.load('knight');
    expect(mocks.gltfLoaders).toHaveLength(1);
    expect(mocks.dracoLoaders).toHaveLength(1);
    expect(mocks.ktx2Loaders).toHaveLength(1);
    expect(mocks.dracoLoaders[0].setDecoderPath).toHaveBeenCalledWith('/decoders/draco/');
    expect(mocks.ktx2Loaders[0].setTranscoderPath).toHaveBeenCalledWith('/decoders/basis/');

    await loader.load('sword');
    expect(mocks.gltfLoaders).toHaveLength(1);
    expect(mocks.dracoLoaders).toHaveLength(1);
    expect(mocks.ktx2Loaders).toHaveLength(1);
  });
});
