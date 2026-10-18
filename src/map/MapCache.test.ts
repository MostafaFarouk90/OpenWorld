import { describe, expect, it } from 'vitest';
import { MapCache } from './MapCache';
import { bitmapCacheKey } from './TerrainBitmap';
import { DEFAULT_WORLD_BOUNDS } from './tuning';

describe('MapCache', () => {
  it('hits and misses', () => {
    const c = new MapCache<string>();
    const key = bitmapCacheKey('v1', DEFAULT_WORLD_BOUNDS, 256, 256);
    expect(c.get(key)).toBeUndefined();
    c.set(key, 'bitmap', 'v1');
    expect(c.get(key)).toBe('bitmap');
    expect(c.has(key)).toBe(true);
    expect(c.get(bitmapCacheKey('v1', DEFAULT_WORLD_BOUNDS, 128, 128))).toBeUndefined();
    expect(c.get(bitmapCacheKey('v2', DEFAULT_WORLD_BOUNDS, 256, 256))).toBeUndefined();
  });

  it('evicts least recently used', () => {
    const c = new MapCache<number>(2);
    c.set('a', 1);
    c.set('b', 2);
    c.get('a');
    c.set('c', 3);
    expect(c.has('b')).toBe(false);
    expect(c.has('a')).toBe(true);
    expect(c.size).toBe(2);
  });

  it('invalidates other terrain versions', () => {
    const c = new MapCache<number>();
    c.set('a', 1, 'v1');
    c.set('b', 2, 'v1');
    c.set('c', 3, 'v2');
    expect(c.invalidateExcept('v2')).toBe(2);
    expect(c.size).toBe(1);
    expect(c.get('c')).toBe(3);
  });

  it('overwrites, deletes and clears', () => {
    const c = new MapCache<number>();
    c.set('a', 1);
    c.set('a', 2);
    expect(c.size).toBe(1);
    expect(c.get('a')).toBe(2);
    expect(c.delete('a')).toBe(true);
    c.set('b', 1);
    c.clear();
    expect(c.size).toBe(0);
  });
});
