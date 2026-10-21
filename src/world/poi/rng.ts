// Seeded decoration: the same POI id always gives the same piece. No Math.random anywhere under src/world/poi.
export function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export interface Rng {
  next(): number;
  range(a: number, b: number): number;
  int(a: number, b: number): number;
  pick<T>(xs: readonly T[]): T;
}

/** mulberry32 seeded from a string. */
export function makeRng(seed: string): Rng {
  let t = hashString(seed) || 1;
  const next = (): number => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (a, b) => a + (b - a) * next(),
    int: (a, b) => a + Math.floor(next() * (b - a + 1)),
    pick: (xs) => {
      if (xs.length === 0) throw new Error('rng.pick: empty list');
      return xs[Math.floor(next() * xs.length)];
    },
  };
}
