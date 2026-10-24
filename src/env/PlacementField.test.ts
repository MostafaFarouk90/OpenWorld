import { describe, expect, it } from 'vitest';
import { ModelLibrary } from '../assets/swap/ModelLibrary';
import { CLASS_RANGE, classOf, DENSITY, GROUND_RANGE_SCALE, PlacementField, priority, type PlacementRow } from './PlacementField';
import { placeholderGeometry, targetSize } from './placeholders';

const flat = () => 2;
// all rows inside one 64 m draw cell, so per-batch rounding does not blur the density arithmetic
const rows = (n: number, id: string, x0 = 0): PlacementRow[] => Array.from({ length: n }, (_, i) => ({ id, x: x0 + (i % 50), z: Math.floor(i / 50) * 2, yaw: i * 10 }));

describe('classOf', () => {
  it('sorts ids into the draw classes', () => {
    expect(classOf('oak-b')).toBe('tree');
    expect(classOf('bush-round-a')).toBe('bush');
    expect(classOf('boulder-large-b')).toBe('rock');
    expect(classOf('mushrooms-a')).toBe('wood');
    expect(classOf('grass-clump-c')).toBe('ground');
    expect(classOf('hedge-straight')).toBe('hedge');
    expect(classOf('barrel')).toBe('prop');
    expect(classOf('willow-a')).toBe('tree');
    expect(classOf('reeds-b')).toBe('bush');
  });
});

describe('priority', () => {
  it('is deterministic and spread over 0 to 1', () => {
    expect(priority(5)).toBe(priority(5));
    const v = Array.from({ length: 200 }, (_, i) => priority(i));
    expect(Math.min(...v)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...v)).toBeLessThan(1);
    expect(new Set(v).size).toBe(200);
  });
});

describe('placeholder geometry', () => {
  it('matches the target size of the id and stands on y 0', () => {
    for (const [id, shape] of [['oak-b', 'tree'], ['bush-round-b', 'bush'], ['haystack-round', 'haystack'], ['signpost-a', 'post']] as const) {
      const g = placeholderGeometry(id, shape);
      g.computeBoundingBox();
      const t = targetSize(id);
      expect(g.boundingBox!.min.y, id).toBeGreaterThanOrEqual(-1e-4);
      expect(g.boundingBox!.max.y, id).toBeGreaterThan(t.h * 0.6);
      expect(g.boundingBox!.max.y, id).toBeLessThanOrEqual(t.h * 1.02);
    }
  });
});

describe('PlacementField without a model source', () => {
  it('draws every row as a placeholder and counts them', async () => {
    const field = new PlacementField(new ModelLibrary(undefined, () => undefined), flat);
    field.setDensity('high');
    await field.build([...rows(40, 'oak-b'), ...rows(10, 'grass-clump-b'), ...rows(5, 'barrel')]);
    expect(field.stats.rows).toBe(55);
    expect(field.stats.placeholders).toBe(55);
    expect(field.classes().sort()).toEqual(['ground', 'prop', 'tree']);
    expect(field.drawn()).toMatchObject({ tree: 40, ground: 10, prop: 5 });
    field.dispose();
  });

  it('puts instances on the ground height and applies yaw and scale', async () => {
    const field = new PlacementField(new ModelLibrary(undefined, () => undefined), () => 7);
    await field.build([{ id: 'barrel', x: 3, z: 4, yaw: 90, scale: 2 }]);
    const mesh = (field.object.children[0].children[0] as import('three').Group).children[0] as import('three').InstancedMesh;
    const m = new (await import('three')).Matrix4();
    mesh.getMatrixAt(0, m);
    const p = new (await import('three')).Vector3().setFromMatrixPosition(m);
    expect([p.x, p.y, p.z]).toEqual([3, 7, 4]);
    expect(new (await import('three')).Vector3().setFromMatrixScale(m).x).toBeCloseTo(2);
    field.dispose();
  });

  it('stretches a variant in height and widens it by its girth (reeds from the grass clump)', async () => {
    const THREE = await import('three');
    // A source that serves a 1 m box for every env model, so the variant resolves to a real (non-placeholder) model.
    const source = { load: async () => undefined, instantiate: () => new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()) };
    const field = new PlacementField(new ModelLibrary(source, () => undefined), flat);
    await field.build([{ id: 'reeds-a', x: 0, z: 0, scale: 1 }]);
    expect(field.stats.placeholders).toBe(0);
    const mesh = (field.object.children[0].children[0] as import('three').Group).children[0] as import('three').InstancedMesh;
    const m = new THREE.Matrix4();
    mesh.getMatrixAt(0, m);
    const sc = new THREE.Vector3().setFromMatrixScale(m);
    expect(sc.y / sc.x).toBeCloseTo(2.6 / 1.9);
    expect(sc.x).toBeCloseTo(sc.z);
    field.dispose();
  });

  it('thins by quality step, always dropping the same instances', async () => {
    const field = new PlacementField(new ModelLibrary(undefined, () => undefined), flat);
    await field.build(rows(100, 'grass-clump-a'));
    field.setDensity('high');
    expect(field.drawn().ground).toBe(100);
    field.setDensity('low');
    expect(field.drawn().ground).toBe(Math.ceil(100 * DENSITY.low.ground));
    field.setDensity('medium');
    expect(field.drawn().ground).toBe(Math.ceil(100 * DENSITY.medium.ground));
    field.dispose();
  });

  it('hides far cells of a class while the player stands inside the tile', async () => {
    const field = new PlacementField(new ModelLibrary(undefined, () => undefined), flat);
    // ground cover spread over 600 m: far cells must hide although the player is inside the covered area
    await field.build([0, 150, 300, 450, 600].map((x) => ({ id: 'grass-clump-a', x, z: 0 })));
    field.update(0, 0);
    const c = field.batchCounts('ground');
    expect(c.total).toBe(5);
    expect(c.visible).toBeGreaterThan(0);
    expect(c.visible).toBeLessThan(c.total);
    expect(field.drawn(true).ground).toBeLessThan(field.drawn().ground);
    field.update(CLASS_RANGE.ground + 5000, 0);
    expect(field.batchCounts('ground').visible).toBe(0);
    field.update(300, 0);
    expect(field.batchCounts('ground').visible).toBeGreaterThan(0);
    field.dispose();
  });

  it('draws ground cover out to 56 m at high, 48 m at medium and 36 m at low quality', async () => {
    expect(CLASS_RANGE.ground).toBe(56);
    expect(CLASS_RANGE.ground * GROUND_RANGE_SCALE.medium).toBeCloseTo(48, 9);
    expect(CLASS_RANGE.ground * GROUND_RANGE_SCALE.low).toBeCloseTo(36, 9);
    const field = new PlacementField(new ModelLibrary(undefined, () => undefined), flat);
    await field.build([{ id: 'grass-clump-a', x: 52, z: 0 }]);
    field.setDensity('high');
    field.update(0, 0);
    expect(field.batchCounts('ground').visible).toBe(1);
    field.setDensity('medium');
    field.update(0, 0);
    expect(field.batchCounts('ground').visible).toBe(0);
    field.dispose();
  });

  it('keeps instance matrices when density changes and applies the set density to a late build', async () => {
    const field = new PlacementField(new ModelLibrary(undefined, () => undefined), flat);
    field.setDensity('low');
    await field.build(rows(100, 'grass-clump-a'));
    expect(field.drawn().ground).toBe(Math.ceil(100 * DENSITY.low.ground));
    const mesh = (field.object.children[0].children[0] as import('three').Group).children[0] as import('three').InstancedMesh;
    const before = Array.from(mesh.instanceMatrix.array.slice(0, 16));
    field.setDensity('high');
    field.setDensity('low');
    expect(Array.from(mesh.instanceMatrix.array.slice(0, 16))).toEqual(before);
    field.dispose();
  });

  it('disposing during an in-flight build leaves nothing in the scene', async () => {
    const field = new PlacementField(new ModelLibrary(undefined, () => undefined), flat);
    const done = field.build([...rows(10, 'oak-b'), ...rows(10, 'barrel')]);
    field.dispose();
    await done;
    expect(field.classes()).toEqual([]);
    expect(field.object.parent).toBeNull();
  });

  it('survives an empty row list and a disposed field', async () => {
    const field = new PlacementField(new ModelLibrary(undefined, () => undefined), flat);
    await field.build([]);
    expect(field.classes()).toEqual([]);
    field.dispose();
    await expect(field.build(rows(3, 'barrel'))).resolves.toBeUndefined();
  });
});
