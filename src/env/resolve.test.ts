import { describe, expect, it } from 'vitest';
import { hueMatrix, resolveModel } from './resolve';
import targets from './targets.json';

describe('resolveModel', () => {
  it('uses the runtime copy for an id that has one', () => {
    expect(resolveModel('oak-a')).toEqual({ source: 'env', model: 'env/oak-a', scale: 1 });
  });

  it('makes variants of an existing model by id, tinted or rescaled', () => {
    const r = resolveModel('flower-patch-purple');
    expect(r).toMatchObject({ source: 'env', model: 'env/flower-patch-yellow' });
    expect(r.source === 'env' && r.tint?.hue).toBe(235);
    const b = resolveModel('boulder-large-b');
    expect(b).toMatchObject({ source: 'env', model: 'env/boulder-large-a', scale: 0.78 });
  });

  it('uses KayKit models the grids already have, with their fit factor', () => {
    const r = resolveModel('barrel');
    expect(r).toMatchObject({ source: 'kaykit', model: 'hex/barrel', scale: 4.3 });
    expect(resolveModel('post_lantern')).toMatchObject({ source: 'kaykit', model: 'hal/post_lantern' });
    expect(resolveModel('stonewall-high')).toMatchObject({ source: 'kaykit', model: 'hex/fence_stone_straight', fitHeight: 1.5 });
    expect(resolveModel('picket-fence')).toMatchObject({ source: 'kaykit', model: 'hex/fence_wood_straight', fitHeight: 1.1 });
  });

  it('falls back to a placeholder shape only when nothing matches', () => {
    expect(resolveModel('haystack-round')).toEqual({ source: 'placeholder', shape: 'haystack' });
    expect(resolveModel('signpost-a')).toEqual({ source: 'placeholder', shape: 'post' });
    expect(resolveModel('no-such-thing')).toEqual({ source: 'placeholder', shape: 'box' });
  });

  it('never leaves a targeted id unresolved', () => {
    for (const id of Object.keys(targets.objects)) expect(() => resolveModel(id), id).not.toThrow();
  });
});

describe('hueMatrix', () => {
  const apply = (m: number[], c: number[]) => [0, 1, 2].map((r) => m[r * 3] * c[0] + m[r * 3 + 1] * c[1] + m[r * 3 + 2] * c[2]);

  it('is the identity at 0 degrees and full saturation', () => {
    const m = hueMatrix(0, 1);
    [1, 0, 0, 0, 1, 0, 0, 0, 1].forEach((v, i) => expect(m[i]).toBeCloseTo(v, 6));
  });

  it('keeps grey unchanged for any hue', () => {
    for (const deg of [40, 120, 235]) expect(apply(hueMatrix(deg), [0.5, 0.5, 0.5]).every((v) => Math.abs(v - 0.5) < 0.01)).toBe(true);
  });

  it('turns yellow towards purple at +235 degrees', () => {
    const [r, g, b] = apply(hueMatrix(235), [0.9, 0.8, 0.2]);
    expect(b).toBeGreaterThan(g);
    expect(r).toBeGreaterThan(g);
  });

  it('desaturates towards grey at low saturation', () => {
    const [r, g, b] = apply(hueMatrix(0, 0.1), [0.9, 0.8, 0.2]);
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThan(0.15);
  });
});
