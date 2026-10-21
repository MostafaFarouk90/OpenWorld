import { describe, expect, it } from 'vitest';
import { heightAt } from '../terrain/heightfield';
import { footprintSpread } from './siteFit';
import { SITES_FIT } from './sitesFit';

// Re-checks the committed fit against the ground: it fails when A1 moves terrain, until
// `npx vite-node tools/fit-cinderreach-sites.ts` is rerun and the result committed.
const flat = (p: { x: number; z: number }, size: number, max: number, what: string) =>
  expect(footprintSpread(heightAt, p.x, p.z, size, size), what).toBeLessThanOrEqual(max);

describe('the committed site fit', () => {
  it('keeps every camp prop on level ground', () => {
    for (const [kind, size] of [['tents', 6], ['cages', 3], ['desks', 3], ['crates', 2]] as const) {
      SITES_FIT.camp[kind].forEach((p, i) => flat(p, size, 1.5, `${kind} ${i + 1}`));
    }
  });

  it('keeps the road stone, its blooms, the fold and the hound den level', () => {
    flat(SITES_FIT.stone, 4, 1.5, 'stone');
    SITES_FIT.blooms.forEach((p, i) => flat(p, 3, 2, `bloom ${i + 1}`));
    flat(SITES_FIT.fold, 10, 2, 'fold');
    flat(SITES_FIT.houndDen, 10, 3, 'hound den');
  });

  it('keeps the Dell a dip and the three hollows distinct dips', () => {
    const ring = (p: { x: number; z: number }) => [[20, 0], [-20, 0], [0, 20], [0, -20]].reduce((s, [dx, dz]) => s + heightAt(p.x + dx, p.z + dz), 0) / 4;
    expect(ring(SITES_FIT.dell) - heightAt(SITES_FIT.dell.x, SITES_FIT.dell.z)).toBeGreaterThan(0.5);
    expect(SITES_FIT.hollows).toHaveLength(3);
    for (const h of SITES_FIT.hollows) expect(ring(h) - heightAt(h.x, h.z), `${h.x},${h.z}`).toBeGreaterThan(0.3);
  });
});
