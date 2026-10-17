import { describe, expect, it } from 'vitest';
import { TERRAIN } from '../config/constants';
import { buildChunkData } from './chunkGeometry';
import { HEIGHT_RANGE, SPAWN_BLEND_RADIUS, SPAWN_FLAT_RADIUS, heightAt } from './heightfield';
import { createNoise2D } from './noise';

/** Deterministic PRNG so the sample sets are reproducible. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

describe('createNoise2D', () => {
  it('is deterministic for the same seed and coordinates', () => {
    const a = createNoise2D(42);
    const b = createNoise2D(42);
    for (let i = 0; i < 200; i++) {
      const x = i * 0.37 - 20;
      const y = i * 0.91 + 3;
      expect(a(x, y)).toBe(b(x, y));
      expect(a(x, y)).toBe(a(x, y));
    }
  });

  it('differs between seeds', () => {
    const a = createNoise2D(1);
    const b = createNoise2D(2);
    let differing = 0;
    for (let i = 0; i < 100; i++) if (a(i * 0.53, i * 0.29) !== b(i * 0.53, i * 0.29)) differing++;
    expect(differing).toBeGreaterThan(50);
  });

  it('stays within roughly [-1, 1] and is finite', () => {
    const n = createNoise2D(7);
    const rand = lcg(1);
    for (let i = 0; i < 2000; i++) {
      const v = n((rand() - 0.5) * 1e4, (rand() - 0.5) * 1e4);
      expect(Number.isFinite(v)).toBe(true);
      expect(Math.abs(v)).toBeLessThanOrEqual(1.05);
    }
  });
});

describe('heightAt', () => {
  it('is within HEIGHT_RANGE over pseudo-random samples within 20 km', () => {
    const rand = lcg(12345);
    for (let i = 0; i < 4000; i++) {
      const x = (rand() - 0.5) * 40000;
      const z = (rand() - 0.5) * 40000;
      const h = heightAt(x, z);
      expect(Number.isFinite(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(HEIGHT_RANGE.min);
      expect(h).toBeLessThanOrEqual(HEIGHT_RANGE.max);
    }
  });

  it('is within HEIGHT_RANGE at +-1e6 coordinates', () => {
    const corners = [-1e6, 1e6];
    for (const x of corners) {
      for (const z of corners) {
        const h = heightAt(x, z);
        expect(Number.isFinite(h)).toBe(true);
        expect(h).toBeGreaterThanOrEqual(HEIGHT_RANGE.min);
        expect(h).toBeLessThanOrEqual(HEIGHT_RANGE.max);
      }
    }
    const rand = lcg(99);
    for (let i = 0; i < 500; i++) {
      const h = heightAt((rand() - 0.5) * 2e6, (rand() - 0.5) * 2e6);
      expect(Number.isFinite(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(HEIGHT_RANGE.min);
      expect(h).toBeLessThanOrEqual(HEIGHT_RANGE.max);
    }
  });

  it('is finite over pseudo-random samples within 20 km and at +-1e6', () => {
    const rand = lcg(12345);
    for (let i = 0; i < 4000; i++) {
      expect(Number.isFinite(heightAt((rand() - 0.5) * 40000, (rand() - 0.5) * 40000))).toBe(true);
    }
    for (const x of [-1e6, 1e6]) for (const z of [-1e6, 1e6]) expect(Number.isFinite(heightAt(x, z))).toBe(true);
  });

  it('stays within a loose envelope of HEIGHT_RANGE (regression guard)', () => {
    const rand = lcg(12345);
    for (let i = 0; i < 4000; i++) {
      const h = heightAt((rand() - 0.5) * 40000, (rand() - 0.5) * 40000);
      expect(h).toBeGreaterThan(HEIGHT_RANGE.min - 60);
      expect(h).toBeLessThan(HEIGHT_RANGE.max + 150);
    }
  });

  it('is deterministic', () => {
    expect(heightAt(1234.5, -987.25)).toBe(heightAt(1234.5, -987.25));
  });

  it('is exactly 0 at the origin and within SPAWN_FLAT_RADIUS, including on the radius', () => {
    expect(heightAt(0, 0)).toBe(0);
    expect(heightAt(SPAWN_FLAT_RADIUS, 0)).toBe(0);
    expect(heightAt(-SPAWN_FLAT_RADIUS, 0)).toBe(0);
    expect(heightAt(0, SPAWN_FLAT_RADIUS)).toBe(0);
    expect(heightAt(0, -SPAWN_FLAT_RADIUS)).toBe(0);
    const rand = lcg(5);
    for (let i = 0; i < 500; i++) {
      const angle = rand() * Math.PI * 2;
      const r = rand() * SPAWN_FLAT_RADIUS;
      expect(heightAt(Math.cos(angle) * r, Math.sin(angle) * r)).toBe(0);
    }
  });

  it('is not flat beyond SPAWN_BLEND_RADIUS', () => {
    const values = new Set<number>();
    let nonZero = 0;
    for (let i = 0; i < 100; i++) {
      const angle = (i / 100) * Math.PI * 2;
      const r = SPAWN_BLEND_RADIUS + 50 + i * 60;
      const h = heightAt(Math.cos(angle) * r, Math.sin(angle) * r);
      values.add(h);
      if (h !== 0) nonZero++;
    }
    expect(nonZero).toBeGreaterThan(50);
    expect(values.size).toBeGreaterThan(50);
  });

  it('leaves the meadow continuously (no jump just outside the flat radius)', () => {
    expect(Math.abs(heightAt(SPAWN_FLAT_RADIUS + 0.01, 0))).toBeLessThan(0.01);
  });
});

describe('shared chunk edges', () => {
  it('gives identical border heights for horizontally adjacent chunks', () => {
    const size = 100;
    const segments = 8;
    for (const [cx, cz] of [
      [50, 50],
      [2050, -3950],
      [-1550, 2050],
    ]) {
      const a = buildChunkData({ centerX: cx, centerZ: cz, size, segments, skirtDepth: 2 });
      const b = buildChunkData({ centerX: cx + size, centerZ: cz, size, segments, skirtDepth: 2 });
      const row = segments + 1;
      for (let j = 0; j <= segments; j++) {
        const right = (j * row + segments) * 3;
        const left = (j * row) * 3;
        expect(a.positions[right + 1]).toBe(b.positions[left + 1]);
        // Normals along the shared edge agree too, so lighting has no seam.
        expect(a.normals[right]).toBe(b.normals[left]);
        expect(a.normals[right + 1]).toBe(b.normals[left + 1]);
        expect(a.normals[right + 2]).toBe(b.normals[left + 2]);
      }
    }
  });

  it('gives identical border heights for vertically adjacent chunks', () => {
    const size = 100;
    const segments = 8;
    const a = buildChunkData({ centerX: 450, centerZ: 450, size, segments, skirtDepth: 2 });
    const b = buildChunkData({ centerX: 450, centerZ: 550, size, segments, skirtDepth: 2 });
    const row = segments + 1;
    for (let i = 0; i <= segments; i++) {
      expect(a.positions[(segments * row + i) * 3 + 1]).toBe(b.positions[i * 3 + 1]);
    }
  });

  it('uses the configured seed (sanity: TERRAIN.seed is finite)', () => {
    expect(Number.isFinite(TERRAIN.seed)).toBe(true);
  });
});
