// Act 3 track slots (v0.7 item 23). Data only: the tracks themselves are built later by the sound thread, which moves
// each slot into TRACKS_BY_ID (and out of RESERVED_TRACKS) in the same change. Until then the music plugin knows the ids
// and does not warn about them. No runtime imports, so tracks.ts can import this file.

/** The two region tracks, with the BPM the design fixes. */
export const ACT3_TRACK_SLOTS: readonly { id: string; bpm: number }[] = [
  { id: 'peat-and-pitch', bpm: 90 },
  { id: 'wing-over-rime', bpm: 100 },
];

/** Boss-mix keys the Act 3 tracks will carry in `bossMixes` (boss ids, and the Ysmeryth trial id). */
export const ACT3_BOSS_MIX_KEYS: readonly string[] = ['murkjaw', 'corvin-skarl', 'ysmeryth-trial'];
