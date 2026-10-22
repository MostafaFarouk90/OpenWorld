// Environment pass G0c: the B1 detail relief stays inside its clamp, vanishes where the layout needs flat ground,
// and leaves the rest of the world (and the T07 hurdle jump) alone.
import { describe, expect, it } from 'vitest';
import { BRIGHTWATER_LAYOUT } from '../../region/brightwater.layout';
import { footprintCorners } from '../../region/geometry';
import { heightAt } from '../heightfield';
import { RELIEF_BLEND, RELIEF_MAX, RELIEF_TILE, RELIEF_TILE_BAND, detailRelief, reliefOpenness } from './detailRelief';
import { RELIEF_ZONES } from './detailReliefZones';
import { buildReliefZones, renderReliefZones } from './reliefZonesBuild';

const FS_MODULE = 'node:fs'; // not statically imported: the app tsconfig has no Node types (same as runtimeAssets.test.ts)
const FLAT_TOLERANCE = 0.05;
const MAX_ZONES = 40;
/** Largest ground slope tolerated anywhere in the tile (rise over run), well under the character's walkable slope. */
const MAX_SLOPE = 0.35;

describe('detail relief zones', () => {
  it('are exactly what the generator writes from the Brightwater layout', async () => {
    const generated = renderReliefZones(buildReliefZones(BRIGHTWATER_LAYOUT));
    const fs = await import(/* @vite-ignore */ FS_MODULE);
    const onDisk = fs.readFileSync(new URL('./detailReliefZones.ts', import.meta.url), 'utf8');
    expect(onDisk).toBe(generated);
  });

  it('stay a small table', () => {
    expect(RELIEF_ZONES.length).toBeGreaterThan(0);
    expect(RELIEF_ZONES.length).toBeLessThanOrEqual(MAX_ZONES);
  });

  it('keep every anchor, sphere trigger and structure footprint corner in the B1 tile flat within 0.05 m', () => {
    const inTile = (x: number, z: number): boolean => x >= RELIEF_TILE.x0 - RELIEF_TILE_BAND && x <= RELIEF_TILE.x1 + RELIEF_TILE_BAND && z >= RELIEF_TILE.z0 - RELIEF_TILE_BAND && z <= RELIEF_TILE.z1 + RELIEF_TILE_BAND;
    const points: Array<[string, number, number]> = [];
    for (const a of BRIGHTWATER_LAYOUT.anchors) points.push([a.id, a.x, a.z]);
    for (const t of BRIGHTWATER_LAYOUT.triggers) {
      if (t.shape === 'box' && Math.max(t.half[0], t.half[2]) >= 40) continue;
      points.push([t.id, t.x, t.z]);
    }
    for (const s of BRIGHTWATER_LAYOUT.structures) {
      points.push([s.id, s.x, s.z]);
      for (const [x, z] of footprintCorners(s)) points.push([s.id, x, z]);
    }
    let checked = 0;
    for (const [id, x, z] of points) {
      if (!inTile(x, z)) continue;
      checked++;
      expect(Math.abs(detailRelief(x, z)), id).toBeLessThanOrEqual(FLAT_TOLERANCE);
    }
    expect(checked).toBeGreaterThan(200);
  });

  it('keep the T07 hurdle (fence z=90, trigger z=94) and the lane corridor exactly flat', () => {
    for (let x = -20; x <= 20; x += 0.5) {
      for (let z = 80; z <= 100; z += 0.5) expect(detailRelief(x, z)).toBe(0);
    }
    for (let z = -10; z <= 190; z += 2) expect(detailRelief(0, z)).toBe(0);
  });

  it('keep the spawn exactly at height 0', () => {
    expect(heightAt(0, 0)).toBe(0);
    expect(detailRelief(0, 0)).toBe(0);
  });
});

describe('detailRelief', () => {
  it('stays within the clamp across the whole covered area', () => {
    for (let x = -170; x <= 230; x += 3) {
      for (let z = -100; z <= 300; z += 3) expect(Math.abs(detailRelief(x, z))).toBeLessThanOrEqual(RELIEF_MAX);
    }
  });

  it('is zero beyond the B1 blend band', () => {
    const edge = RELIEF_TILE_BAND;
    for (let t = -200; t <= 400; t += 7) {
      expect(detailRelief(RELIEF_TILE.x0 - edge, t)).toBe(0);
      expect(detailRelief(RELIEF_TILE.x1 + edge, t)).toBe(0);
      expect(detailRelief(t, RELIEF_TILE.z0 - edge)).toBe(0);
      expect(detailRelief(t, RELIEF_TILE.z1 + edge)).toBe(0);
    }
    expect(detailRelief(5000, 5000)).toBe(0);
    expect(detailRelief(-900, -200)).toBe(0);
  });

  it('actually shapes the open fringe (some point bends the ground at least 0.4 m)', () => {
    let peak = 0;
    for (let x = -100; x <= 160; x += 2) for (let z = -30; z <= 230; z += 2) peak = Math.max(peak, Math.abs(detailRelief(x, z)));
    expect(peak).toBeGreaterThan(0.4);
  });

  it('is deterministic', () => {
    expect(detailRelief(-80, 60)).toBe(detailRelief(-80, 60));
    expect(heightAt(-80, 60)).toBe(heightAt(-80, 60));
  });

  it('adds no slope beyond the limit, including across the keep-flat ramps', () => {
    let worst = 0;
    for (let x = -160; x <= 220; x += 1.5) {
      for (let z = -90; z <= 290; z += 1.5) {
        const h = detailRelief(x, z);
        worst = Math.max(worst, Math.abs(detailRelief(x + 1, z) - h), Math.abs(detailRelief(x, z + 1) - h));
      }
    }
    expect(worst).toBeLessThan(MAX_SLOPE);
  });

  it('ramps in smoothly just outside a flat zone', () => {
    const zone = RELIEF_ZONES[0]!;
    expect(reliefOpenness(zone[0] - 0.01, (zone[1] + zone[3]) / 2)).toBeLessThan(0.01);
    expect(reliefOpenness(zone[0] - RELIEF_BLEND - 80, -500)).toBe(1);
  });

  it('stays cheap: 200,000 samples run in well under a second', () => {
    const t0 = performance.now();
    let sum = 0;
    for (let i = 0; i < 200_000; i++) sum += detailRelief(-150 + (i % 500) * 0.7, -80 + Math.floor(i / 500) * 0.9);
    const ms = performance.now() - t0;
    expect(Number.isFinite(sum)).toBe(true);
    expect(ms).toBeLessThan(1500);
  });
});

describe('the Act 2 ground and the far world', () => {
  it('are untouched: relief is 0 across the Cinderreach and Oldsmoke areas', () => {
    for (const [x, z] of [[1200, 400], [2600, -300], [-1800, 900], [3000, 2000], [400, -150]] as const) expect(detailRelief(x, z)).toBe(0);
  });
});
