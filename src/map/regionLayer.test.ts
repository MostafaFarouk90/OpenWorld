import { describe, expect, it } from 'vitest';
import { REGION_IDS, REGION_INFO, engineBox, type RegionId } from '../region/regions';
import { chipsKey, openRegionAt, regionChips } from './regionLayer';
import { MAP_STRINGS_EN } from './strings.en';

const ACT1_OPEN: RegionId[] = ['brightwater', 'harrowmark'];

describe('regionChips', () => {
  it('Act 1: names Brightwater and Harrowmark, every other region reads Unknown lands', () => {
    const chips = regionChips(ACT1_OPEN);
    const byId = new Map(chips.map((c) => [c.id, c]));
    expect(byId.get('brightwater')!.labelKey).toBe('map.region.brightwater');
    expect(byId.get('harrowmark')!.labelKey).toBe('map.region.harrowmark');
    for (const c of chips) if (!ACT1_OPEN.includes(c.id)) {
      expect(c.closed).toBe(true);
      expect(c.labelKey).toBe('map.region.unknown');
    }
    // Act 1's map must not name Act 2.
    const names = chips.map((c) => MAP_STRINGS_EN[c.labelKey]);
    expect(names.join('|')).not.toMatch(/Cinderreach|Oldsmoke/);
  });

  it('opening a region names it', () => {
    const c = regionChips([...ACT1_OPEN, 'cinderreach']).find((x) => x.id === 'cinderreach')!;
    expect(c.closed).toBe(false);
    expect(MAP_STRINGS_EN[c.labelKey]).toBe('Cinderreach');
  });

  it('Phase C hold: Oldsmoke stays closed while containment does not list it, then opens', () => {
    const phaseC = regionChips([...ACT1_OPEN, 'cinderreach']);
    expect(phaseC.find((c) => c.id === 'oldsmoke')!.closed).toBe(true);
    const phaseD = regionChips([...ACT1_OPEN, 'cinderreach', 'oldsmoke']);
    expect(phaseD.find((c) => c.id === 'oldsmoke')!.closed).toBe(false);
  });

  it('a reserved region is closed even if a bad open list names it', () => {
    // v0.7: the Greyfen and the Dragonspine are built; the Ashen Waste stays reserved (Act 4).
    const c = regionChips(['ashen-waste']).find((x) => x.id === 'ashen-waste')!;
    expect(c.closed).toBe(true);
  });

  it('skips a region wholly inside another (the Caldera inside the Ashen Waste)', () => {
    const ids = regionChips([]).map((c) => c.id);
    expect(ids).toContain('ashen-waste');
    expect(ids).not.toContain('caldera' as RegionId);
  });

  it('no two chips are close enough to overlap, in any open state', () => {
    for (const open of [[], ACT1_OPEN, REGION_IDS.filter((id) => !REGION_INFO[id].reserved)] as RegionId[][]) {
      const chips = regionChips(open);
      for (let i = 0; i < chips.length; i++) for (let j = i + 1; j < chips.length; j++) {
        // A chip is about 150 m wide at 65 m a pixel on the 384 px map; require 2 km of clearance.
        expect(Math.hypot(chips[i]!.x - chips[j]!.x, chips[i]!.z - chips[j]!.z)).toBeGreaterThan(2000);
      }
    }
  });

  it('boxes are engine space and inside the world', () => {
    for (const c of regionChips([])) {
      const b = engineBox(c.id);
      expect(c.box).toEqual(b);
      expect(c.x).toBeCloseTo((b.x0 + b.x1) / 2);
    }
  });

  it('chipsKey changes only when the open set changes', () => {
    const a = chipsKey(regionChips(ACT1_OPEN));
    expect(chipsKey(regionChips(ACT1_OPEN))).toBe(a);
    expect(chipsKey(regionChips([...ACT1_OPEN, 'cinderreach']))).not.toBe(a);
  });
});

describe('openRegionAt', () => {
  it('names the open region a point is in, null between regions and for closed or bad input', () => {
    const open: RegionId[] = ACT1_OPEN;
    expect(openRegionAt(0, 0, open)).toBe('brightwater');
    expect(openRegionAt(8500, 1250, open)).toBe('harrowmark');
    expect(openRegionAt(6000, 1000, open)).toBeNull(); // the null corridor between them
    expect(openRegionAt(20000, 3000, open)).toBeNull(); // Cinderreach is closed
    expect(openRegionAt(20000, 3000, [...open, 'cinderreach'])).toBe('cinderreach');
    expect(openRegionAt(NaN, 0, open)).toBeNull();
    expect(openRegionAt(12000, 8000, ['caldera' as RegionId])).toBeNull();
  });
});
