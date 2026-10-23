import { describe, expect, it } from 'vitest';
import { HARROWMARK_LAYOUT } from '../../../../harrowmark/harrowmark.layout';
import { CINDERREACH_LAYOUT } from '../../../../cinderreach/cinderreach.layout';
import { OLDSMOKE_LAYOUT } from '../../../../oldsmoke/oldsmoke.layout';
import { paceMinutes } from '../pacing';
import { OLDSMOKE_PACE } from './pacing';

const pos: Record<string, { x: number; z: number }> = {};
for (const a of [...CINDERREACH_LAYOUT.anchors, ...HARROWMARK_LAYOUT.anchors, ...OLDSMOKE_LAYOUT.anchors]) pos[a.id] = { x: a.x, z: a.z };

describe('Phase D surface pacing (plans/act2-A13.md section 5)', () => {
  it('holds a row per quest and branch, each floor under its design minutes', () => {
    expect(OLDSMOKE_PACE.map((r) => (r.branch ? `${r.quest}:${r.branch}` : r.quest))).toEqual(['m16', 'r09:stewards', 'r10:miners', 'm21:confront', 'm21:spy', 'm22']);
    for (const r of OLDSMOKE_PACE) expect(r.floor, r.quest).toBeLessThan(r.design);
  });

  it.each(OLDSMOKE_PACE.map((r) => [`${r.quest}${r.branch ? ':' + r.branch : ''}`, r] as const))('%s: its estimate stays over its floor', (_q, row) => {
    expect(paceMinutes(row, pos).minutes).toBeGreaterThanOrEqual(row.floor);
  });

  it('every quest reaches 40% of its design minutes and the R10 miners/stewards branch 45%', () => {
    for (const r of OLDSMOKE_PACE) {
      const share = paceMinutes(r, pos).minutes / r.design;
      expect(share, `${r.quest} ${r.branch ?? ''}`).toBeGreaterThanOrEqual(r.quest === 'r10' ? 0.45 : 0.4);
    }
  });

  it('the estimate responds to dialogue and to beats', () => {
    const base = OLDSMOKE_PACE[0];
    expect(paceMinutes({ ...base, nodes: base.nodes - 10 }, pos).minutes).toBeLessThan(paceMinutes(base, pos).minutes);
    expect(paceMinutes({ ...base, beats: {} }, pos).minutes).toBeLessThan(paceMinutes(base, pos).minutes);
  });
});
