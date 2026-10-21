import { describe, expect, it } from 'vitest';
import { FOXFIRE_CHESTS, FOX_CACHE_POS, foxChestPos } from '../world/poi/content';
import { ACT2_POI_PLACEMENTS, resolvePose } from '../world/poi/placement.act2';
import { CINDERREACH_KEEP_OUT } from './sites';

// A2's sites (and the Leap spots, chests and fox cache built within a template's footprint) must stay clear of A3's places.
const TEMPLATE_REACH = 30;

describe('A2 points of interest vs Cinderreach places', () => {
  it.each(ACT2_POI_PLACEMENTS.map((p) => [p.site.id, p] as const))('%s lies outside every keep-out circle', (_id, p) => {
    const pose = resolvePose(p);
    for (const k of CINDERREACH_KEEP_OUT) {
      expect(Math.hypot(pose.x - k.x, pose.z - k.z), `${p.site.id} vs ${k.id}`).toBeGreaterThan(k.r + TEMPLATE_REACH);
    }
  });

  it('keeps the six Fox-Fire chests and the fox cache clear too (3 m margin: they are single props)', () => {
    const pts = [...FOXFIRE_CHESTS.map((f) => ({ id: `chest ${f.n}`, ...foxChestPos(f) })), { id: 'fox cache', ...FOX_CACHE_POS }];
    expect(pts).toHaveLength(FOXFIRE_CHESTS.length + 1);
    for (const q of pts) for (const k of CINDERREACH_KEEP_OUT) expect(Math.hypot(q.x - k.x, q.z - k.z), `${q.id} vs ${k.id}`).toBeGreaterThan(k.r);
  });
});
