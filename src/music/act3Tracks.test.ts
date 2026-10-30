import { describe, expect, it } from 'vitest';
import { ACT3_BOSS_MIX_KEYS, ACT3_TRACK_SLOTS, YSMERYTH_TRIAL_ID } from './act3Tracks';
import { PEAT_AND_PITCH, RESERVED_TRACK_IDS, RESERVED_TRACKS, TRACKS_BY_ID, WING_OVER_RIME, validateTrack } from './tracks';
import { REGION_INFO } from '../region/regions';
import { ACT3_BOSS_IDS } from '../bosses/act3Bosses';

describe('Act 3 tracks (v0.7 item 23, built by the Act 3 sound pass)', () => {
  it('records the BPM as data', () => {
    expect(ACT3_TRACK_SLOTS).toEqual([{ id: 'peat-and-pitch', bpm: 90 }, { id: 'wing-over-rime', bpm: 100 }]);
  });
  it('the greyfen and dragonspine region tracks are built and registered, and nothing is reserved', () => {
    for (const [r, track] of [['greyfen', PEAT_AND_PITCH], ['dragonspine', WING_OVER_RIME]] as const) {
      const id = REGION_INFO[r].track;
      expect(id).toBe(track.id);
      expect(TRACKS_BY_ID[id]).toBe(track);
      expect(RESERVED_TRACK_IDS).not.toContain(id);
    }
    expect(RESERVED_TRACKS).toEqual([]);
    expect(RESERVED_TRACK_IDS).toEqual([]);
  });
  it('each built track matches its slot and validates', () => {
    for (const slot of ACT3_TRACK_SLOTS) {
      const track = TRACKS_BY_ID[slot.id];
      expect(track.bpm).toBe(slot.bpm);
      expect(() => validateTrack(track)).not.toThrow();
    }
  });
  it('boss mix keys cover both Act 3 bosses and the trial', () => {
    expect(ACT3_BOSS_MIX_KEYS).toEqual(['murkjaw', 'corvin-skarl', 'ysmeryth-trial']);
    expect(YSMERYTH_TRIAL_ID).toBe('ysmeryth-trial');
    for (const id of Object.values(ACT3_BOSS_IDS)) expect(ACT3_BOSS_MIX_KEYS).toContain(id);
  });
  it('every boss mix key is carried by exactly one built track', () => {
    const owners = (key: string): string[] => ACT3_TRACK_SLOTS.filter((s) => TRACKS_BY_ID[s.id].bossMixes?.[key]).map((s) => s.id);
    expect(owners('murkjaw')).toEqual(['peat-and-pitch']);
    expect(owners('corvin-skarl')).toEqual(['wing-over-rime']);
    expect(owners(YSMERYTH_TRIAL_ID)).toEqual(['wing-over-rime']);
  });
});
