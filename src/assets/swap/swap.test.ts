import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { ASSETS, validateManifest } from '../AssetManifest';
import { fitToBox, hashPick, tile, tileLine } from './fit';
import { ModelBatches } from './ModelBatches';
import { ModelLibrary, type ModelSource } from './ModelLibrary';
import { SWAP_ASSETS, SWAP_FIT, swapIdOf } from './swapModels';

const files = new Set(Object.keys(import.meta.glob('/public/assets/**/*.{glb,gltf}')));
const bounds = (x: number, y: number, z: number, y0 = 0) => ({ min: { x: -x / 2, y: y0, z: -z / 2 }, max: { x: x / 2, y: y0 + y, z: z / 2 } });

describe('swap manifest', () => {
  it('lists every imported model with a real file, a known pack and a fit', () => {
    const ids = Object.keys(SWAP_ASSETS);
    expect(ids.length).toBeGreaterThan(150);
    expect(validateManifest({ ...SWAP_ASSETS })).toEqual([]);
    for (const e of Object.values(SWAP_ASSETS)) expect(files.has(`/public${e.url}`), e.url).toBe(true);
    for (const id of ids) expect(SWAP_FIT[id], id).toBeDefined();
  });

  it('names models the way the plan does', () => {
    expect(swapIdOf('kaykit-medieval-hexagon/building_home_A_red.gltf')).toBe('hex/building_home_A_red');
    expect(swapIdOf('kaykit-dungeon-remastered/wall.gltf.glb')).toBe('dun/wall');
    expect(swapIdOf('kaykit-dungeon-remastered/chest.glb')).toBe('dun/chest');
    expect(swapIdOf('kaykit-adventurers/weapons/axe_2handed.gltf')).toBe('wpn/axe_2handed');
    expect(swapIdOf('quaternius-farm-animals/Horse.glb')).toBe('horse');
    expect(swapIdOf('somewhere/else.glb')).toBeNull();
    for (const id of ['hex/building_tavern_red', 'dun/wall_doorway', 'hal/crypt', 'wpn/crossbow_2handed', 'horse']) expect(SWAP_ASSETS[id], id).toBeDefined();
  });

  it('does not collide with the typed manifest ids', () => {
    for (const k of Object.keys(ASSETS)) expect(SWAP_ASSETS[k]).toBeUndefined();
  });
});

describe('fitToBox', () => {
  it('scales uniformly when the box has the model proportions and puts the base on y 0', () => {
    const f = fitToBox(bounds(1, 1, 2, 0.5), { width: 4, depth: 8, height: 4 });
    expect(f.sx).toBeCloseTo(4);
    expect(f.sy).toBeCloseTo(4);
    expect(f.sz).toBeCloseTo(4);
    expect(f.offset.y).toBeCloseTo(-2);
    expect(f.clamped).toBe(false);
  });

  it('stretches within the clamp and reports a clamp beyond it', () => {
    const ok = fitToBox(bounds(1, 1, 1), { width: 8, depth: 9 });
    expect(ok.sx).toBeCloseTo(8);
    expect(ok.sz).toBeCloseTo(9);
    expect(ok.clamped).toBe(false);
    const far = fitToBox(bounds(1, 1, 1), { width: 4, depth: 12 });
    expect(far.sz / far.sx).toBeLessThan(1.5);
    expect(far.clamped).toBe(true);
  });

  it('lets height stretch further when the policy asks (walls, towers)', () => {
    const t = { width: 4, depth: 4, height: 9 };
    expect(fitToBox(bounds(1, 1, 1), t).sy).toBeCloseTo(4 * 1.18);
    expect(fitToBox(bounds(1, 1, 1), t, { maxHeightStretch: 1.5 }).sy).toBeCloseTo(9);
  });

  it('caps the uniform scale so a door never outgrows the Knight by more than the policy allows', () => {
    const f = fitToBox(bounds(1, 1, 1), { width: 20, depth: 20 }, { maxScale: 8 });
    expect(f.sx).toBeLessThanOrEqual(8 * 1.18 + 1e-9);
    expect(f.clamped).toBe(true);
  });

  it('keeps the authored y for pivot keep and centres x and z', () => {
    const f = fitToBox({ min: { x: 0, y: -1, z: 0 }, max: { x: 2, y: 1, z: 2 } }, { width: 4, depth: 4 }, { pivot: 'keep' });
    expect(f.offset.y).toBe(0);
    expect(f.offset.x).toBeCloseTo(-2);
  });

  it('rejects empty or non-finite sizes', () => {
    expect(() => fitToBox(bounds(0, 1, 1), { width: 1, depth: 1 })).toThrow(RangeError);
    expect(() => fitToBox(bounds(1, 1, 1), { width: NaN, depth: 1 })).toThrow(RangeError);
  });
});

describe('tile', () => {
  it('cuts a footprint into cells that cover it exactly', () => {
    const cells = tile(30, 24, 7);
    expect(cells).toHaveLength(4 * 3);
    expect(cells.reduce((a, c) => a + c.w * c.d, 0)).toBeCloseTo(30 * 24);
  });

  it('always returns at least one cell and keeps only the ring when asked', () => {
    expect(tile(2, 2, 7)).toHaveLength(1);
    expect(tile(40, 40, 8, true)).toHaveLength(5 * 5 - 3 * 3);
    expect(tile(30, 10, 7, true)).toHaveLength(tile(30, 10, 7).length);
  });

  it('splits a wall run and rejects bad sizes', () => {
    const line = tileLine(84.24, 11);
    expect(line.reduce((a, l) => a + l.len, 0)).toBeCloseTo(84.24);
    expect(line[0].c).toBeLessThan(0);
    expect(() => tile(0, 1, 1)).toThrow(RangeError);
  });

  it('hashPick is stable and in range', () => {
    expect(hashPick('house-01', 2)).toBe(hashPick('house-01', 2));
    for (const id of ['a', 'house-02', 'forge.a0']) expect(hashPick(id, 3)).toBeLessThan(3);
  });
});

function fakeSource(failIds: string[] = []): ModelSource & { loads: string[] } {
  const loads: string[] = [];
  const atlas = new THREE.MeshStandardMaterial();
  return {
    loads,
    packOf: () => 'pack',
    async load(id) {
      loads.push(id);
      if (failIds.includes(id)) throw new Error('404');
    },
    instantiate(id) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2).translate(0, 1, 0), id === 'a' ? atlas : atlas.clone()));
      return g;
    },
  };
}

describe('ModelLibrary', () => {
  it('measures bounds from geometry and shares one atlas material per pack', async () => {
    const lib = new ModelLibrary(fakeSource());
    const [a, b] = await lib.preload(['a', 'b']);
    expect(a.bounds.max.y).toBeCloseTo(2);
    expect(a.triangles).toBe(12);
    expect(b.parts[0].material).toBe(a.parts[0].material);
    expect(lib.peek('a')).toBe(a);
  });

  it('loads each id once however many callers ask', async () => {
    const src = fakeSource();
    const lib = new ModelLibrary(src);
    await Promise.all([lib.template('a'), lib.template('a'), lib.template('a')]);
    expect(src.loads).toEqual(['a']);
  });

  it('returns null and warns once for a model that fails, and for no source at all', async () => {
    const warn = vi.fn();
    const lib = new ModelLibrary(fakeSource(['bad']), warn);
    expect(await lib.template('bad')).toBeNull();
    expect(await lib.template('bad')).toBeNull();
    expect(await lib.instance('bad')).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('keeping the greybox');
    expect(lib.hasFailed('bad')).toBe(true);
    expect(await new ModelLibrary(undefined).template('a')).toBeNull();
  });

  it('treats a model with no static meshes as failed', async () => {
    const warn = vi.fn();
    const src: ModelSource = { load: async () => undefined, instantiate: () => new THREE.Group() };
    expect(await new ModelLibrary(src, warn).template('empty')).toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  it('places an instance with the fit applied', async () => {
    const lib = new ModelLibrary(fakeSource());
    const t = (await lib.template('a'))!;
    const f = lib.fit(t, { width: 4, depth: 4, height: 4 });
    const obj = (await lib.instance('a', f))!;
    const box = new THREE.Box3().setFromObject(obj);
    expect(box.min.y).toBeCloseTo(0);
    expect(box.max.y).toBeCloseTo(4);
    expect(box.getSize(new THREE.Vector3()).x).toBeCloseTo(4);
  });

  it('does not build after dispose', async () => {
    const lib = new ModelLibrary(fakeSource());
    lib.dispose();
    expect(await lib.template('a')).toBeNull();
  });
});

describe('ModelBatches', () => {
  it('builds one batch per (group, model) and counts instances and triangles', async () => {
    const lib = new ModelLibrary(fakeSource());
    const [a, b] = await lib.preload(['a', 'b']);
    const batches = new ModelBatches();
    for (let i = 0; i < 5; i++) batches.add('forge', a, new THREE.Matrix4().makeTranslation(i * 10, 0, 0));
    batches.add('forge', b, new THREE.Matrix4());
    batches.add('keep', a, new THREE.Matrix4().makeTranslation(500, 0, 0));
    const { groups, stats } = batches.build();
    expect(stats).toEqual({ batches: 3, instances: 7, triangles: 7 * 12 });
    expect([...groups.keys()].sort()).toEqual(['forge', 'keep']);
    const sphere = groups.get('forge')!.userData.sphere as THREE.Sphere;
    expect(sphere.radius).toBeGreaterThan(20);
    expect(groups.get('keep')!.userData.sphere.center.x).toBeCloseTo(500, 0);
  });
});
