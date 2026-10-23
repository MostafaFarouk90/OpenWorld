// Pacing of M18 and M19 (plans/act2-A13.md section 5). A4's mine anchors are not on this branch, so the routes are measured on
// the local position table `M18M19_POS` (documented in m18m19.pacing.ts); the test also checks that every route point is in
// that table and that the guide's walking pace is what the timing table counts.
import { describe, expect, it } from 'vitest';
import { ROUTE_FOLLOW_MPS } from '../../../../../integration/timing';
import { paceMinutes } from '../../pacing';
import { GUIDE } from './m19Route';
import { M18M19_PACE, M18M19_POS, paceMinutesFollow } from './m18m19.pacing';

const [m18, m19] = M18M19_PACE;

describe('M18 and M19 pacing', () => {
  it('holds one row per quest, each floor at 40% of its design minutes', () => {
    expect(M18M19_PACE.map((r) => r.quest)).toEqual(['m18', 'm19']);
    for (const r of M18M19_PACE) {
      expect(r.floor, r.quest).toBeLessThan(r.design);
      expect(r.floor, r.quest).toBeCloseTo(r.design * 0.4, 5);
    }
  });

  it('every route point is in the local table', () => {
    for (const r of M18M19_PACE) for (const a of r.route) expect(M18M19_POS[a], `${r.quest}: ${a}`).toBeDefined();
  });

  it.each(M18M19_PACE.map((r) => [r.quest, r] as const))('%s: reaches at least 40% of its design minutes', (_q, row) => {
    expect(paceMinutesFollow(row, M18M19_POS).minutes).toBeGreaterThanOrEqual(row.floor);
  });

  it('keeps a margin over the floor (M18 about 48%, M19 about 45%; plan section 5 estimated 49% and 48%)', () => {
    expect(paceMinutesFollow(m18, M18M19_POS).minutes / m18.design).toBeGreaterThanOrEqual(0.45);
    expect(paceMinutesFollow(m19, M18M19_POS).minutes / m19.design).toBeGreaterThanOrEqual(0.42);
  });

  it('M18 has no followed legs, so the follow estimate is the plain estimate', () => {
    expect(paceMinutesFollow(m18, M18M19_POS).minutes).toBeCloseTo(paceMinutes(m18, M18M19_POS).minutes, 9);
  });

  it('M19\'s followed legs cost more than the same legs at walking pace (Wenna goes at the route-follow pace)', () => {
    expect(GUIDE.walkMps).toBe(ROUTE_FOLLOW_MPS);
    expect(paceMinutesFollow(m19, M18M19_POS).minutes).toBeGreaterThan(paceMinutes(m19, M18M19_POS).minutes);
  });

  it('the estimate responds to dialogue and to beats, and a walk alone cannot meet the floor', () => {
    for (const row of M18M19_PACE) {
      const base = paceMinutesFollow(row, M18M19_POS).minutes;
      expect(paceMinutesFollow({ ...row, nodes: row.nodes - 10 }, M18M19_POS).minutes).toBeLessThan(base);
      expect(paceMinutesFollow({ ...row, beats: {} }, M18M19_POS).minutes).toBeLessThan(base);
      expect(paceMinutesFollow({ ...row, nodes: 0, beats: {} }, M18M19_POS).minutes).toBeLessThan(row.floor);
    }
  });

  it('an unknown route point is an error, not a silent zero', () => {
    expect(() => paceMinutesFollow({ ...m18, route: ['oldsmoke.bellows.lift', 'oldsmoke.nowhere'] }, M18M19_POS)).toThrow();
  });
});
