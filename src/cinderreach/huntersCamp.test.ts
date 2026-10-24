import { describe, expect, it } from 'vitest';
import { heightAt } from '../terrain/heightfield';
import { CINDERREACH_LAYOUT } from './cinderreach.layout';
import { campCages, campTents } from './huntersCamp';
import { footprintSpread } from './siteFit';

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
  it('the corridor check does fail on the original spots (tent 3 and cage 2 in the way)', () => {
    const keys = anchor('cinderreach.m15.search.4');
    const carter = anchor('cinderreach.m15.carter');
    const tent = solids.find((s) => s.id === 'cinderreach-camp-tent-3')!;
    const cage = solids.find((s) => s.id === 'cinderreach-camp-cage-2')!;
    const moved = (s: typeof tent, dx: number) => ({ ...s, x: s.x - dx });
    const hit = (s: typeof tent, cx: number, z: number) => Math.abs(s.x - cx) < s.footprint[0] / 2 + PLAYER_R && s.z + s.footprint[1] / 2 > z - 0.5 && s.z - s.footprint[1] / 2 < z + 12;
    expect(hit(moved(tent, -10), keys.x, keys.z)).toBe(true);
    expect(hit(moved(cage, 5), carter.x, carter.z)).toBe(true);
  });
  it('the moved props overlap no other camp prop', () => {
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
  it('the moved tent and cage stand on level ground', () => {
    expect(footprintSpread(heightAt, campTents()[2].x, campTents()[2].z, 6, 6)).toBeLessThanOrEqual(1.5);
    expect(footprintSpread(heightAt, campCages()[1].x, campCages()[1].z, 3, 3)).toBeLessThanOrEqual(1.5);
  });
});
