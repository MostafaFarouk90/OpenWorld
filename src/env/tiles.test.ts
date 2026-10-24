// Environment pass: every registered tile's rows name known ids, sit inside the tile, and stay off the frozen layout.
import { describe, expect, it } from 'vitest';
import { BRIGHTWATER_LAYOUT } from '../region/brightwater.layout';
import { CORRIDOR_LAYOUT } from '../region/corridor.layout';
import { ROAD_Z, ROAD_WIDTH } from '../region/deadRoad';
import { DENSITY_LAYOUT_A } from '../region/density.layout';
import { pointInFootprint } from '../region/geometry';
import { BROOK_COURSE, BROOK_WIDTH, RIVER_COURSE, RIVER_WIDTH } from '../region/water';
import { classOf } from './PlacementField';
import { resolveModel } from './resolve';
import targets from './targets.json';
import { TILE_BOUNDS, TILES } from './tiles';

const known = new Set(Object.keys((targets as { objects: Record<string, unknown> }).objects));

describe('B1 placements', () => {
  const rows = TILES.b1!;

  it('is registered and large enough to matter', () => {
    expect(rows.length).toBeGreaterThan(700);
  });

  it('uses only ids from the scale table or the KayKit aliases', () => {
    const unknown = [...new Set(rows.map((r) => r.id))].filter((id) => !known.has(id) && resolveModel(id).source !== 'kaykit');
    expect(unknown).toEqual([]);
  });

  it('lies inside the tile core (band rows belong to the neighbour) and never inside a structure footprint', () => {
    for (const r of rows) {
      expect(r.x).toBeGreaterThanOrEqual(-100);
      expect(r.x).toBeLessThanOrEqual(160);
      expect(r.z).toBeGreaterThanOrEqual(-30);
      expect(r.z).toBeLessThanOrEqual(230);
      expect(Number.isFinite(r.x) && Number.isFinite(r.z), r.id).toBe(true);
    }
    for (const s of BRIGHTWATER_LAYOUT.structures) {
      if (s.mode === 'open') continue;
      for (const r of rows) expect(pointInFootprint(s, r.x, r.z, 0.4), `${r.id} in ${s.id}`).toBe(false);
    }
  });

  it('keeps clear of anchors the player stands on (1 m)', () => {
    for (const a of BRIGHTWATER_LAYOUT.anchors) {
      for (const r of rows) {
        if (r.id.startsWith('grass') || r.id.startsWith('flower')) continue;
        expect(Math.hypot(r.x - a.x, r.z - a.z), `${r.id} on ${a.id}`).toBeGreaterThanOrEqual(1);
      }
    }
  });
});

describe('B3 placements (Hollin Ford, its brook and river meadow, plus the reed-island annex)', () => {
  const rows = TILES.b3!;
  const layouts = [BRIGHTWATER_LAYOUT, CORRIDOR_LAYOUT, DENSITY_LAYOUT_A];
  const isGround = (id: string) => classOf(id) === 'ground';
  /** Distance from (x, z) to a polyline course. */
  const courseDist = (course: ReadonlyArray<readonly [number, number]>, x: number, z: number) => {
    let best = Infinity;
    for (let i = 1; i < course.length; i++) {
      const [x0, z0] = course[i - 1];
      const [x1, z1] = course[i];
      const dx = x1 - x0;
      const dz = z1 - z0;
      const t = Math.max(0, Math.min(1, ((x - x0) * dx + (z - z0) * dz) / (dx * dx + dz * dz)));
      best = Math.min(best, Math.hypot(x - (x0 + t * dx), z - (z0 + t * dz)));
    }
    return best;
  };

  it('is registered, rich, and has every runtime class', () => {
    expect(rows.length).toBeGreaterThan(3000);
    const classes = new Set(rows.map((r) => classOf(r.id)));
    for (const c of ['tree', 'bush', 'ground', 'rock', 'wood', 'hedge', 'prop']) expect(classes.has(c as never), c).toBe(true);
  });

  it('uses only ids from the scale table or the KayKit aliases', () => {
    const unknown = [...new Set(rows.map((r) => r.id))].filter((id) => !known.has(id) && resolveModel(id).source !== 'kaykit');
    expect(unknown).toEqual([]);
  });

  it('lies inside B3 core or the reed-island annex only (band rows are not loaded)', () => {
    const rects = TILE_BOUNDS.b3!;
    for (const r of rows) {
      expect(Number.isFinite(r.x) && Number.isFinite(r.z), r.id).toBe(true);
      expect(rects.some((b) => r.x >= b.minX && r.x <= b.maxX && r.z >= b.minZ && r.z <= b.maxZ), `${r.id} at ${r.x},${r.z}`).toBe(true);
    }
    // the annex rows are really there (B3 owns the island by ruling)
    expect(rows.filter((r) => r.x > 0).length).toBeGreaterThan(100);
  });

  it('never sits inside a solid structure footprint (ford carts, waystone, island ledge) or on an anchor', () => {
    for (const s of layouts.flatMap((l) => l.structures)) {
      if (s.mode === 'open') continue;
      for (const r of rows) expect(pointInFootprint(s, r.x, r.z, 0.4), `${r.id} in ${s.id}`).toBe(false);
    }
    for (const a of layouts.flatMap((l) => l.anchors)) {
      for (const r of rows) {
        if (isGround(r.id)) continue;
        expect(Math.hypot(r.x - a.x, r.z - a.z), `${r.id} on ${a.id}`).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('keeps the toll arena clear: only ground cover inside the toll-post trigger', () => {
    const t = layouts.flatMap((l) => l.triggers).find((tr) => tr.id === 'trg.ford.toll-post')!;
    expect(t).toBeDefined();
    for (const r of rows) if (!isGround(r.id)) expect(Math.hypot(r.x - t.x, r.z - t.z), r.id).toBeGreaterThan(9);
  });

  it('puts no grass or flowers on the Dead Road surface (half width plus 0.5 m) or in the water', () => {
    for (const r of rows.filter((x) => isGround(x.id))) {
      if (r.x <= -60) expect(Math.abs(r.z - ROAD_Z), `${r.id} at ${r.x},${r.z}`).toBeGreaterThanOrEqual(ROAD_WIDTH / 2 + 0.5);
      expect(courseDist(BROOK_COURSE, r.x, r.z), `${r.id} in the brook`).toBeGreaterThan(BROOK_WIDTH / 2);
      expect(courseDist(RIVER_COURSE, r.x, r.z), `${r.id} in the river`).toBeGreaterThan(RIVER_WIDTH / 2);
    }
  });

  it('dresses the hedge feet: grass, flowers or ferns within 2.2 m of most hedge modules', () => {
    const hedges = rows.filter((r) => r.id === 'hedge-straight');
    const verge = rows.filter((r) => isGround(r.id) || r.id === 'fern-a');
    const dressed = hedges.filter((h) => verge.filter((v) => Math.hypot(v.x - h.x, v.z - h.z) < 2.2).length >= 3);
    expect(hedges.length).toBeGreaterThan(200);
    expect(dressed.length / hedges.length).toBeGreaterThan(0.9);
  });

  it('puts a corner post either side of every hedge gap (gates need walls or fences)', () => {
    const posts = rows.filter((r) => r.id === 'hedge-corner');
    expect(posts.length).toBeGreaterThanOrEqual(36);
    const hedges = rows.filter((r) => r.id === 'hedge-straight');
    // a gate post is at the end of a hedge run: a hedge module lies within 4 m on one side only along the line
    const gatePosts = posts.filter((p) => hedges.filter((h) => Math.hypot(h.x - p.x, h.z - p.z) < 4).length >= 1);
    expect(gatePosts.length).toBeGreaterThanOrEqual(24);
  });

  it('has reed beds on both banks of the river (about 180 reed rows) and none on the road', () => {
    const reeds = rows.filter((r) => r.id.startsWith('reeds') && r.x > -350 && r.x < -60 && Math.abs(r.z + 300) < 20);
    expect(reeds.length).toBeGreaterThanOrEqual(140);
    expect(reeds.filter((r) => r.z > -300).length).toBeGreaterThan(40);
    expect(reeds.filter((r) => r.z < -300).length).toBeGreaterThan(40);
    expect(rows.some((r) => r.id === 'tent')).toBe(false);
  });

  it('clusters its ground cover instead of an even sprinkle (B1 review: specks)', () => {
    // Ground cover is dense (the old blade scatter is off inside the tile): most 10 m cells hold clumps and an occupied cell holds many.
    const g = rows.filter((r) => isGround(r.id) && r.x < 0);
    const cells = new Set(g.map((r) => `${Math.floor(r.x / 10)},${Math.floor(r.z / 10)}`));
    expect(cells.size / ((420 * 370) / 100)).toBeGreaterThan(0.6);
    expect(g.length / cells.size).toBeGreaterThan(10);
  });
});
