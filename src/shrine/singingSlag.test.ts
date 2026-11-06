// v0.8 item 13: the Singing Slag is the seventh main-path shrine, placed in the open Waste outside the Caldera.
import { describe, expect, it } from 'vitest';
import { SHRINE_POSITIONS } from '../map/ForgeMarks';
import { SHRINE_ANCHORS } from '../map/MapSources';
import { engineBox } from '../region/regions';
import { regionAt } from '../region/regionMask';
import { SHRINE_IDS, shrineFlag, warmthTier } from './warmth';

describe('singing-slag', () => {
  it('seven lit shrines including it give Warmth Tier 7', () => {
    const lit = new Set(SHRINE_IDS.filter((id) => id !== 'anvil-of-ages').map(shrineFlag));
    expect(lit.has(shrineFlag('singing-slag'))).toBe(true);
    expect(warmthTier((k) => lit.has(k))).toBe(7);
  });
  it('stands in the Waste, outside the Caldera, with its reserved anchor id', () => {
    const p = SHRINE_POSITIONS['singing-slag']!;
    expect(regionAt(p.x, p.z)?.id).toBe('ashen-waste');
    const c = engineBox('caldera');
    expect(p.x >= c.x0 && p.x < c.x1 && p.z >= c.z0 && p.z < c.z1).toBe(false);
    expect(SHRINE_ANCHORS['singing-slag']).toBe('waste.glasslands.singing-slag');
  });
});
