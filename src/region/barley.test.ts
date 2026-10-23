import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BRIGHTWATER_LAYOUT } from './brightwater.layout';
import { MAX_BARLEY_INSTANCES, ROW_SPACING, SCORCHED_KEEP, rowCentres, barleyVariantOf, buildBarley } from './barley';
import { pointInFootprint } from './geometry';
import type { FieldSpec, StructureSpec } from './layoutTypes';

const field = (over: Partial<FieldSpec> = {}): FieldSpec => ({ id: 'f', x0: 0, z0: 0, x1: 20, z1: 20, count: 500, ...over });
const flat = (): number => 1;
const positions = (g: THREE.Group): number[] => {
  const mesh = g.children[0] as THREE.InstancedMesh;
  const out: number[] = [];
  const m = new THREE.Matrix4();
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, m);
    out.push(m.elements[12], m.elements[13], m.elements[14]);
  }
  return out;
};

describe('buildBarley', () => {
  it('is deterministic per seed and differs between seeds', () => {
    const a = buildBarley([field()], flat, 3);
    const b = buildBarley([field()], flat, 3);
    const c = buildBarley([field()], flat, 4);
    expect(positions(a.object)).toEqual(positions(b.object));
    expect(positions(a.object)).not.toEqual(positions(c.object));
    expect(a.instanceCount).toBe(500);
  });

  it('keeps instances inside the field and on the terrain', () => {
    const h = buildBarley([field({ x0: 5, x1: 15 })], (x, z) => x + z);
    const p = positions(h.object);
    for (let i = 0; i < p.length; i += 3) {
      expect(p[i]).toBeGreaterThanOrEqual(5);
      expect(p[i]).toBeLessThanOrEqual(15);
      expect(p[i + 1]).toBeCloseTo(p[i] + p[i + 2]);
    }
  });

  it('returns an empty group for no fields and for zero counts', () => {
    const h = buildBarley([], flat);
    expect(h.instanceCount).toBe(0);
    expect(h.object.children).toHaveLength(0);
    expect(buildBarley([field({ count: 0 })], flat).instanceCount).toBe(0);
    h.dispose();
  });

  it('throws for inverted, degenerate or non-finite bounds', () => {
    expect(() => buildBarley([field({ x1: 0 })], flat)).toThrow(/invalid bounds/);
    expect(() => buildBarley([field({ z1: -5 })], flat)).toThrow(/invalid bounds/);
    expect(() => buildBarley([field({ x0: NaN })], flat)).toThrow(/invalid bounds/);
    expect(() => buildBarley([field({ x1: Infinity })], flat)).toThrow(/invalid bounds/);
    expect(() => buildBarley([field({ count: NaN })], flat)).toThrow(/count/);
  });

  it('respects keep-out footprints (rotated too)', () => {
    const house: StructureSpec = { id: 'h', kind: 'house', x: 10, z: 10, yawDeg: 30, footprint: [8, 6], mode: 'solid' };
    const h = buildBarley([field({ count: 3000 })], flat, 1, [house]);
    const p = positions(h.object);
    expect(p.length / 3).toBeGreaterThan(0);
    expect(p.length / 3).toBeLessThan(3000);
    for (let i = 0; i < p.length; i += 3) expect(pointInFootprint(house, p[i], p[i + 2])).toBe(false);
  });

  it('a field fully covered by a keep-out yields nothing', () => {
    const big: StructureSpec = { id: 'h', kind: 'house', x: 10, z: 10, yawDeg: 0, footprint: [100, 100], mode: 'solid' };
    expect(buildBarley([field()], flat, 1, [big]).instanceCount).toBe(0);
  });

  it('caps the total at 8000 across fields', () => {
    const h = buildBarley([field({ count: 6000 }), field({ id: 'g', count: 6000 })], flat);
    expect(h.instanceCount).toBeLessThanOrEqual(MAX_BARLEY_INSTANCES);
    expect(h.instanceCount).toBeGreaterThan(MAX_BARLEY_INSTANCES - 10);
  });

  it('builds the real layout fields clear of structures', () => {
    const h = buildBarley(BRIGHTWATER_LAYOUT.fields, flat, 1, BRIGHTWATER_LAYOUT.structures);
    expect(h.instanceCount).toBeGreaterThan(5000);
    expect(h.instanceCount).toBeLessThanOrEqual(MAX_BARLEY_INSTANCES);
  });

  it('tills the field: a soil mesh after the barley, planted on row ridges inside the border', () => {
    const f = field({ x0: 0, x1: 20 });
    const h = buildBarley([f], flat, 1);
    expect(h.object.children.map((c) => c.name)).toEqual(['barley-instances', 'barley-soil']);
    const rows = rowCentres(f);
    const p = positions(h.object);
    for (let i = 0; i < p.length; i += 3) {
      const near = Math.min(...rows.map((r) => Math.abs(r - p[i])));
      expect(near).toBeLessThanOrEqual(0.36);
    }
    expect(rows[1] - rows[0]).toBeCloseTo(ROW_SPACING);
    h.dispose();
  });

  it('dispose detaches and is idempotent', () => {
    const parent = new THREE.Group();
    const h = buildBarley([field()], flat);
    parent.add(h.object);
    h.dispose();
    h.dispose();
    expect(parent.children).toHaveLength(0);
  });
});


describe('R01 variants (world.brightwater.barley)', () => {
  const fields = [
    { id: 'barley-west', x0: 0, z0: 0, x1: 20, z1: 20, count: 400 },
    { id: 'barley-east', x0: 40, z0: 0, x1: 60, z1: 20, count: 400 },
  ];
  const flat = () => 0;
  const count = (variant: 'unset' | 'scorched' | 'saved') =>
    buildBarley(fields, flat, 1, [], { variant, variantFields: ['barley-west'] });

  it('reads the flag: only the two known words count', () => {
    expect(barleyVariantOf('scorched')).toBe('scorched');
    expect(barleyVariantOf('saved')).toBe('saved');
    for (const v of [undefined, null, '', 'burnt', 1, true, {}]) expect(barleyVariantOf(v)).toBe('unset');
  });

  it('thins only the listed field when scorched', () => {
    const base = count('unset');
    const burnt = count('scorched');
    expect(base.instanceCount).toBe(800);
    expect(burnt.instanceCount).toBe(400 + Math.floor(400 * SCORCHED_KEEP));
    base.dispose();
    burnt.dispose();
  });

  it('keeps the saved field as full as the untouched one but lusher', () => {
    const base = count('unset');
    const saved = count('saved');
    expect(saved.instanceCount).toBe(base.instanceCount);
    const colour = (h: ReturnType<typeof count>) => ((h.object.getObjectByName('barley-instances') as import('three').InstancedMesh).instanceColor!.array as Float32Array).slice(0, 3);
    expect(colour(saved)[1]).not.toBeCloseTo(colour(base)[1], 2);
    base.dispose();
    saved.dispose();
  });

  it('darkens the scorched cards', () => {
    const burnt = count('scorched');
    const base = count('unset');
    const lum = (h: ReturnType<typeof count>) => {
      const a = (h.object.getObjectByName('barley-instances') as import('three').InstancedMesh).instanceColor!.array as Float32Array;
      return (a[0] + a[1] + a[2]) / 3;
    };
    expect(lum(burnt)).toBeLessThan(lum(base));
    base.dispose();
    burnt.dispose();
  });

  it('ignores a variant when no field is listed, and an unknown field id', () => {
    const a = buildBarley(fields, flat, 1, [], { variant: 'scorched' });
    const b = buildBarley(fields, flat, 1, [], { variant: 'scorched', variantFields: ['nope'] });
    expect(a.instanceCount).toBe(800);
    expect(b.instanceCount).toBe(800);
    a.dispose();
    b.dispose();
  });
});
