// Environment pass: every registered tile's rows name known ids, sit inside the tile, and stay off the frozen layout.
import { describe, expect, it } from 'vitest';
import { BRIGHTWATER_LAYOUT } from '../region/brightwater.layout';
import { pointInFootprint } from '../region/geometry';
import { resolveModel } from './resolve';
import targets from './targets.json';
import { TILES } from './tiles';

const known = new Set(Object.keys((targets as { objects: Record<string, unknown> }).objects));

describe('B1 placements', () => {
  const rows = TILES.b1!;

  it('is registered and large enough to matter', () => {
    expect(rows.length).toBeGreaterThan(1000);
  });

  it('uses only ids from the scale table or the KayKit aliases', () => {
    const unknown = [...new Set(rows.map((r) => r.id))].filter((id) => !known.has(id) && resolveModel(id).source !== 'kaykit');
    expect(unknown).toEqual([]);
  });

  it('lies inside the tile core plus its overlap and never inside a structure footprint', () => {
    for (const r of rows) {
      expect(r.x).toBeGreaterThanOrEqual(-160);
      expect(r.x).toBeLessThanOrEqual(220);
      expect(r.z).toBeGreaterThanOrEqual(-90);
      expect(r.z).toBeLessThanOrEqual(290);
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
