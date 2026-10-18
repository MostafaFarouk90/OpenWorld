import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { externalUris, gltfJson, verifyEntry, type Provenance, type ProvenanceEntry } from './provenance';

// Imported packs (tools/assets/import-packs.mjs and tools/assets/blender/convert_horse.py).
const ROOT = 'public/assets/';
const IMPORTED_DIRS = [
  'kaykit-medieval-hexagon',
  'kaykit-dungeon-remastered',
  'kaykit-halloween',
  'kaykit-furniture',
  'kaykit-adventurers/weapons',
  'quaternius-farm-animals',
];
const SIZE_CAP_BYTES = 25 * 1024 * 1024;
const HORSE = 'quaternius-farm-animals/Horse.glb';

let fs: any;
let sha256: (b: Uint8Array) => string;
let prov: Provenance;
let fit: { models: Record<string, { kind: string; scale: number; yawDeg: number; yOffset: number }> };
const read = (rel: string): Uint8Array | null => (fs.existsSync(ROOT + rel) ? new Uint8Array(fs.readFileSync(ROOT + rel)) : null);
const arrayBuffer = (b: Uint8Array) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

beforeAll(async () => {
  (globalThis as any).self ??= globalThis;
  // FileLoader reports progress with ProgressEvent, which Node lacks.
  (globalThis as any).ProgressEvent ??= class extends Event {
    lengthComputable: boolean;
    loaded: number;
    total: number;
    constructor(type: string, init: { lengthComputable?: boolean; loaded?: number; total?: number } = {}) {
      super(type);
      this.lengthComputable = !!init.lengthComputable;
      this.loaded = init.loaded ?? 0;
      this.total = init.total ?? 0;
    }
  };
  const fsModule = 'node:fs';
  const cryptoModule = 'node:crypto';
  fs = await import(/* @vite-ignore */ fsModule);
  const crypto: any = await import(/* @vite-ignore */ cryptoModule);
  sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
  prov = JSON.parse(fs.readFileSync(ROOT + 'provenance.json', 'utf8'));
  fit = JSON.parse(fs.readFileSync(ROOT + 'fit.json', 'utf8'));
});

/** Parses a glTF from disk, resolving its relative buffers through setURLModifier. */
async function loadFromDisk(rel: string) {
  const dir = rel.slice(0, rel.lastIndexOf('/') + 1);
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => {
    if (url.startsWith('data:') || url.startsWith('blob:')) return url;
    const bytes = read(dir + decodeURIComponent(url));
    if (!bytes) return url;
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return `data:application/octet-stream;base64,${btoa(bin)}`;
  });
  const bytes = read(rel)!;
  const data = rel.endsWith('.glb') ? arrayBuffer(bytes) : new TextDecoder().decode(bytes);
  // Node has no image decoding; GLTFLoader logs and skips textures, which the structural test covers.
  const err = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    return await new Promise<any>((res, rej) => new GLTFLoader(manager).parse(data, '', res, rej));
  } finally {
    err.mockRestore();
  }
}

describe('imported asset provenance', () => {
  it('every recorded file exists and matches its SHA-256, size and licence', () => {
    const issues = Object.entries(prov.files).flatMap(([rel, e]) => verifyEntry(rel, e, read, sha256));
    expect(issues).toEqual([]);
    expect(Object.keys(prov.files).length).toBeGreaterThan(200);
  });

  it('every file in the imported folders has a provenance entry', () => {
    const unlisted: string[] = [];
    const walk = (dir: string) => {
      for (const name of fs.readdirSync(ROOT + dir)) {
        const rel = `${dir}/${name}`;
        if (fs.statSync(ROOT + rel).isDirectory()) walk(rel);
        else if (!prov.files[rel]) unlisted.push(rel);
      }
    };
    IMPORTED_DIRS.forEach(walk);
    expect(unlisted).toEqual([]);
  });

  it('keeps the imported bytes under the 25 MB cap', () => {
    const total = Object.values(prov.files).reduce((n, e) => n + e.bytes, 0);
    expect(total).toBeLessThanOrEqual(SIZE_CAP_BYTES);
  });

  it('records the horse as generated from the pinned FBX', () => {
    const e = prov.files[HORSE];
    expect(e.source.sha256).toBe('6db270ddc7591e9a013f96eab445031381fa6d5d68d2feba567f964e0fe68d90');
    expect(e.source.commit).toBe('85064399bbdacc0e8cc50807179490314bc4ff1c');
    expect(e.generated?.script).toBe('tools/assets/blender/convert_horse.py');
    expect(e.generated?.tool).toMatch(/^bpy 5\.2\.2/);
  });

  it('leaves out the off-tone Halloween pieces', () => {
    const offTone = Object.keys(prov.files).filter((k) => /pumpkin|jackolantern|skull/i.test(k));
    expect(offTone).toEqual([]);
  });
});

describe('verifyEntry failure paths', () => {
  const bytes = new TextEncoder().encode('model');
  const lic = new TextEncoder().encode('CC0');
  const hash = (b: Uint8Array) => (b === bytes ? 'a'.repeat(64) : b === lic ? 'b'.repeat(64) : 'c'.repeat(64));
  const entry: ProvenanceEntry = {
    sha256: 'a'.repeat(64),
    bytes: bytes.length,
    source: { repo: 'r', commit: '1'.repeat(40), path: 'p' },
    licence: { path: 'L.txt', upstreamPath: 'LICENSE.txt', sha256: 'b'.repeat(64), id: 'CC0-1.0' },
  };
  const files = (m: Record<string, Uint8Array>) => (p: string) => m[p] ?? null;

  it('passes a matching file', () => {
    expect(verifyEntry('m.glb', entry, files({ 'm.glb': bytes, 'L.txt': lic }), hash)).toEqual([]);
  });
  it('flags a missing file', () => {
    expect(verifyEntry('m.glb', entry, files({ 'L.txt': lic }), hash)).toEqual(['m.glb: file missing']);
  });
  it('flags tampered bytes of the same length', () => {
    const other = new TextEncoder().encode('MODEL');
    expect(verifyEntry('m.glb', entry, files({ 'm.glb': other, 'L.txt': lic }), hash)).toEqual(['m.glb: sha256 mismatch']);
  });
  it('flags a size change', () => {
    const issues = verifyEntry('m.glb', { ...entry, bytes: 99 }, files({ 'm.glb': bytes, 'L.txt': lic }), hash);
    expect(issues).toContain('m.glb: 5 bytes, provenance says 99');
  });
  it('flags a missing or altered licence file', () => {
    expect(verifyEntry('m.glb', entry, files({ 'm.glb': bytes }), hash)).toEqual(['m.glb: licence file L.txt missing']);
    expect(verifyEntry('m.glb', entry, files({ 'm.glb': bytes, 'L.txt': bytes }), hash)).toEqual(['m.glb: licence file L.txt sha256 mismatch']);
  });
  it('flags a non-CC0 licence and a short commit', () => {
    const bad = { ...entry, source: { ...entry.source, commit: 'abc123' }, licence: { ...entry.licence, id: 'CC-BY-4.0' as any } };
    const issues = verifyEntry('m.glb', bad, files({ 'm.glb': bytes, 'L.txt': lic }), hash);
    expect(issues).toContain('m.glb: source commit is not a full SHA');
    expect(issues).toContain('m.glb: licence is not CC0-1.0');
  });
});

describe('gltfJson and externalUris', () => {
  it('rejects a file that is not a GLB, a truncated GLB and an unknown extension', () => {
    expect(() => gltfJson(new Uint8Array(24), 'x.glb')).toThrow(/not a GLB/);
    const head = new Uint8Array(20);
    const v = new DataView(head.buffer);
    v.setUint32(0, 0x46546c67, true);
    v.setUint32(12, 1000, true);
    expect(() => gltfJson(head, 'x.glb')).toThrow(/truncated/);
    expect(() => gltfJson(new Uint8Array(0), 'x.fbx')).toThrow(/not a glTF/);
  });
  it('ignores data: URIs and decodes escaped names', () => {
    const uris = externalUris({ buffers: [{ uri: 'data:,', byteLength: 1 }, { uri: 'a%20b.bin', byteLength: 4 }], images: [{ uri: 't.png' }, { bufferView: 0 }] });
    expect(uris).toEqual({ buffers: [{ uri: 'a b.bin', byteLength: 4 }], images: ['t.png'] });
  });
});

describe('imported models load', () => {
  const models = () => Object.keys(prov.files).filter((k) => /\.(gltf|glb)$/.test(k));

  it('every external buffer matches its declared length and every texture is committed', () => {
    const issues: string[] = [];
    for (const rel of models()) {
      const dir = rel.slice(0, rel.lastIndexOf('/') + 1);
      const { buffers, images } = externalUris(gltfJson(read(rel)!, rel));
      for (const b of buffers) {
        const bin = read(dir + b.uri);
        if (!bin) issues.push(`${rel}: missing ${b.uri}`);
        else if (bin.length !== b.byteLength) issues.push(`${rel}: ${b.uri} is ${bin.length} bytes, glTF declares ${b.byteLength}`);
      }
      for (const img of images) if (!read(dir + img)) issues.push(`${rel}: missing texture ${img}`);
    }
    expect(issues).toEqual([]);
  });

  it('every model parses with GLTFLoader and has geometry', async () => {
    const empty: string[] = [];
    for (const rel of models()) {
      let gltf: any;
      try {
        gltf = await loadFromDisk(rel);
      } catch (e) {
        empty.push(`${rel}: ${e instanceof Error ? e.message : String(e)}`);
        continue;
      }
      let meshes = 0;
      gltf.scene.traverse((o: THREE.Object3D) => {
        if ((o as THREE.Mesh).isMesh) meshes++;
      });
      if (meshes === 0) empty.push(rel);
    }
    expect(empty).toEqual([]);
  }, 60_000);

  it('the horse is skinned and carries its six clips', async () => {
    const gltf = await loadFromDisk(HORSE);
    const names = gltf.animations.map((a: THREE.AnimationClip) => a.name).sort();
    expect(names).toEqual(['Death', 'Idle', 'Jump', 'Run', 'Walk', 'WalkSlow']);
    let skinned = false;
    gltf.scene.traverse((o: THREE.Object3D) => {
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned = true;
    });
    expect(skinned).toBe(true);
    for (const clip of gltf.animations) expect(clip.duration).toBeGreaterThan(0);
  });

  it('gltfJson rejects a truncated copy of a committed GLB', () => {
    expect(() => gltfJson(read(HORSE)!.slice(0, 64), HORSE)).toThrow(/truncated/);
  });
});

describe('fit.json', () => {
  it('lists only provenance-tracked models, each with a positive scale', () => {
    const bad = Object.entries(fit.models).filter(([rel, f]) => !prov.files[rel] || !/\.(gltf|glb)$/.test(rel) || !(f.scale > 0));
    expect(bad).toEqual([]);
  });
  it('covers every imported model', () => {
    const missing = Object.keys(prov.files).filter((k) => /\.(gltf|glb)$/.test(k) && !fit.models[k]);
    expect(missing).toEqual([]);
  });
});
