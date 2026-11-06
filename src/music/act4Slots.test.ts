import { describe, expect, it } from 'vitest';
import { ACT4_BOSS_IDS } from '../bosses/act4Bosses';
import { REGION_INFO, regionTrackNow } from '../region/regions';
import { ACT4_BOSS_MIX_KEYS } from './act4Slots';
import { RESERVED_TRACK_IDS, TRACKS_BY_ID } from './tracks';

describe('Act 4 music slots (v0.8 item 19)', () => {
  it('the two Act 4 tracks are built (no longer reserved) and both bosses are mix keys on them', () => {
    // L8 registered both tracks and dropped their reserved rows.
    for (const id of [REGION_INFO['ashen-waste'].track, 'seven-gates-ash']) {
      expect(RESERVED_TRACK_IDS).not.toContain(id);
      expect(TRACKS_BY_ID[id], id).toBeDefined();
    }
    expect([...ACT4_BOSS_MIX_KEYS].sort()).toEqual(Object.values(ACT4_BOSS_IDS).sort());
  });
  it('Harrowmark wants seven-gates-ash only from story.gate.a4', () => {
    expect(regionTrackNow('harrowmark', { getFlag: () => false })).toBe(REGION_INFO.harrowmark.track);
    expect(regionTrackNow('harrowmark', { getFlag: (k) => k === 'story.gate.a4' })).toBe('seven-gates-ash');
  });
});
