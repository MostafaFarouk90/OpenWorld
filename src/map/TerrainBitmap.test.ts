import { describe, expect, it } from 'vitest';
import { bitmapCacheKey, drain, localTileBounds, minimapTilePlan, tileCoversView, renderLocalTile, renderTerrainBitmap, tintForHeight } from './TerrainBitmap';
import { DEFAULT_WORLD_BOUNDS, MAP_TUNING } from './tuning';

const sampler = (x: number, z: number): number => 120 * Math.sin(x / 300) * Math.cos(z / 420) + 20;

function simClock(): { now: () => number; advance: (ms: number) => void } {
  let t = 0;
  return { now: () => t, advance: (ms) => void (t += ms) };
}

describe('renderTerrainBitmap', () => {
  const opts = { bounds: DEFAULT_WORLD_BOUNDS, width: 32, height: 32 };

  it('is deterministic for a fixed sampler', () => {
    const a = drain(renderTerrainBitmap(sampler, opts));
    const b = drain(renderTerrainBitmap(sampler, opts));
    expect(Array.from(a.pixels)).toEqual(Array.from(b.pixels));
    expect(a.pixels.length).toBe(32 * 32 * 4);
    for (let i = 3; i < a.pixels.length; i += 4) expect(a.pixels[i]).toBe(255);
    // Not a flat image.
    expect(new Set(Array.from(a.pixels)).size).toBeGreaterThan(20);
  });

  it('shades slopes: sun-facing brighter than away on the same tint', () => {
    // Sun is at -x: a plane rising towards +x faces it (brighter); falling towards +x faces away.
    const rise = drain(renderTerrainBitmap((x) => 50 + (x + 1500) * 0.3, { ...opts, width: 4, height: 4 }));
    const fall = drain(renderTerrainBitmap((x) => 50 - (x + 1500) * 0.3, { ...opts, width: 4, height: 4 }));
    const flat = drain(renderTerrainBitmap(() => 50, { ...opts, width: 4, height: 4 }));
    const lum = (b: { pixels: Uint8ClampedArray }) => b.pixels[0]! + b.pixels[1]! + b.pixels[2]!;
    expect(lum(rise)).toBeGreaterThan(lum(flat));
    expect(lum(fall)).toBeLessThan(lum(flat));
  });

  it('tints by height', () => {
    const lo: number[] = [0, 0, 0];
    const hi: number[] = [0, 0, 0];
    tintForHeight(-500, lo);
    tintForHeight(9999, hi);
    expect(lo).not.toEqual(hi);
    expect(hi[0]).toBeGreaterThan(200);
  });

  it('slices never exceed the budget and match a single pass', () => {
    const clock = simClock();
    const costPerSample = 0.1; // 0.3 ms per pixel
    const timed = (x: number, z: number): number => {
      clock.advance(costPerSample);
      return sampler(x, z);
    };
    const gen = renderTerrainBitmap(timed, { ...opts, budgetMs: 4, now: clock.now });
    let slices = 0;
    let last = 0;
    let pixels = 0;
    for (;;) {
      const start = clock.now();
      const r = gen.next();
      const used = clock.now() - start;
      expect(used).toBeLessThanOrEqual(4 + 1e-9);
      if (r.done) {
        expect(r.value.pixels.length).toBe(32 * 32 * 4);
        const single = drain(renderTerrainBitmap(sampler, opts));
        expect(Array.from(r.value.pixels)).toEqual(Array.from(single.pixels));
        break;
      }
      slices++;
      pixels += r.value.pixelsInSlice;
      expect(r.value.progress).toBeGreaterThanOrEqual(last);
      last = r.value.progress;
    }
    expect(pixels).toBe(32 * 32);
    expect(slices).toBeGreaterThan(1);
  });

  it('always makes progress even if one pixel exceeds the budget', () => {
    const clock = simClock();
    const slow = (x: number, z: number): number => {
      clock.advance(10);
      return sampler(x, z);
    };
    const gen = renderTerrainBitmap(slow, { bounds: DEFAULT_WORLD_BOUNDS, width: 3, height: 3, budgetMs: 4, now: clock.now });
    const first = gen.next();
    expect(first.done).toBe(false);
    if (!first.done) expect(first.value.pixelsInSlice).toBe(1);
    const final = drain(gen);
    expect(final.width).toBe(3);
  });

  it('rejects bad dimensions', () => {
    expect(() => renderTerrainBitmap(sampler, { ...opts, width: 0 }).next()).toThrow(RangeError);
  });
});

describe('local tile', () => {
  it('is centred on the player, snapped to the pixel grid', () => {
    const b = localTileBounds(1000.4, -500.9);
    const span = MAP_TUNING.minimapTilePixels * MAP_TUNING.minimapMetresPerPixel;
    expect(b.maxX - b.minX).toBeCloseTo(span, 9);
    expect(b.maxZ - b.minZ).toBeCloseTo(span, 9);
    expect((b.minX + b.maxX) / 2).toBeCloseTo(1000, 0);
    expect(((b.minX + b.maxX) / 2) % MAP_TUNING.minimapMetresPerPixel).toBeCloseTo(0, 9);
    // Nearby player positions in the same pixel share a tile (no shimmer).
    expect(localTileBounds(1000.4, 0)).toEqual(localTileBounds(1000.9, 0));
  });

  it('renders the default tile size and matches the full renderer on the same bounds', () => {
    const tile = drain(renderLocalTile(sampler, 100, 100, { pixels: 16 }));
    expect(tile.width).toBe(16);
    const same = drain(renderTerrainBitmap(sampler, { bounds: tile.bounds, width: 16, height: 16 }));
    expect(Array.from(tile.pixels)).toEqual(Array.from(same.pixels));
    const def = drain(renderLocalTile(() => 10, 0, 0));
    expect(def.pixels.length).toBe(MAP_TUNING.minimapTilePixels ** 2 * 4);
  });
});

describe('bitmapCacheKey', () => {
  it('differs by version, bounds and resolution', () => {
    const k = bitmapCacheKey('v1', DEFAULT_WORLD_BOUNDS, 256, 256);
    expect(bitmapCacheKey('v1', DEFAULT_WORLD_BOUNDS, 256, 256)).toBe(k);
    expect(bitmapCacheKey('v2', DEFAULT_WORLD_BOUNDS, 256, 256)).not.toBe(k);
    expect(bitmapCacheKey('v1', { ...DEFAULT_WORLD_BOUNDS, maxX: 1 }, 256, 256)).not.toBe(k);
    expect(bitmapCacheKey('v1', DEFAULT_WORLD_BOUNDS, 128, 256)).not.toBe(k);
  });
});

describe('minimap tile coverage', () => {
  const tile = { centerX: 1000, centerZ: 1000 };
  const half = (MAP_TUNING.minimapTilePixels * MAP_TUNING.minimapMetresPerPixel) / 2;
  it('the tile is wider than the circle, so the refresh distance never exposes black', () => {
    expect(half - MAP_TUNING.minimapViewMetres / 2).toBeGreaterThanOrEqual(MAP_TUNING.minimapRefreshDistance);
    // at the refresh distance (worst case on a diagonal axis) the circle is still covered
    expect(minimapTilePlan(tile, 1000 + MAP_TUNING.minimapRefreshDistance - 1, 1000)).toBe('ok');
    expect(tileCoversView(1000, 1000, half, 1000 + MAP_TUNING.minimapRefreshDistance, 1000, MAP_TUNING.minimapViewMetres / 2)).toBe(true);
  });
  it('plans a normal refresh past the refresh distance', () => {
    expect(minimapTilePlan(tile, 1000 + MAP_TUNING.minimapRefreshDistance + 1, 1000)).toBe('refresh');
  });
  it('plans an urgent rebuild when the circle is no longer covered, and when there is no tile', () => {
    expect(minimapTilePlan(tile, 1000 + 500, 1000)).toBe('urgent');
    expect(minimapTilePlan(tile, 1000, 1000 - half)).toBe('urgent');
    expect(minimapTilePlan(null, 0, 0)).toBe('urgent');
  });
});
