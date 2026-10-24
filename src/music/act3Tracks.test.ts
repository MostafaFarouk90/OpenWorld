import { describe, expect, it } from 'vitest';
import { ACT3_BOSS_MIX_KEYS, ACT3_TRACK_SLOTS } from './act3Tracks';
import { RESERVED_TRACK_IDS, RESERVED_TRACKS, TRACKS_BY_ID } from './tracks';
import { REGION_INFO } from '../region/regions';
import { ACT3_BOSS_IDS } from '../bosses/act3Bosses';

describe('Act 3 track slots (v0.7 item 23)', () => {
  it('records the BPM as data', () => {
    expect(ACT3_TRACK_SLOTS).toEqual([{ id: 'peat-and-pitch', bpm: 90 }, { id: 'wing-over-rime', bpm: 100 }]);
  });
  it('the greyfen and dragonspine region tracks are reserved, and not yet built', () => {
    for (const r of ['greyfen', 'dragonspine'] as const) {
      const id = REGION_INFO[r].track;
      expect(RESERVED_TRACK_IDS).toContain(id);
      expect(TRACKS_BY_ID[id]).toBeUndefined();
    }
    expect(RESERVED_TRACKS).toEqual(ACT3_TRACK_SLOTS);
  });
  it('boss mix keys cover both Act 3 bosses and the trial', () => {
    expect(ACT3_BOSS_MIX_KEYS).toEqual(['murkjaw', 'corvin-skarl', 'ysmeryth-trial']);
    for (const id of Object.values(ACT3_BOSS_IDS)) expect(ACT3_BOSS_MIX_KEYS).toContain(id);
  });
});
