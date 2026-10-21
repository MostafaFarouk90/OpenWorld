import { describe, expect, it } from 'vitest';
import { heightAt } from '../terrain/heightfield';
import { CINDERREACH_LAYOUT } from './cinderreach.layout';
import { RIVER_ARMS, RIVER_WIDTH } from './cinderford';
import { armXAtZ, bridgeSpans, buildCinderfordWater } from './water';

describe('Cinderford water', () => {
  it('builds one ribbon per arm and disposes cleanly', () => {
    const w = buildCinderfordWater(heightAt);
    expect(w.object.children).toHaveLength(Object.keys(RIVER_ARMS).length);
    w.dispose();
    expect(w.object.parent).toBeNull();
  });

  it('interpolates an arm\'s x, null outside its z range', () => {
    expect(armXAtZ([[0, 0], [10, 10]], 5)).toBeCloseTo(5);
    expect(armXAtZ([[0, 0], [10, 10]], 11)).toBeNull();
    expect(armXAtZ([[0, 5], [10, 5]], 5)).toBeNull();
  });

  it('spans only a ribbon the bridge is centred on and wider than', () => {
    const course = [[100, 0], [100, 100]] as const;
    expect(bridgeSpans({ x: 100, z: 50, footprint: [RIVER_WIDTH + 2, 4] }, course)).toBe(true);
    expect(bridgeSpans({ x: 100, z: 50, footprint: [RIVER_WIDTH - 2, 4] }, course)).toBe(false);
    expect(bridgeSpans({ x: 110, z: 50, footprint: [RIVER_WIDTH + 2, 4] }, course)).toBe(false);
    expect(bridgeSpans({ x: 100, z: 500, footprint: [RIVER_WIDTH + 2, 4] }, course)).toBe(false);
  });

  it('puts every bridge of the layout over one of the arms', () => {
    const bridges = CINDERREACH_LAYOUT.structures.filter((s) => /bridge/.test(s.id));
    expect(bridges.length).toBeGreaterThan(0);
    for (const b of bridges) expect(Object.values(RIVER_ARMS).some((c) => bridgeSpans(b, c as never)), b.id).toBe(true);
  });
});
