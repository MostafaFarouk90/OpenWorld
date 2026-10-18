import { describe, expect, it } from 'vitest';
import { bitmapCacheKey } from './TerrainBitmap';
import { FogGrid, buildMarkers, hitTestMarker, mapExtent, mapToWorld, worldToMap } from './MapModel';
import { DEFAULT_WORLD_BOUNDS, LEGACY_V1_BOUNDS, MAP_TUNING } from './tuning';

const WIDE = { minX: -2000, maxX: 10500, minZ: -2000, maxZ: 4500 };

describe('non-square, off-origin bounds', () => {
  it('the default is the widened world with the v1 origin', () => {
    expect(DEFAULT_WORLD_BOUNDS).toEqual(WIDE);
    expect(MAP_TUNING.fogCellSize).toBe(50);
  });

  it('keeps the aspect: the longer edge is `size`, one metre is the same on both axes', () => {
    const e = mapExtent(WIDE, 640);
    expect(e.width).toBe(640);
    expect(e.height).toBe(Math.round((640 * 6500) / 12500));
    const a = worldToMap(0, 0, WIDE, 640);
    const b = worldToMap(1000, 1000, WIDE, 640);
    expect(b.u - a.u).toBeCloseTo(b.v - a.v, 9);
    expect(worldToMap(WIDE.maxX, WIDE.maxZ, WIDE, 640).u).toBeCloseTo(640, 9);
  });

  it('round trips world -> map -> world', () => {
    for (const [x, z] of [[-2000, -2000], [0, 0], [6800, 900], [1100, -150], [10500, 4500], [-1234.5, 4321]] as const) {
      const p = worldToMap(x, z, WIDE, 640);
      const w = mapToWorld(p.u, p.v, WIDE, 640);
      expect(w.x).toBeCloseTo(x, 6);
      expect(w.z).toBeCloseTo(z, 6);
    }
    const tall = { minX: 100, maxX: 300, minZ: -500, maxZ: 1500 };
    const p = worldToMap(200, 500, tall, 400);
    expect(p).toEqual({ u: 20, v: 200 });
    expect(mapToWorld(p.u, p.v, tall, 400)).toEqual({ x: 200, z: 500 });
  });

  it('does not clamp markers outside the bounds', () => {
    const p = worldToMap(-3000, 6000, WIDE, 640);
    expect(p.u).toBeLessThan(0);
    expect(p.v).toBeGreaterThan(mapExtent(WIDE, 640).height);
    const m = buildMarkers({ waystones: [], poi: [{ id: 'far', x: 20000, z: -9000 }] });
    expect(m).toHaveLength(1);
    const q = worldToMap(20000, -9000, WIDE, 640);
    expect(hitTestMarker(m, q.u, q.v, WIDE, 640)?.id).toBe('far');
    expect(hitTestMarker(m, 10, 10, WIDE, 640)).toBeNull();
  });

  it('terrain cache key includes the bounds', () => {
    const k = bitmapCacheKey('v1', WIDE, 256, 145);
    expect(bitmapCacheKey('v1', LEGACY_V1_BOUNDS, 256, 145)).not.toBe(k);
    expect(bitmapCacheKey('v1', { ...WIDE, maxZ: 4501 }, 256, 145)).not.toBe(k);
    expect(bitmapCacheKey('v1', { ...WIDE }, 256, 145)).toBe(k);
  });
});

describe('fog migration v1 -> v2', () => {
  const v1 = () => FogGrid.forBounds(LEGACY_V1_BOUNDS);
  const v2 = FogGrid.forBounds(WIDE).spec;

  it('copies each revealed cell into the new grid', () => {
    const old = v1();
    old.reveal(0, 0, 150);
    old.reveal(-1900, 1900, 100);
    old.reveal(1950, -1950, 60);
    const grown = FogGrid.migrate(old.encode(), v2);
    expect(grown.cols).toBe(250);
    expect(grown.revealedCount).toBe(old.revealedCount);
    for (let r = 0; r < old.rows; r++) {
      for (let c = 0; c < old.cols; c++) expect(grown.isCellRevealed(c, r)).toBe(old.isCellRevealed(c, r));
    }
    expect(grown.isRevealed(0, 0)).toBe(true);
    expect(grown.isRevealed(5000, 3000)).toBe(false);
  });

  it('a same-shape save loads unchanged', () => {
    const g = FogGrid.forBounds(WIDE);
    g.reveal(6800, 900, 200);
    expect(FogGrid.migrate(g.encode(), v2).revealedCount).toBe(g.revealedCount);
  });

  it('an empty v1 grid migrates to an empty grid of the new shape', () => {
    const g = FogGrid.migrate(v1().encode(), v2);
    expect(g.revealedCount).toBe(0);
    expect(g.cols).toBe(250);
  });

  it('corrupt, short, wrong-type or misaligned payloads give an empty grid and never throw', () => {
    const old = v1();
    old.reveal(0, 0, 150);
    const good = old.encode();
    for (const bad of [undefined, null, 5, {}, '', 'not base64!!', good.slice(0, 8), good.slice(0, good.length - 8), btoa('xx')]) {
      const g = FogGrid.migrate(bad, v2);
      expect(g.revealedCount).toBe(0);
      expect(g.cols).toBe(250);
      expect(g.rows).toBe(130);
    }
    const odd = FogGrid.forBounds({ minX: -2010, maxX: 1990, minZ: -2000, maxZ: 2000 });
    odd.reveal(0, 0, 100);
    expect(FogGrid.migrate(odd.encode(), v2).revealedCount).toBe(0);
    expect(FogGrid.migrate(FogGrid.forBounds(LEGACY_V1_BOUNDS, 100).encode(), v2).revealedCount).toBe(0);
  });

  it('cells that fall outside the new grid are dropped, the rest kept', () => {
    const small = FogGrid.forBounds({ minX: -2000, maxX: -1000, minZ: -2000, maxZ: -1000 });
    const wide = FogGrid.forBounds(LEGACY_V1_BOUNDS);
    wide.reveal(-1990, -1990, 40);
    wide.reveal(1000, 1000, 40);
    const m = FogGrid.migrate(wide.encode(), small.spec);
    expect(m.isRevealed(-1990, -1990)).toBe(true);
    expect(m.revealedCount).toBeGreaterThan(0);
    expect(m.revealedCount).toBeLessThan(wide.revealedCount);
  });
});
