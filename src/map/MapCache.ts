// Small LRU cache for rendered terrain bitmaps, keyed by bitmapCacheKey(version, bounds, resolution).

import { MAP_TUNING } from './tuning';

export class MapCache<T> {
  private readonly entries = new Map<string, { version: string; value: T }>();

  constructor(private readonly maxEntries: number = MAP_TUNING.cacheMaxEntries) {}

  get size(): number {
    return this.entries.size;
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  /** Returns the cached value and marks it most recently used. */
  get(key: string): T | undefined {
    const e = this.entries.get(key);
    if (!e) return undefined;
    this.entries.delete(key);
    this.entries.set(key, e);
    return e.value;
  }

  /** `version` is the terrain version the key was built from, for invalidateExcept. */
  set(key: string, value: T, version = ''): void {
    this.entries.delete(key);
    this.entries.set(key, { version, value });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value as string;
      this.entries.delete(oldest);
    }
  }

  /** Drop every entry whose terrain version differs from `current`. Returns how many were dropped. */
  invalidateExcept(current: string): number {
    let n = 0;
    for (const [k, e] of this.entries) {
      if (e.version !== current) {
        this.entries.delete(k);
        n++;
      }
    }
    return n;
  }

  delete(key: string): boolean {
    return this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }
}
