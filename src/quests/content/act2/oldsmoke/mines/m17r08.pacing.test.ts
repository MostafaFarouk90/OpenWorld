// Pacing of M17 and R08 (plans/act2-A13.md section 5). the routes are measured on A4's real anchors (`M17R08_POS`, built in realAnchors.ts from the mine
// defs and the surface layout); the test also checks that every route point is in that table.
import { describe, expect, it } from 'vitest';
import { OLDSMOKE_LAYOUT } from '../../../../../oldsmoke/oldsmoke.layout';
import { paceMinutes } from '../../pacing';
import { M17R08_PACE, M17R08_POS } from './m17r08.pacing';

describe('M17 and R08 pacing', () => {
  it('holds one row per quest, each floor at 40% of its design minutes', () => {
    expect(M17R08_PACE.map((r) => r.quest)).toEqual(['m17', 'r08']);
    for (const r of M17R08_PACE) {
      expect(r.floor, r.quest).toBeLessThan(r.design);
      expect(r.floor, r.quest).toBeCloseTo(r.design * 0.4, 5);
    }
  });

  it('every route point is in the local table, and the surface ones that the layout publishes exist there too', () => {
    for (const r of M17R08_PACE) for (const a of r.route) expect(M17R08_POS[a], `${r.quest}: ${a}`).toBeDefined();
    const layout = new Set(OLDSMOKE_LAYOUT.anchors.map((a) => a.id));
    for (const id of ['oldsmoke.shaft.head', 'oldsmoke.shaft.door', 'oldsmoke.shaft.lift.top', 'oldsmoke.shaft.winch', 'oldsmoke.shaft.winch.part.1', 'oldsmoke.shaft.winch.part.2', 'oldsmoke.shaft.winch.part.3', 'npc-post.slagg.shaft']) {
      expect(layout.has(id), id).toBe(true);
    }
  });

  it.each(M17R08_PACE.map((r) => [r.quest, r] as const))('%s: every quest reaches at least 40% of its design minutes', (_q, row) => {
    const m = paceMinutes(row, M17R08_POS).minutes;
    expect(m).toBeGreaterThanOrEqual(row.floor);
  });

  it('both keep a margin over the 40% floor (M17 about 55%, R08 about 46%; plan section 5 estimated 56% and 51%)', () => {
    const m17 = paceMinutes(M17R08_PACE[0], M17R08_POS).minutes / M17R08_PACE[0].design;
    const r08 = paceMinutes(M17R08_PACE[1], M17R08_POS).minutes / M17R08_PACE[1].design;
    expect(m17).toBeGreaterThanOrEqual(0.45);
    expect(r08).toBeGreaterThanOrEqual(0.45);
  });

  it('the estimate responds to dialogue and to beats, and a walk alone cannot meet the floor', () => {
    for (const row of M17R08_PACE) {
      const base = paceMinutes(row, M17R08_POS).minutes;
      expect(paceMinutes({ ...row, nodes: row.nodes - 10 }, M17R08_POS).minutes).toBeLessThan(base);
      expect(paceMinutes({ ...row, beats: {} }, M17R08_POS).minutes).toBeLessThan(base);
      expect(paceMinutes({ ...row, nodes: 0, beats: {} }, M17R08_POS).minutes).toBeLessThan(row.floor);
    }
  });

  it('an unknown route point is an error, not a silent zero', () => {
    expect(() => paceMinutes({ ...M17R08_PACE[0], route: ['oldsmoke.shaft.head', 'oldsmoke.nowhere'] }, M17R08_POS)).toThrow();
  });
});
