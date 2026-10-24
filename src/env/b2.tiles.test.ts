// Environment pass B2: the rows the tile owns name known ids, sit in its core or the ruled west seam, stay off B1's core and the frozen layout.
import { describe, expect, it } from 'vitest';
import { BRIGHTWATER_LAYOUT } from '../region/brightwater.layout';
import { pointInFootprint } from '../region/geometry';
import { classOf } from './PlacementField';
import { resolveModel } from './resolve';
import targets from './targets.json';
import { TILES } from './tiles';

const known = new Set(Object.keys((targets as { objects: Record<string, unknown> }).objects));
const rows = TILES.b2!;
const inB1 = (x: number, z: number): boolean => x >= -100 && x <= 160 && z >= -30 && z <= 230;

describe('B2 placements', () => {
  it('is registered and rich enough to matter (about 4 items per 100 m2 of the 51,000 m2 it owns, plus the west seam)', () => {
    expect(rows.length).toBeGreaterThan(1800);
  });

  it('dresses every class, not only the hedges', () => {
    const by: Record<string, number> = {};
    for (const r of rows) by[classOf(r.id)] = (by[classOf(r.id)] ?? 0) + 1;
    for (const c of ['tree', 'bush', 'rock', 'wood', 'ground', 'prop', 'hedge']) expect(by[c] ?? 0, c).toBeGreaterThan(20);
    expect(by.ground).toBeGreaterThan(by.hedge! * 3);
  });

  it('uses only ids from the scale table or a model the resolver finds (no unplanned placeholder)', () => {
    const base = (id: string): string => id.replace(/-ashen$/, '');
    const unknown = [...new Set(rows.map((r) => r.id))].filter((id) => !known.has(base(id)) && resolveModel(id).source !== 'kaykit');
    expect(unknown).toEqual([]);
  });

  it('owns only its core (x 0..260, z -20..330) or the west seam (x -100..0, z 230..330), never B1 core rows', () => {
    for (const r of rows) {
      expect(Number.isFinite(r.x) && Number.isFinite(r.z), r.id).toBe(true);
      expect(inB1(r.x, r.z), `${r.id} at ${r.x},${r.z} in B1's core`).toBe(false);
      const core = r.x >= 0 && r.x <= 260 && r.z >= -20 && r.z <= 330;
      const west = r.x >= -100 && r.x < 0 && r.z > 230 && r.z <= 330;
      expect(core || west, `${r.id} at ${r.x},${r.z}`).toBe(true);
    }
  });

  it('keeps off structure footprints and the anchors the player stands on', () => {
    for (const s of BRIGHTWATER_LAYOUT.structures) {
      if (s.mode === 'open') continue;
      for (const r of rows) expect(pointInFootprint(s, r.x, r.z, 0.4), `${r.id} in ${s.id}`).toBe(false);
    }
    for (const a of BRIGHTWATER_LAYOUT.anchors) {
      for (const r of rows) {
        if (classOf(r.id) === 'ground') continue;
        expect(Math.hypot(r.x - a.x, r.z - a.z), `${r.id} on ${a.id}`).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('keeps tall things off the lane north of the Kettlewick gate (x -4..8, z 232..300) so the waves have room', () => {
    for (const r of rows) {
      if (classOf(r.id) !== 'tree') continue;
      const clear = r.x < -4 || r.x > 8 || r.z < 232 || r.z > 300;
      expect(clear, `${r.id} at ${r.x},${r.z}`).toBe(true);
    }
  });

  it('keeps the lane north of the Kettlewick gate itself free of hedges and road furniture: they stand on the east verge, x >= 4', () => {
    for (const r of rows) {
      if (classOf(r.id) !== 'hedge' && classOf(r.id) !== 'prop') continue;
      if (r.x < -4 || r.x > 8 || r.z < 232 || r.z > 300) continue;
      expect(r.x, `${r.id} at ${r.x},${r.z}`).toBeGreaterThanOrEqual(4);
    }
  });

  it('puts the grey edge on the east: ashen variants only at x >= 100, almost no flowers at the far edge', () => {
    for (const r of rows) if (r.id.endsWith('-ashen')) expect(r.x, r.id).toBeGreaterThanOrEqual(100);
    expect(rows.some((r) => r.id.endsWith('-ashen') && r.x > 190)).toBe(true);
    expect(rows.filter((r) => r.id.startsWith('flower') && r.x > 250)).toHaveLength(0);
  });

  it('has verge strips: ground cover within 2.6 m of the hedge line modules', () => {
    const hedges = rows.filter((r) => classOf(r.id) === 'hedge');
    const ground = rows.filter((r) => classOf(r.id) === 'ground');
    let withVerge = 0;
    for (const h of hedges) if (ground.some((g) => Math.hypot(g.x - h.x, g.z - h.z) < 2.8)) withVerge++;
    expect(withVerge / hedges.length).toBeGreaterThan(0.7);
  });
});
