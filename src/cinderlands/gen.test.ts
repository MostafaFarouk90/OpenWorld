import { describe, expect, it, afterEach } from 'vitest';
import { boardMaxHeat, heatMultiplier, modifiersAt, riftWalkCap, runLevel, secondHearthHeat } from './heat';
import { formatSeed, parseSeed, runSeedValue, seededRng, type RunSeed } from './seed';
import { buildManifest, POI_SPACING, POI_EDGE_MARGIN } from './poi';
import { FULL_MODE_RADIUS, RIFT_WALK_RADIUS, SITE, SITE_BOX, isRiftTerrainParams, type RiftTerrainParams } from './domain';
import { riftHeightAt, setRiftTerrain, riftOverride } from './terrain';
import { heightAt } from '../terrain/heightfield';
import { buildChunkData } from '../terrain/chunkGeometry';
import { handleChunkMessage } from '../terrain/workers/terrain.worker';
import { validateChunkRequest } from '../terrain/workerProtocol';
import { touchesSiteBox } from '../terrain/TerrainManager';

afterEach(() => setRiftTerrain(null));

describe('heat', () => {
  it('scales linearly (design 12.4 table)', () => {
    expect(heatMultiplier(1)).toBe(1);
    expect(heatMultiplier(10)).toBeCloseTo(1.72);
    expect(heatMultiplier(25)).toBeCloseTo(2.92);
    expect(heatMultiplier(50)).toBeCloseTo(4.92);
  });
  it('reads bad Heat as 1', () => {
    expect(heatMultiplier(NaN)).toBe(1);
    expect(heatMultiplier(-3)).toBe(1);
  });
  it('caps Rift Walks at 3 + W', () => {
    expect(riftWalkCap(1)).toBe(4);
    expect(riftWalkCap(3)).toBe(6);
    expect(riftWalkCap(6)).toBe(9);
    expect(riftWalkCap(7)).toBe(10);
    expect(riftWalkCap(99)).toBe(11);
    expect(boardMaxHeat(9, 1, false)).toBe(4);
    expect(boardMaxHeat(2, 7, false)).toBe(2);
    expect(boardMaxHeat(30, 8, true)).toBe(24);
    expect(boardMaxHeat(0, 0, false)).toBe(1);
  });
  it('spills the capped part of a biome offset into Heat', () => {
    expect(runLevel(40, 3, 10)).toEqual({ level: 40, heat: 13 });
    expect(runLevel(40, -1, 10)).toEqual({ level: 39, heat: 10 });
    expect(runLevel(38, 3, 10)).toEqual({ level: 40, heat: 11 });
    expect(runLevel(39, 0, 4)).toEqual({ level: 39, heat: 4 });
    expect(runLevel(1, -1, 1)).toEqual({ level: 1, heat: 1 });
  });
  it('switches modifiers on every five Heat', () => {
    expect(modifiersAt(4)).toEqual([]);
    expect(modifiersAt(5)).toEqual(['burning']);
    expect(modifiersAt(10)).toEqual(['burning', 'armoured']);
    expect(modifiersAt(24)).toEqual(['burning', 'armoured', 'swift', 'phoenix']);
  });
  it('gives Second Hearth cycles 1 + 2k + W', () => {
    expect(secondHearthHeat(1, 0)).toBe(3);
    expect(secondHearthHeat(1, 7)).toBe(10);
    expect(secondHearthHeat(2, 0)).toBe(5);
    expect(secondHearthHeat(0, 3)).toBe(4);
  });
});

describe('seed codes', () => {
  const s: RunSeed = { classId: 'emberwright', biome: 'ashfield', hex: 0xd41b, heat: 3 };
  it('round trips', () => {
    const code = formatSeed(s);
    expect(code).toMatch(/^EMBR-ASH-D41B-[0-9A-Z]$/);
    expect(parseSeed(code, 3)).toEqual({ ok: true, seed: s });
    expect(parseSeed(code.toLowerCase(), 3)).toEqual({ ok: true, seed: s });
  });
  it('refuses a wrong Heat, a typo and a Heat above the cap', () => {
    const code = formatSeed(s);
    const wrongHeat = [1, 2, 4, 5, 6].map((h) => parseSeed(code, h));
    expect(wrongHeat.filter((r) => r.ok).length).toBeLessThanOrEqual(1); // one in 25 may collide
    expect(parseSeed(code, 3, 2)).toEqual({ ok: false, reason: 'heat' });
    expect(parseSeed('EMBR-ASH-D41', 3)).toEqual({ ok: false, reason: 'format' });
    expect(parseSeed('XXXX-ASH-D41B-1', 3)).toEqual({ ok: false, reason: 'class' });
    expect(parseSeed('EMBR-ZZZ-D41B-1', 3)).toEqual({ ok: false, reason: 'biome' });
    expect(parseSeed('EMBR-MAG-D41B-1', 3)).toEqual({ ok: false, reason: 'unavailable' });
  });
  it('gives each code its own run seed and a deterministic rng', () => {
    expect(runSeedValue(s)).toBe(runSeedValue({ ...s }));
    expect(runSeedValue(s)).not.toBe(runSeedValue({ ...s, hex: 0xd41c }));
    const a = seededRng(42, 'x');
    const b = seededRng(42, 'x');
    expect([a.next(), a.next()]).toEqual([b.next(), b.next()]);
    expect(seededRng(42, 'y').next()).not.toBe(seededRng(42, 'x').next());
  });
});

const P: RiftTerrainParams = { seed: 123456789, biome: 'ashfield', radius: RIFT_WALK_RADIUS };

describe('points of interest', () => {
  it('is deterministic, spaced and inside the domain', () => {
    const m = buildManifest(P);
    const again = buildManifest({ ...P });
    expect(again).toBe(m);
    expect(m.pois.length).toBeGreaterThan(8);
    for (const p of m.pois) {
      expect(Math.hypot(p.x - SITE.x, p.z - SITE.z)).toBeLessThanOrEqual(RIFT_WALK_RADIUS - POI_EDGE_MARGIN);
      for (const q of m.pois) if (q !== p) expect(Math.hypot(p.x - q.x, p.z - q.z)).toBeGreaterThanOrEqual(POI_SPACING);
    }
  });
  it('puts exactly one Warden at the POI furthest from the entry', () => {
    const m = buildManifest(P);
    const wardens = m.pois.filter((p) => p.type === 'warden');
    expect(wardens.length).toBe(1);
    const d = (p: { x: number; z: number }) => Math.hypot(p.x - m.entry.x, p.z - m.entry.z);
    for (const p of m.pois) expect(d(p)).toBeLessThanOrEqual(d(wardens[0]));
  });
  it('differs by seed and fills the full-mode radius within budget', () => {
    expect(buildManifest({ ...P, seed: 7 }).pois.map((p) => p.id)).not.toEqual(buildManifest(P).pois.map((p) => p.id));
    const t0 = performance.now();
    const big = buildManifest({ ...P, seed: 99, radius: FULL_MODE_RADIUS });
    expect(performance.now() - t0).toBeLessThan(250);
    expect(big.pois.length).toBeGreaterThan(buildManifest(P).pois.length);
  });
});

describe('rift terrain', () => {
  it('leaves the world shape alone with no rift, and outside the site with one', () => {
    const pts: Array<[number, number]> = [[0, 0], [965, -165], [11000, 8000], [22000, 10000]];
    const before = pts.map(([x, z]) => heightAt(x, z));
    const siteBefore = heightAt(SITE.x, SITE.z);
    setRiftTerrain(P);
    expect(pts.map(([x, z]) => heightAt(x, z))).toEqual(before);
    expect(riftOverride(SITE_BOX.x0 - 1, SITE.z)).toBeUndefined();
    expect(heightAt(SITE.x + 10, SITE.z + 10)).toBe(riftHeightAt(SITE.x + 10, SITE.z + 10, P));
    setRiftTerrain(null);
    expect(heightAt(SITE.x, SITE.z)).toBe(siteBefore);
  });
  it('is the same for the same seed, different for another, with a wall past the radius', () => {
    const at = (p: RiftTerrainParams) => riftHeightAt(SITE.x + 300, SITE.z - 200, p);
    expect(at(P)).toBe(at({ ...P }));
    expect(at(P)).not.toBe(at({ ...P, seed: 5 }));
    const inside = riftHeightAt(SITE.x + RIFT_WALK_RADIUS * 0.5, SITE.z, P);
    const wall = riftHeightAt(SITE.x + RIFT_WALK_RADIUS + 200, SITE.z, P);
    expect(wall - inside).toBeGreaterThan(60);
  });
  it('flattens pads under the entry and POIs', () => {
    const m = buildManifest(P);
    for (const p of [m.entry, ...m.pois.slice(0, 4)]) {
      const c = riftHeightAt(p.x, p.z, P);
      expect(Math.abs(riftHeightAt(p.x + 20, p.z, P) - c)).toBeLessThan(1e-6);
      expect(Math.abs(riftHeightAt(p.x, p.z - 20, P) - c)).toBeLessThan(1e-6);
    }
  });
  it('builds the same chunk in the worker as on the main thread', () => {
    const req = { centerX: SITE.x + 50, centerZ: SITE.z - 50, size: 100, segments: 8, skirtDepth: 2, rift: P };
    const reply = handleChunkMessage({ id: 1, request: req });
    expect(reply.message.ok).toBe(true);
    setRiftTerrain(P);
    const main = buildChunkData({ ...req, rift: undefined });
    if (reply.message.ok) expect(Array.from(reply.message.data.positions)).toEqual(Array.from(main.positions));
    // A later request without a rift puts the worker back on the world shape.
    setRiftTerrain(null);
    const plain = handleChunkMessage({ id: 2, request: { ...req, rift: undefined } });
    const world = buildChunkData({ ...req, rift: undefined });
    if (plain.message.ok) expect(Array.from(plain.message.data.positions)).toEqual(Array.from(world.positions));
  });
  it('validates rift params and the site footprint', () => {
    expect(isRiftTerrainParams(P)).toBe(true);
    expect(isRiftTerrainParams({ ...P, radius: 999 })).toBe(false);
    expect(validateChunkRequest({ centerX: 0, centerZ: 0, size: 100, segments: 8, skirtDepth: 1, rift: { seed: -1 } })).toMatch(/rift/);
    expect(touchesSiteBox(SITE.x, SITE.z, 100)).toBe(true);
    expect(touchesSiteBox(0, 0, 3200)).toBe(false);
  });
});
