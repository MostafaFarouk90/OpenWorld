import { describe, expect, it } from 'vitest';
import { ACT4_BOSS_IDS } from '../bosses/act4Bosses';
import { REGION_INFO, regionTrackNow } from '../region/regions';
import { ACT4_BOSS_MIX_KEYS } from './act4Slots';
import { RESERVED_TRACK_IDS } from './tracks';

describe('Act 4 music slots (v0.8 item 19)', () => {
  it('reserves the two Act 4 tracks and names both bosses as mix keys', () => {
    expect(RESERVED_TRACK_IDS).toEqual(expect.arrayContaining([REGION_INFO['ashen-waste'].track, 'seven-gates-ash']));
    expect([...ACT4_BOSS_MIX_KEYS].sort()).toEqual(Object.values(ACT4_BOSS_IDS).sort());
  });
  it('Harrowmark wants seven-gates-ash only from story.gate.a4', () => {
    expect(regionTrackNow('harrowmark', { getFlag: () => false })).toBe(REGION_INFO.harrowmark.track);
    expect(regionTrackNow('harrowmark', { getFlag: (k) => k === 'story.gate.a4' })).toBe('seven-gates-ash');
  });
});
