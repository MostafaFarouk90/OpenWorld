// The scripted stand-in glbs (public/assets/env-standin, written by tools/env-pass/standins/gen-standins.ts) for the four Act 2 industry
// ids with no artist file yet: valid, within the triangle and material budgets, the target size, outside the asset manifest, wired through
// resolve.ts (real glb > stand-in > variant) and falling back to the old variant when the file cannot load.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ModelLibrary } from '../assets/swap/ModelLibrary';
import { BUILDERS, MeshBuilder, rng, STANDIN_IDS, toGlb, vnoise } from '../../tools/env-pass/standins/lib';
import { envGlbUrl, EnvModelSource, STANDIN_PREFIX } from './envSource';
import { PlacementField } from './PlacementField';
import { resolveModel, resolveStandIn, STANDINS } from './resolve';
import targets from './targets.json';
import { envDiskSource } from './testing/envDiskSource';

const DIR = 'public/assets/env-standin/';
const fsModule = 'node:fs';
let fs: any;

interface Gltf {
  meshes: Array<{ primitives: Array<{ attributes: Record<string, number>; indices: number; material: number }> }>;
  accessors: Array<{ count: number; min?: number[]; max?: number[] }>;
  materials: Array<{ name: string; emissiveFactor?: number[]; extensions?: Record<string, { emissiveStrength: number }> }>;
  extensionsUsed?: string[];
}
function parse(bytes: Uint8Array): Gltf {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  expect(dv.getUint32(0, true), 'glb magic').toBe(0x46546c67);
  expect(dv.getUint32(8, true), 'glb length').toBe(bytes.byteLength);
  const len = dv.getUint32(12, true);
  return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + len)));
}
const triangles = (g: Gltf): number => g.meshes.reduce((n, m) => n + m.primitives.reduce((k, p) => k + g.accessors[p.indices].count / 3, 0), 0);
function size(g: Gltf): { min: number[]; max: number[] } {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const m of g.meshes) for (const p of m.primitives) {
    const a = g.accessors[p.attributes.POSITION];
    for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], a.min![k]); max[k] = Math.max(max[k], a.max![k]); }
  }
  return { min, max };
}

beforeAll(async () => {
  fs = await import(/* @vite-ignore */ fsModule);
});

describe('the shipped stand-in glbs', () => {
  it('has one file per stand-in id and no others', () => {
    expect((fs.readdirSync(DIR) as string[]).sort()).toEqual(STANDIN_IDS.map((id) => `${id}.glb`).sort());
    expect([...STANDINS].sort()).toEqual([...STANDIN_IDS].sort());
  });

  it.each(STANDIN_IDS)('%s is a valid glb inside the budgets and within 10% of its target size, pivot at the base centre', (id) => {
    const g = parse(fs.readFileSync(DIR + `${id}.glb`));
    expect(triangles(g), 'triangles').toBeLessThanOrEqual(1500);
    expect(triangles(g), 'triangles').toBeGreaterThan(300);
    expect(g.materials.length, 'materials').toBeLessThanOrEqual(4);
    expect(fs.statSync(DIR + `${id}.glb`).size / 1e6, 'MB').toBeLessThanOrEqual(targets.maxFileMB);
    const t = (targets.objects as Record<string, { w: number; d: number; h: number }>)[id];
    const { min, max } = size(g);
    expect(max[0] - min[0], 'width').toBeGreaterThanOrEqual(t.w * 0.9);
    expect(max[0] - min[0], 'width').toBeLessThanOrEqual(t.w * 1.1);
    expect(max[2] - min[2], 'depth').toBeGreaterThanOrEqual(t.d * 0.9);
    expect(max[2] - min[2], 'depth').toBeLessThanOrEqual(t.d * 1.1);
    expect(max[1] - min[1], 'height').toBeGreaterThanOrEqual(t.h * 0.9);
    expect(max[1] - min[1], 'height').toBeLessThanOrEqual(t.h * 1.1);
    expect(Math.abs(min[1]), 'base on y 0').toBeLessThan(0.02);
    expect(Math.abs((min[0] + max[0]) / 2), 'x centre').toBeLessThan(0.05);
    expect(Math.abs((min[2] + max[2]) / 2), 'z centre').toBeLessThan(0.05);
  });

  it('keeps the slag heap glowing: a Glow material with emissive strength 1.5 (the glow system flickers it by name)', () => {
    const g = parse(fs.readFileSync(DIR + 'slag-heap.glb'));
    const glow = g.materials.find((m) => m.name === 'Glow');
    expect(glow?.emissiveFactor?.[0]).toBeGreaterThan(0.5);
    expect(glow?.extensions?.KHR_materials_emissive_strength.emissiveStrength).toBe(1.5);
    expect(g.extensionsUsed).toContain('KHR_materials_emissive_strength');
    for (const id of ['ore-pile', 'mine-cart', 'smelter-chimney'] as const) {
      expect(parse(fs.readFileSync(DIR + `${id}.glb`)).materials.some((m) => m.emissiveFactor), id).toBe(false);
    }
  });

  it('stays out of the asset manifest, so ENV_IDS is false for these ids and a real glb dropped in later wins', () => {
    const manifest = JSON.parse(fs.readFileSync('public/assets/env/manifest.json', 'utf8'));
    for (const id of STANDIN_IDS) {
      expect(Object.keys(manifest.objects), id).not.toContain(id);
      expect(fs.existsSync(`public/assets/env/${id}.glb`), `${id} real file`).toBe(false);
    }
  });

  it('loads through the library (ModelLibrary template with real bounds) from the stand-in prefix', async () => {
    const lib = new ModelLibrary(await envDiskSource());
    for (const id of STANDIN_IDS) {
      const t = await lib.template(`${STANDIN_PREFIX}${id}`);
      expect(t, id).not.toBeNull();
      const w = t!.bounds.max.x - t!.bounds.min.x;
      const want = (targets.objects as Record<string, { w: number }>)[id].w;
      expect(w, id).toBeGreaterThan(want * 0.9);
      expect(t!.triangles, id).toBeLessThanOrEqual(1500);
    }
  });
});

describe('resolve order: real glb > stand-in > variant', () => {
  afterEach(() => {
    vi.doUnmock('../../public/assets/env/manifest.json');
    vi.resetModules();
  });

  it('resolves the four ids to their stand-in glb', () => {
    for (const id of STANDIN_IDS) expect(resolveModel(id), id).toEqual({ source: 'env', model: `env-standin/${id}`, scale: 1 });
  });

  it('keeps the old variant or KayKit line as the stand-in of the stand-in (a failed load)', () => {
    expect(resolveStandIn('slag-heap')).toMatchObject({ source: 'env', model: 'env/rock-cluster-a', scale: 2 });
    expect(resolveStandIn('ore-pile')).toMatchObject({ source: 'env', model: 'env/rock-cluster-a' });
    expect(resolveStandIn('mine-cart')).toMatchObject({ source: 'env', model: 'env/haycart-a' });
    expect(resolveStandIn('smelter-chimney')).toMatchObject({ source: 'kaykit', model: 'hal/fence_pillar', fitHeight: 9 });
  });

  it('a real glb in the manifest wins over the stand-in', async () => {
    const real = await import('../../public/assets/env/manifest.json');
    vi.resetModules();
    vi.doMock('../../public/assets/env/manifest.json', () => ({ default: { ...real.default, objects: { ...real.default.objects, 'slag-heap': { id: 'slag-heap' } } } }));
    const mod = await import('./resolve');
    expect(mod.resolveModel('slag-heap')).toEqual({ source: 'env', model: 'env/slag-heap', scale: 1 });
    expect(mod.resolveModel('ore-pile')).toMatchObject({ model: 'env-standin/ore-pile' });
  });

  it('an -ashen suffix still draws the stand-in, tinted', () => {
    const r = resolveModel('slag-heap-ashen');
    expect(r).toMatchObject({ source: 'env', model: 'env-standin/slag-heap' });
  });

  it('falls back to the variant when the stand-in file cannot load, and never to a placeholder box', async () => {
    const disk = await envDiskSource();
    const failing = { ...disk, load: (id: string) => (id.startsWith(STANDIN_PREFIX) ? Promise.reject(new Error('404')) : disk.load(id)), instantiate: (id: string) => disk.instantiate(id) };
    const lib = new ModelLibrary(failing, () => {});
    const field = new PlacementField(lib, () => 0);
    await field.build([
      { id: 'slag-heap', x: 0, z: 0 },
      { id: 'mine-cart', x: 10, z: 0 },
    ]);
    expect(lib.hasFailed('env-standin/slag-heap')).toBe(true);
    expect(field.stats.placeholders).toBe(0);
    expect(field.stats.batches).toBeGreaterThan(0);
    field.dispose();
  });

  it('draws the stand-in glb when it loads', async () => {
    const lib = new ModelLibrary(await envDiskSource(), () => {});
    const field = new PlacementField(lib, () => 0);
    await field.build([{ id: 'slag-heap', x: 0, z: 0 }]);
    expect(field.stats.placeholders).toBe(0);
    expect(lib.peek('env-standin/slag-heap')).not.toBeNull();
    expect(lib.peek('env/rock-cluster-a')).toBeNull();
    field.dispose();
  });
});

describe('envGlbUrl and the model source', () => {
  it('maps env and stand-in ids to their folders and ignores everything else', () => {
    expect(envGlbUrl('env/oak-a', '/')).toBe('/assets/env/oak-a.glb');
    expect(envGlbUrl('env-standin/slag-heap', '/g/')).toBe('/g/assets/env-standin/slag-heap.glb');
    expect(envGlbUrl('hex/barrel', '/')).toBeNull();
    expect(envGlbUrl('environment/x', '/')).toBeNull();
  });

  it('delegates non-env ids and does not claim a pack for stand-ins', async () => {
    const delegate = { load: vi.fn(async () => undefined), instantiate: vi.fn(), packOf: vi.fn(() => 'hex') };
    const src = new EnvModelSource(delegate as never, '/');
    await src.load('hex/barrel');
    expect(delegate.load).toHaveBeenCalledWith('hex/barrel');
    expect(src.packOf('hex/barrel')).toBe('hex');
    expect(src.packOf('env-standin/slag-heap')).toBeUndefined();
    expect(() => src.instantiate('env-standin/slag-heap')).toThrow(/not loaded/);
    await expect(new EnvModelSource(undefined, '/').load('hex/barrel')).rejects.toThrow(/no source/);
  });
});

describe('the generator', () => {
  const bytes = (id: (typeof STANDIN_IDS)[number]): Uint8Array => {
    const { builder, mats } = BUILDERS[id]();
    const t = (targets.objects as Record<string, { w: number; d: number; h: number }>)[id];
    builder.fit(t.w, t.d, t.h);
    return toGlb(id, builder, mats);
  };

  it('is deterministic: the same seed writes the same bytes, another seed does not', () => {
    for (const id of STANDIN_IDS) expect(bytes(id), id).toEqual(bytes(id));
    const a = BUILDERS['ore-pile']().builder.prims.get('Rust')!.pos;
    const b = BUILDERS['ore-pile'](99).builder.prims.get('Rust')!.pos;
    expect(b).not.toEqual(a);
  });

  it('writes what is shipped (regenerate with gen-standins.ts when this fails after a generator change)', () => {
    // ingest.mjs welds and rewrites the file, so compare the geometry, not the bytes.
    for (const id of STANDIN_IDS) {
      const made = parse(bytes(id));
      const shipped = parse(fs.readFileSync(DIR + `${id}.glb`));
      expect(triangles(shipped), id).toBe(triangles(made));
      // ingest's dedup merges materials that came out identical (Slag and Clinker are both plain white with vertex colours).
      for (const m of shipped.materials) expect(made.materials.map((x) => x.name), id).toContain(m.name);
      expect(shipped.materials.length, id).toBeLessThanOrEqual(made.materials.length);
    }
  });

  it('fit puts the base on y 0 and centres the footprint (edge: an off-centre, lifted mesh)', () => {
    const b = new MeshBuilder();
    b.addTriangles('M', [5, 3, 5, 7, 3, 5, 5, 6, 9], 0xffffff);
    b.fit(2, 4, 1);
    const box = b.bounds();
    expect(box.min.y).toBeCloseTo(0);
    expect(box.max.y).toBeCloseTo(1);
    expect(box.max.x - box.min.x).toBeCloseTo(2);
    expect(box.max.z - box.min.z).toBeCloseTo(4);
    expect((box.min.x + box.max.x) / 2).toBeCloseTo(0);
  });

  it('refuses a primitive without a material spec', () => {
    const b = new MeshBuilder();
    b.addTriangles('Mystery', [0, 0, 0, 1, 0, 0, 0, 1, 0], 0xffffff);
    expect(() => toGlb('x', b, {})).toThrow(/no material spec/);
  });

  it('seeded helpers stay in range', () => {
    const r = rng(7);
    for (let i = 0; i < 200; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      const n = vnoise(i * 0.37, i * 0.11, 3, 5);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(1);
    }
  });
});
