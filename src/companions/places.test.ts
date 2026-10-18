import { describe, expect, it } from 'vitest';
import { BRIGHTWATER_LAYOUT } from '../region/brightwater.layout';
import { TOBB } from './tobb';

// Thread 4 adds the Dead Road triggers; until its layout has any of them this check is skipped. Once one exists,
// all must, so a rename fails here instead of silently skipping.
const defined = new Set(BRIGHTWATER_LAYOUT.triggers.map((t) => t.id));
const deadRoadIn = Object.keys(TOBB.places.triggers).some((id) => defined.has(id));

describe("Tobb's area-bark places", () => {
  it.skipIf(!deadRoadIn)('every area trigger id exists in the Brightwater layout', () => {
    for (const id of Object.keys(TOBB.places.triggers)) expect(defined.has(id), id).toBe(true);
  });

  it('every place maps to a non-empty bark pool', () => {
    const places = [
      ...Object.values(TOBB.places.triggers),
      ...Object.values(TOBB.places.interiors),
      ...Object.values(TOBB.places.regions),
    ];
    for (const p of places) expect(TOBB.banter.area[p]?.length ?? 0, p).toBeGreaterThan(0);
  });
});
