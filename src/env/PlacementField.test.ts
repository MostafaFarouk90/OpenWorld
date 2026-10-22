import { describe, expect, it } from 'vitest';
import { ModelLibrary } from '../assets/swap/ModelLibrary';
import { CLASS_RANGE, classOf, DENSITY, PlacementField, priority, type PlacementRow } from './PlacementField';
import { placeholderGeometry, targetSize } from './placeholders';

const flat = () => 2;
const rows = (n: number, id: string, x0 = 0): PlacementRow[] => Array.from({ length: n }, (_, i) => ({ id, x: x0 + i, z: i * 2, yaw: i * 10 }));

describe('classOf', () => {
  it('sorts ids into the draw classes', () => {
    expect(classOf('oak-b')).toBe('tree');
    expect(classOf('bush-round-a')).toBe('bush');
    expect(classOf('boulder-large-b')).toBe('rock');
    expect(classOf('mushrooms-a')).toBe('wood');
    expect(classOf('grass-clump-c')).toBe('ground');
    expect(classOf('hedge-straight')).toBe('hedge');
    expect(classOf('barrel')).toBe('prop');
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

  it('hides a class beyond its range and shows it again near', async () => {
    const field = new PlacementField(new ModelLibrary(undefined, () => undefined), flat);
    await field.build(rows(5, 'grass-clump-a'));
    const group = field.object.children[0];
    field.update(0, 0);
    expect(group.visible).toBe(true);
    field.update(CLASS_RANGE.ground + 500, 0);
    expect(group.visible).toBe(false);
    field.update(5, 5);
    expect(group.visible).toBe(true);
    field.dispose();
  });

  it('survives an empty row list and a disposed field', async () => {
    const field = new PlacementField(new ModelLibrary(undefined, () => undefined), flat);
    await field.build([]);
    expect(field.classes()).toEqual([]);
    field.dispose();
    await expect(field.build(rows(3, 'barrel'))).resolves.toBeUndefined();
  });
});
