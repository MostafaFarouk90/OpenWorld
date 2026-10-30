// Test-only: a ModelSource that parses the committed public/assets/env/<id>.glb files from disk in node, so env fit tests run on the
// real geometry without a renderer. Ids must start with `env/`.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ENV_PREFIX } from '../envSource';
import type { ModelSource } from '../../assets/swap/ModelLibrary';

type Fs = { readFileSync(p: string): Uint8Array };

export async function envDiskSource(): Promise<ModelSource & { loaded: string[] }> {
  (globalThis as any).self ??= globalThis;
  (globalThis as any).ProgressEvent ??= class extends Event {};
  const fsModule = 'node:fs';
  const fs = (await import(/* @vite-ignore */ fsModule)) as unknown as Fs;
  const scenes = new Map<string, THREE.Object3D>();
  const loaded: string[] = [];
  return {
    loaded,
    async load(id) {
      if (!id.startsWith(ENV_PREFIX)) throw new Error(`envDiskSource: "${id}" is not an env id`);
      if (scenes.has(id)) return;
      const bytes = fs.readFileSync(`public/assets/env/${id.slice(ENV_PREFIX.length)}.glb`);
      const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      const gltf = await new Promise<any>((res, rej) => new GLTFLoader().parse(data, '', res, rej));
      scenes.set(id, gltf.scene);
      loaded.push(id);
    },
    instantiate(id) {
      const s = scenes.get(id);
      if (!s) throw new Error(`"${id}" not loaded`);
      return s.clone(true);
    },
  };
}

/** The world-space box of an object (after its matrices are updated). */
export function boxOf(o: THREE.Object3D): THREE.Box3 {
  o.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(o);
}

/** True when `o` contains a model object for env id `id` (ModelLibrary names it `model:env/<id>`). */
export function drawsEnv(o: THREE.Object3D, id: string): boolean {
  let found = false;
  o.traverse((c) => {
    if (c.name === `model:env/${id}`) found = true;
  });
  return found;
}
