import { describe, expect, it } from 'vitest';
import { MAP_TO_ENGINE_OFFSET, REGION_BOXES_MAP, regionAt } from './regionMask';

const box = REGION_BOXES_MAP.brightwater;
const ex0 = box.x0 + MAP_TO_ENGINE_OFFSET.x;
const ez0 = box.z0 + MAP_TO_ENGINE_OFFSET.z;
const ex1 = box.x1 + MAP_TO_ENGINE_OFFSET.x;
const ez1 = box.z1 + MAP_TO_ENGINE_OFFSET.z;

describe('regionAt', () => {
  it('knows the tutorial spawn and the whole tutorial footprint are Brightwater', () => {
    for (const [x, z] of [[0, 0], [52, 60], [-45, 120], [0, 420]]) {
      expect(regionAt(x, z)).toEqual({ id: 'brightwater', levelBand: { min: 1, max: 9 }, track: 'barley-and-brazier' });
    }
  });

  it('includes the min edge and excludes the max edge', () => {
    expect(regionAt(ex0, ez0)?.id).toBe('brightwater');
    expect(regionAt(ex0 - 0.001, ez0)).toBeNull();
    expect(regionAt(ex0, ez0 - 0.001)).toBeNull();
    expect(regionAt(ex1, 0)).toBeNull();
    expect(regionAt(ex1 - 0.001, ez1 - 0.001)?.id).toBe('brightwater');
    expect(regionAt(0, ez1)).toBeNull();
  });

  it('is null in the far world and for non-finite input', () => {
    expect(regionAt(12_000, 9_000)).toBeNull();
    expect(regionAt(-50_000, -50_000)).toBeNull();
    expect(regionAt(Number.NaN, 0)).toBeNull();
    expect(regionAt(0, Number.POSITIVE_INFINITY)).toBeNull();
    expect(regionAt(Number.NEGATIVE_INFINITY, 0)).toBeNull();
  });

  it('is the design box size, 6 km by 5 km', () => {
    expect(ex1 - ex0).toBe(6000);
    expect(ez1 - ez0).toBe(5000);
  });

  it('returns a fresh object each time so callers cannot corrupt the table', () => {
    const a = regionAt(0, 0)!;
    a.levelBand.max = 99;
    expect(regionAt(0, 0)!.levelBand.max).toBe(9);
  });

  it('is cheap enough to call per frame', () => {
    const t = performance.now();
    for (let i = 0; i < 100_000; i++) regionAt(i % 7000, (i * 3) % 6000);
    expect(performance.now() - t).toBeLessThan(500);
  });
});
