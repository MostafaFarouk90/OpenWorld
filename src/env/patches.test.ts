// Patch rows: one placement row expands into 6 to 14 ground tufts, deterministically, and thins with the ground quality step.
import { describe, expect, it } from 'vitest';
import { ModelLibrary } from '../assets/swap/ModelLibrary';
import { classOf, DENSITY, PlacementField, type PlacementRow } from './PlacementField';
import { expandPatch, expandPatches, isPatch, PATCH_MAX, PATCH_MIN, PATCH_RADIUS, PATCHES, patchCount } from './patches';
import { resolveModel } from './resolve';

const flat = () => 0;
const patchRows = (n: number, id: string, scale: number): PlacementRow[] => Array.from({ length: n }, (_, i) => ({ id, x: (i % 40) * 2.5, z: Math.floor(i / 40) * 2.5, yaw: i, scale }));

describe('patch palettes', () => {
  it('sum to 1 and name ids that are not themselves patches', () => {
    for (const [id, pal] of Object.entries(PATCHES)) {
      expect(pal.reduce((s, p) => s + p[1], 0), id).toBeCloseTo(1, 6);
      for (const [tuft] of pal) expect(isPatch(tuft), `${id} -> ${tuft}`).toBe(false);
    }
  });

  it('expand to ground and fern ids that all resolve to a model (no placeholder), ferns as bush class', () => {
    for (const pal of Object.values(PATCHES))
      for (const [tuft] of pal) {
        expect(resolveModel(tuft).source, tuft).not.toBe('placeholder');
        expect(classOf(tuft), tuft).toBe(tuft.startsWith('fern') ? 'bush' : 'ground');
      }
  });
});

describe('expandPatch', () => {
  it('gives 6 to 14 tufts, 5 + 4 x size rounded and clamped', () => {
    const n = (scale: number) => expandPatch({ id: 'grass-patch-meadow', x: 10, z: 20, scale }).length;
    expect(n(0.1)).toBe(PATCH_MIN);
    expect(n(1)).toBe(9);
    expect(n(1.5)).toBe(11);
    expect(n(2.25)).toBe(14);
    expect(n(9)).toBe(PATCH_MAX);
    expect(patchCount({ id: 'grass-patch-ash', x: 0, z: 0 })).toBe(9);
  });

  it('keeps every tuft inside the spread radius (0.8 m x size by default, or the row s own)', () => {
    for (const scale of [0.4, 1, 1.8, 2.4]) {
      for (let i = 0; i < 40; i++) {
        const row = { id: 'grass-patch-dry', x: 100 + i * 3.7, z: -50 + i * 1.3, scale };
        for (const t of expandPatch(row)) expect(Math.hypot(t.x - row.x, t.z - row.z)).toBeLessThanOrEqual(PATCH_RADIUS * scale + 1e-9);
      }
    }
    const wide = { id: 'grass-patch-heath', x: 5, z: 5, scale: 1, spread: 3 };
    const d = expandPatch(wide).map((t) => Math.hypot(t.x - 5, t.z - 5));
    expect(Math.max(...d)).toBeLessThanOrEqual(3);
    expect(Math.max(...d)).toBeGreaterThan(1.5); // the override really widens it
  });

  it('is deterministic from the row s position and size, not from its index or its neighbours', () => {
    const row = { id: 'grass-patch-ash', x: 1234.56, z: -78.9, scale: 1.3 };
    expect(expandPatch(row)).toEqual(expandPatch({ ...row }));
    const a = expandPatches([{ id: 'barrel', x: 0, z: 0 }, row]);
    const b = expandPatches([row]);
    expect(a.slice(1)).toEqual(b);
    expect(expandPatch({ ...row, x: row.x + 0.01 })).not.toEqual(expandPatch(row));
  });

  it('spreads the palette: tufts follow the weights, with yaw and a size jitter of 0.85 to 1.15', () => {
    const tufts = patchRows(600, 'grass-patch-ash', 1.5).flatMap((r) => expandPatch(r));
    const share = (id: string) => tufts.filter((t) => t.id === id).length / tufts.length;
    expect(share('grass-clump-ash')).toBeGreaterThan(0.5);
    expect(share('grass-clump-ash')).toBeLessThan(0.66);
    expect(share('fern-ash')).toBeGreaterThan(0.17);
    expect(share('fern-ash')).toBeLessThan(0.27);
    for (const t of tufts) {
      const base = PATCHES['grass-patch-ash']!.find((p) => p[0] === t.id)![2];
      expect(t.scale! / base).toBeGreaterThanOrEqual(0.85 - 1e-9);
      expect(t.scale! / base).toBeLessThanOrEqual(1.15 + 1e-9);
      expect(t.yaw).toBeGreaterThanOrEqual(0);
      expect(t.yaw).toBeLessThan(360);
    }
  });

  it('handles the one-tuft edge case: n 1 is a single tuft on the row s own point; other rows pass through', () => {
    const one = expandPatch({ id: 'grass-patch-meadow', x: 7.25, z: -3.5, scale: 2, n: 1 });
    expect(one).toHaveLength(1);
    expect(one[0]).toMatchObject({ x: 7.25, z: -3.5 });
    expect(classOf(one[0]!.id)).toMatch(/ground|bush/);
    expect(expandPatch({ id: 'grass-patch-meadow', x: 0, z: 0, n: 0 })).toHaveLength(1); // never an empty patch
    const plain = { id: 'barrel', x: 1, z: 2, scale: 1.2 };
    expect(expandPatch(plain)).toEqual([plain]);
    expect(expandPatches([plain])[0]).toBe(plain);
  });
});

describe('PlacementField with patch rows', () => {
  it('draws the tufts, not the rows, and thins them with the ground quality step', async () => {
    const rows = patchRows(300, 'grass-patch-meadow', 1);
    const tufts = expandPatches(rows);
    expect(tufts.length).toBe(300 * 9);
    const field = new PlacementField(new ModelLibrary(undefined, () => undefined), flat);
    await field.build(rows);
    expect(field.stats.rows).toBe(tufts.length);
    const ground = tufts.filter((t) => classOf(t.id) === 'ground').length;
    const bush = tufts.filter((t) => classOf(t.id) === 'bush').length;
    expect(ground + bush).toBe(tufts.length);
    field.setDensity('high');
    expect(field.drawn()).toMatchObject({ ground, bush });
    // Each draw cell rounds its batches up, so allow one instance per batch of slack above the exact share.
    for (const step of ['medium', 'low'] as const) {
      field.setDensity(step);
      const d = field.drawn();
      const slack = field.batchCounts('ground').total;
      expect(d.ground!).toBeGreaterThanOrEqual(Math.floor(ground * DENSITY[step].ground));
      expect(d.ground!).toBeLessThanOrEqual(Math.ceil(ground * DENSITY[step].ground) + slack);
      expect(d.bush!).toBeLessThanOrEqual(Math.ceil(bush * DENSITY[step].bush) + field.batchCounts('bush').total);
    }
    expect(field.drawn().ground!).toBeLessThan(ground * 0.5);
    field.dispose();
  });

  it('keeps a lone-tuft patch as one instance', async () => {
    const field = new PlacementField(new ModelLibrary(undefined, () => undefined), flat);
    await field.build([{ id: 'grass-patch-dry', x: 3, z: 4, n: 1 }]);
    field.setDensity('high');
    expect(field.stats.rows).toBe(1);
    expect(Object.values(field.drawn()).reduce((a, b) => a + b, 0)).toBe(1);
    field.dispose();
  });
});
