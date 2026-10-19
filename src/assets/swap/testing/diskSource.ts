// Test-only: a ModelSource that parses the real committed glTF files from disk in node (textures skipped), so fit and
// recipe tests run on the real geometry without a WebGL renderer.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { vi } from 'vitest';
import { ASSETS } from '../../AssetManifest';
import { SWAP_ASSETS } from '../swapModels';
import type { ModelSource } from '../ModelLibrary';

type Fs = { existsSync(p: string): boolean; readFileSync(p: string): Uint8Array };

export async function diskSource(): Promise<ModelSource & { loaded: Set<string>; animations(id: string): THREE.AnimationClip[] }> {
  (globalThis as any).self ??= globalThis;
  (globalThis as any).ProgressEvent ??= class extends Event {};
  const fsModule = 'node:fs';
  const fs = (await import(/* @vite-ignore */ fsModule)) as unknown as Fs;
  const scenes = new Map<string, THREE.Object3D>();
  const loaded = new Set<string>();
  const clips = new Map<string, THREE.AnimationClip[]>();
  const base = import.meta.env.BASE_URL;
  const rootOf = (id: string): string => {
    const e = SWAP_ASSETS[id] ?? (ASSETS as Record<string, { url: string }>)[id];
    if (!e) throw new Error(`no manifest entry for "${id}"`);
    return 'public/' + e.url.slice(base.length > 1 ? base.length - 1 : 0).replace(/^\//, '');
  };
  return {
    loaded,
    animations: (id) => clips.get(id) ?? [],
    packOf: (id) => SWAP_ASSETS[id]?.pack ?? (ASSETS as Record<string, { pack?: string }>)[id]?.pack,
    async load(id) {
      if (scenes.has(id)) return;
      const path = rootOf(id);
      const dir = path.slice(0, path.lastIndexOf('/') + 1);
      const manager = new THREE.LoadingManager();
      manager.setURLModifier((url) => {
        if (url.startsWith('data:') || url.startsWith('blob:')) return url;
        const f = dir + decodeURIComponent(url);
        if (!fs.existsSync(f)) return url;
        const b = fs.readFileSync(f);
        let bin = '';
        for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000));
        return `data:application/octet-stream;base64,${btoa(bin)}`;
      });
      const bytes = fs.readFileSync(path);
      const data = path.endsWith('.glb') ? (bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer) : new TextDecoder().decode(bytes);
      const err = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        const gltf = await new Promise<any>((res, rej) => new GLTFLoader(manager).parse(data, '', res, rej));
        scenes.set(id, gltf.scene);
        clips.set(id, gltf.animations ?? []);
        loaded.add(id);
      } finally {
        err.mockRestore();
      }
    },
    instantiate(id) {
      const s = scenes.get(id);
      if (!s) throw new Error(`"${id}" not loaded`);
      return SkeletonUtils.clone(s);
    },
  };
}
