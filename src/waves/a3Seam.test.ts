import { describe, expect, it } from 'vitest';
import { cinderfordLayout } from '../cinderreach/cinderford';
import { CINDERFORD_RAID } from './defs/cinderford';
import { CART, DIRECTOR } from './tuning';

/** The seam with A3's published Cinderford anchors: every id the set names exists, and the geometry fits the tuning. */
describe("A3's Cinderford layout", () => {
  const anchors = new Map(cinderfordLayout().anchors.map((a) => [a.id, { x: a.x, z: a.z }]));
  const need = [...Object.values(CINDERFORD_RAID.lanes), ...CINDERFORD_RAID.barricadeAnchors, ...CINDERFORD_RAID.defenders.map((d) => d.anchor)];

  it('defines every anchor the raid names', () => {
    for (const id of need) expect(anchors.has(id), id).toBe(true);
  });

  it('keeps the barricade line, the militia and every lane within reach of the director radius or the cart start clamp', () => {
    const pts = CINDERFORD_RAID.barricadeAnchors.map((id) => anchors.get(id)!);
    const o = { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, z: pts.reduce((s, p) => s + p.z, 0) / pts.length };
    for (const id of CINDERFORD_RAID.defenders.map((d) => d.anchor)) {
      const p = anchors.get(id)!;
      expect(Math.hypot(p.x - o.x, p.z - o.z)).toBeLessThan(DIRECTOR.activeRadius);
    }
    // Lanes are far up the road: the cart's start is clamped, so its approach stays the tuned time.
    for (const key of ['1', '2', '3'] as const) {
      const p = anchors.get(CINDERFORD_RAID.lanes[key])!;
      expect(Math.hypot(p.x - o.x, p.z - o.z)).toBeGreaterThan(CART.startDistance);
    }
  });
});
