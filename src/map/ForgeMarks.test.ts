import { describe, expect, it } from 'vitest';
import { SHRINE_IDS, SHRINE_POSITIONS } from './ForgeMarks';

describe('SHRINE_POSITIONS (v0.7 item 17)', () => {
  it('places the three Act 3 shrines', () => {
    expect(SHRINE_POSITIONS['hathrens-mere']).toEqual({ x: 3000, z: 12050 });
    expect(SHRINE_POSITIONS['last-anvil']).toEqual({ x: 14700, z: 13900 });
    expect(SHRINE_POSITIONS['wyrms-hearth']).toEqual({ x: 13600, z: 15600 });
    expect(SHRINE_POSITIONS.quenchstone).toEqual({ x: 900, z: -170 });
  });
  it('only names known shrine ids, with finite positions', () => {
    for (const [id, p] of Object.entries(SHRINE_POSITIONS)) {
      expect(SHRINE_IDS).toContain(id);
      expect(Number.isFinite(p!.x) && Number.isFinite(p!.z)).toBe(true);
    }
  });
});
