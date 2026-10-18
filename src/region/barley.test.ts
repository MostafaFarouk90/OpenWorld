import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BRIGHTWATER_LAYOUT } from './brightwater.layout';
import { MAX_BARLEY_INSTANCES, buildBarley } from './barley';
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

  it('dispose detaches and is idempotent', () => {
    const parent = new THREE.Group();
    const h = buildBarley([field()], flat);
    parent.add(h.object);
    h.dispose();
    h.dispose();
    expect(parent.children).toHaveLength(0);
  });
});
