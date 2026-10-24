import { describe, expect, it } from 'vitest';
import { CINDERREACH_LAYOUT } from './cinderreach.layout';

/** M15: the cage keys and the bound carter must be reachable on foot walking straight in from the north (+Z). */
describe('hunters camp approach (B2)', () => {
  const anchor = (id: string) => CINDERREACH_LAYOUT.anchors.find((x) => x.id === id)!;
  const solids = CINDERREACH_LAYOUT.structures.filter((s) => s.mode === 'solid' && s.id.startsWith('cinderreach-camp-'));
  const PLAYER_R = 0.5;
  /** Solid axis-aligned footprints (all camp yaws are 0) that intersect the corridor |x - cx| <= w, z in [z0, z1]. */
  const blocking = (cx: number, z0: number, z1: number, w = PLAYER_R) =>
    solids
      .filter((s) => {
        const [fw, fd] = s.footprint;
        return Math.abs(s.x - cx) < fw / 2 + w && s.z + fd / 2 > z0 && s.z - fd / 2 < z1;
      })
      .map((s) => s.id);

  it.each(['cinderreach.m15.search.4', 'npc-post.carter-bound', 'cinderreach.m15.carter'])('nothing blocks the corridor from 12 m north down to %s', (id) => {
    const p = anchor(id);
    expect(blocking(p.x, p.z - 0.5, p.z + 12)).toEqual([]);
  });
  it('the corridor check does fail on the old south-side spots (tent 3 and cage 2 in the way)', () => {
    const tent = solids.find((s) => s.id === 'cinderreach-camp-tent-3')!;
    const cage = solids.find((s) => s.id === 'cinderreach-camp-cage-2')!;
    // The old anchors stood 1.5 m off the south face, with the prop between them and the north.
    const southZ = (s: typeof tent) => s.z - s.footprint[1] / 2 - 1.5;
    expect(blocking(tent.x, southZ(tent) - 0.5, southZ(tent) + 12)).toContain(tent.id);
    expect(blocking(cage.x, southZ(cage) - 0.5, southZ(cage) + 12)).toContain(cage.id);
  });
  it.each([
    ['cinderreach.m15.search.4', 'cinderreach-camp-tent-3'],
    ['cinderreach.m15.carter', 'cinderreach-camp-cage-2'],
    ['npc-post.carter-bound', 'cinderreach-camp-cage-2'],
  ])('%s stands within 3 m of the edge of its own prop %s', (id, propId) => {
    const p = anchor(id);
    const s = solids.find((x) => x.id === propId)!;
    const dx = Math.max(Math.abs(p.x - s.x) - s.footprint[0] / 2, 0);
    const dz = Math.max(Math.abs(p.z - s.z) - s.footprint[1] / 2, 0);
    expect(Math.hypot(dx, dz)).toBeLessThanOrEqual(3);
  });
  it('the camp props overlap no other camp prop', () => {
    for (let i = 0; i < solids.length; i++) {
      for (let j = i + 1; j < solids.length; j++) {
        const a = solids[i];
        const b = solids[j];
        const ox = Math.abs(a.x - b.x) < (a.footprint[0] + b.footprint[0]) / 2;
        const oz = Math.abs(a.z - b.z) < (a.footprint[1] + b.footprint[1]) / 2;
        expect(ox && oz, `${a.id} overlaps ${b.id}`).toBe(false);
      }
    }
  });
});
