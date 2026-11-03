import { describe, expect, it } from 'vitest';
import { BRIGHTWATER_LAYOUT } from '../region/brightwater.layout';
import type { LayoutData } from '../region/layoutTypes';
import { TOBB } from './tobb';

// Thread 17's city layout is not on main until its PR merges; until then the Harrowmark checks are skipped.
const cityModules = import.meta.glob<{ HARROWMARK_LAYOUT?: LayoutData }>('../harrowmark/harrowmark.layout.ts', { eager: true });
const CITY = Object.values(cityModules)[0]?.HARROWMARK_LAYOUT;

const isCity = (id: string) => id.startsWith('trg.harrowmark.');
const ids = (l: LayoutData | undefined, kind: 'triggers' | 'anchors') => new Set((l?.[kind] ?? []).map((t) => t.id));

// Thread 4 adds the Dead Road triggers; until its layout has any of them this check is skipped. Once one exists,
// all must, so a rename fails here instead of silently skipping.
const defined = ids(BRIGHTWATER_LAYOUT, 'triggers');
// Act 2 triggers (trg.cinderreach.*) live in A3's layout, not Brightwater's.
// Act 3 triggers (trg.greyfen.*, trg.dragonspine.*) live in K3's and K4's layouts.
const brightwaterTriggers = Object.keys(TOBB.places.triggers).filter(
  (id) => !isCity(id) && !id.startsWith('trg.cinderreach.') && !id.startsWith('trg.greyfen.') && !id.startsWith('trg.dragonspine.'),
);
const deadRoadIn = brightwaterTriggers.some((id) => defined.has(id));

describe("Tobb's area-bark places", () => {
  it.skipIf(!deadRoadIn)('every Brightwater area trigger id exists in the Brightwater layout', () => {
    for (const id of brightwaterTriggers) expect(defined.has(id), id).toBe(true);
  });

  it.skipIf(!CITY)('every Harrowmark area trigger id exists in the city layout', () => {
    const city = ids(CITY, 'triggers');
    for (const id of Object.keys(TOBB.places.triggers).filter(isCity)) expect(city.has(id), id).toBe(true);
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

describe("Tobb's wait posts", () => {
  // npc-post.tobb.tilted-anvil is thread 3a's (inside the inn); the all-plugins test in companions.plugin.test checks it.
  const cityPosts = TOBB.waits.map((w) => w.anchorId).filter((id) => id !== 'npc-post.tobb.tilted-anvil');

  it('names the three posts the review settled', () => {
    expect(new Set(TOBB.waits.map((w) => w.anchorId))).toEqual(
      new Set(['npc-post.tobb.south-gate', 'npc-post.tobb.keep', 'npc-post.tobb.tilted-anvil']),
    );
  });

  it.skipIf(!CITY)("every outdoor post exists in thread 17's city layout", () => {
    const anchors = ids(CITY, 'anchors');
    for (const id of cityPosts) expect(anchors.has(id), id).toBe(true);
  });
});
