import type { StemMix, TrackDef } from './tracks';

// Act 2 tracks (design 6.3), on the PR #92 synth kit. Data only: tracks.ts registers them and the voices are in
// act2Voices.ts. This file imports types from tracks.ts and nothing at runtime.

const mix = (kick: number, snare: number, hat: number, bass: number, vocal: number, melody: number, boss: number): StemMix => ({
  kick, snare, hat, bass, vocal, melody, boss,
});

const STEMS = ['kick', 'snare', 'hat', 'bass', 'vocal', 'melody', 'boss'] as const;

/** Pitch-stable states shared by both tracks: design 6.1 rows (silence, talk, ending) and the Seven Gates shape for the rest. */
const common = (bass: number, stealthVocal: number) => ({
  silence: mix(0, 0, 0, 0, 0, 0, 0),
  boss: mix(1, 1, 1, 1, 1, 0.7, 1),
  ending: mix(0, 0, 0, 0.4, 0, 1, 0),
  talk: mix(0, 0, 0, 0.5, 0, 0.5, 0),
  stealth: mix(0, 0, 0.1, bass, stealthVocal, 0, 0),
  chase: mix(1, 0.6, 1, 0.9, 0.5, 0.2, 0),
});

/** "Ash on the Pasture", Cinderreach Hills: A Dorian, thigh-slap snare, lip-buzz fiddle drone, whistle and click lead. */
export const ASH_ON_THE_PASTURE: TrackDef = {
  id: 'ash-on-the-pasture',
  bpm: 94,
  bars: 16,
  stems: STEMS,
  mixes: {
    ...common(0.6, 0.3),
    explore: mix(0, 0, 0.15, 0.6, 0.35, 0, 0),
    discover: mix(0, 0, 0.15, 0.6, 0.35, 0.9, 0),
    combat: mix(1, 1, 0.85, 1, 0.9, 0.4, 0),
  },
  stealthAlert: {
    suspicious: mix(0.15, 0, 0.1, 0.6, 0.3, 0, 0),
    alerted: mix(0.3, 0.1, 0.1, 0.6, 0.3, 0, 0),
  },
  bossMixes: {
    // Two phases (A8). Spare is his mercy verb: the hush drops the drums and the gallop stem.
    'thrandil-redmane': {
      phases: [mix(1, 1, 1, 1, 1, 0.7, 1), mix(1, 1, 1, 1, 1, 1, 1)],
      hush: mix(0, 0, 0.3, 0.8, 0.6, 0.5, 0),
    },
  },
  synth: {
    pattern: [
      'B - t t K - t - B t B - K - t t',
      'B - t - K t t - B - t B K - ts -',
    ],
    bHatExtra: [
      '- - t - - t - - - t - - t - - t',
      '- t - - - - t - - - t - - t - -',
    ],
    tonic: 220,
    scale: [0, 2, 3, 5, 7, 9, 10],
    bassA: [0, 0, 3, 4],
    bassB: [0, 6, 3, 4],
    vocalA: [0, 0, 4, 0],
    vocalB: [0, 4, 2, 4],
    tuneA: [
      [4, 2], [5, 1], [4, 1], [2, 2], [0, 2], [2, 2], [4, 2], [7, 4],
      [7, 2], [6, 1], [5, 1], [4, 2], [5, 2], [4, 2], [2, 2], [0, 4],
    ],
    tuneB: [
      [9, 2], [7, 1], [6, 1], [7, 2], [4, 2], [6, 2], [7, 2], [9, 4],
      [7, 1], [6, 1], [5, 2], [4, 2], [2, 2], [4, 2], [5, 2], [4, 4],
    ],
    swing: 0.06,
    voices: { snare: 'thigh-slap', vocal: 'lip-buzz', melody: 'whistle-click', boss: 'gallop-hey' },
  },
};

/** "Hammers Below", Oldsmoke Mines: C Phrygian, boxy kick, metallic rim, steam hats, anvil-clang vocal, cave-howl lead. */
export const HAMMERS_BELOW: TrackDef = {
  id: 'hammers-below',
  bpm: 98,
  bars: 16,
  stems: STEMS,
  mixes: {
    ...common(0.65, 0.35),
    explore: mix(0, 0, 0.15, 0.65, 0.4, 0, 0),
    discover: mix(0, 0, 0.15, 0.65, 0.4, 0.9, 0),
    combat: mix(1, 1, 0.9, 1, 1, 0.3, 0),
  },
  stealthAlert: {
    suspicious: mix(0.15, 0, 0.1, 0.65, 0.35, 0, 0),
    alerted: mix(0.3, 0.1, 0.1, 0.65, 0.35, 0, 0),
  },
  bossMixes: {
    // Three breaks. No hush: the Slagmaw has no mercy verb, so the release window leaves its mix alone.
    'the-slagmaw': {
      phases: [mix(1, 1, 0.6, 1, 1, 0.7, 1), mix(1, 1, 1, 1, 1, 0.85, 1), mix(1, 1, 1, 1, 1, 1, 1)],
    },
  },
  synth: {
    pattern: [
      'B - - B K - t - B - t - K - B t',
      'B - B - K - t t B - t B K - ts t',
    ],
    bHatExtra: [
      '- t - - - t - - t - - - t - - t',
      '- - t - - - t - - - t - - t - -',
    ],
    tonic: 130.81,
    scale: [0, 1, 3, 5, 7, 8, 10],
    bassA: [0, 0, 1, 0],
    bassB: [0, 3, 1, 4],
    vocalA: [0, 0, 0, 1],
    vocalB: [0, 4, 3, 1],
    tuneA: [
      [0, 2], [1, 1], [0, 1], [3, 2], [4, 2], [3, 2], [1, 2], [0, 4],
      [0, 2], [3, 1], [4, 1], [5, 2], [4, 2], [3, 2], [1, 2], [0, 4],
    ],
    tuneB: [
      [4, 2], [5, 1], [4, 1], [3, 2], [1, 2], [3, 2], [4, 2], [7, 4],
      [5, 1], [4, 1], [3, 2], [1, 2], [0, 2], [1, 2], [3, 2], [0, 4],
    ],
    jitter: 0.004,
    voices: { snare: 'metal-rim', vocal: 'anvil-clang', melody: 'cave-howl', boss: 'pound-clang', kick: 'boxy', hat: 'steam', bass: 'dum' },
  },
};
