import type { StemMix, TrackDef } from './tracks';

// Act 3 tracks (design 6.3), on the PR #92 synth kit: "Peat and Pitch" (Greyfen) and "Wing over Rime" (Dragonspine).
// Data only: tracks.ts registers them and the voices are in act3Voices.ts. This file imports types from tracks.ts
// and nothing at runtime, so tracks.ts can import it without a cycle.

/** The two region tracks, with the BPM the design fixes. */
export const ACT3_TRACK_SLOTS: readonly { id: string; bpm: number }[] = [
  { id: 'peat-and-pitch', bpm: 90 },
  { id: 'wing-over-rime', bpm: 100 },
];

/** The `trialId` M31's Ysmeryth trial starts with; also the key of Wing over Rime's trial mix (warm cathedral chant). */
export const YSMERYTH_TRIAL_ID = 'ysmeryth-trial';

/** Boss-mix keys the Act 3 tracks carry in `bossMixes` (boss ids, and the Ysmeryth trial id). */
export const ACT3_BOSS_MIX_KEYS: readonly string[] = ['murkjaw', 'corvin-skarl', YSMERYTH_TRIAL_ID];

const mix = (kick: number, snare: number, hat: number, bass: number, vocal: number, melody: number, boss: number, chant?: number): StemMix =>
  chant === undefined ? { kick, snare, hat, bass, vocal, melody, boss } : { kick, snare, hat, bass, vocal, melody, boss, chant };

const STEMS = ['kick', 'snare', 'hat', 'bass', 'vocal', 'melody', 'boss'] as const;

/** Pitch-stable states shared by both tracks: design 6.1 rows (silence, talk, ending) and the Seven Gates shape for the rest. */
const common = (bass: number, stealthVocal: number, chant?: number) => ({
  silence: mix(0, 0, 0, 0, 0, 0, 0, chant),
  boss: mix(1, 1, 1, 1, 1, 0.7, 1, chant),
  ending: mix(0, 0, 0, 0.4, 0, 1, 0, chant),
  talk: mix(0, 0, 0, 0.5, 0, 0.5, 0, chant),
  stealth: mix(0, 0, 0.1, bass, stealthVocal, 0, 0, chant),
  chase: mix(1, 0.6, 1, 0.9, 0.5, 0.2, 0, chant),
});

/** "Peat and Pitch", Greyfen Marches: A natural minor, 90 BPM, wet kick, finger-flick plip, bubble hats, bog hum and reed whistle. */
export const PEAT_AND_PITCH: TrackDef = {
  id: 'peat-and-pitch',
  bpm: 90,
  bars: 16,
  stems: STEMS,
  mixes: {
    ...common(0.6, 0.4),
    explore: mix(0, 0, 0.15, 0.6, 0.4, 0, 0),
    discover: mix(0, 0, 0.15, 0.6, 0.4, 0.9, 0),
    combat: mix(1, 0.9, 0.8, 1, 0.9, 0.4, 0),
  },
  stealthAlert: {
    suspicious: mix(0.15, 0, 0.1, 0.6, 0.35, 0, 0),
    alerted: mix(0.3, 0.1, 0.1, 0.6, 0.35, 0, 0),
  },
  bossMixes: {
    // Murkjaw, three phases. Design: the hat stops and the bubble-pop vocal takes its place for the first phase.
    // No hush: he has no mercy verb, so the release window leaves the mix alone.
    murkjaw: {
      phases: [mix(1, 1, 0, 1, 1, 0.7, 1), mix(1, 1, 1, 1, 1, 0.85, 1), mix(1, 1, 1, 1, 1, 1, 1)],
    },
  },
  synth: {
    pattern: [
      'B - - t - K - t B - t - - K - t',
      'B - t - - K t - B - - t K - t ts',
    ],
    bHatExtra: [
      '- t - - - - t - - - t - - - - t',
      '- - - t - - - t - - - - t - - -',
    ],
    tonic: 220,
    scale: [0, 2, 3, 5, 7, 8, 10],
    // i, VI, iv, v then i, III, VI, v.
    bassA: [0, 5, 3, 4],
    bassB: [0, 2, 5, 4],
    vocalA: [0, 0, 3, 4],
    vocalB: [0, 2, 5, 4],
    tuneA: [
      [4, 2], [3, 1], [2, 1], [0, 2], [2, 2], [3, 2], [4, 2], [2, 4],
      [4, 2], [5, 1], [4, 1], [3, 2], [2, 2], [0, 2], [2, 2], [0, 4],
    ],
    tuneB: [
      [7, 2], [6, 1], [5, 1], [4, 2], [3, 2], [4, 2], [5, 2], [4, 4],
      [2, 1], [3, 1], [4, 2], [3, 2], [2, 2], [0, 2], [1, 2], [0, 4],
    ],
    jitter: 0.006,
    voices: { snare: 'plip', vocal: 'bog-chant', melody: 'reed-whistle', boss: 'gurgle-chant', kick: 'wet', hat: 'bubble', bass: 'peat-hum' },
  },
};

/** "Wing over Rime", Dragonspine Peaks: D Lydian (an invented reading, kept as `scale` data), 100 BPM, eight stems. */
export const WING_OVER_RIME: TrackDef = {
  id: 'wing-over-rime',
  bpm: 100,
  bars: 16,
  stems: [...STEMS, 'chant'],
  mixes: {
    ...common(0.55, 0.45, 0),
    explore: mix(0, 0, 0.15, 0.55, 0.45, 0, 0, 0),
    discover: mix(0, 0, 0.15, 0.55, 0.45, 0.9, 0, 0),
    combat: mix(1, 1, 0.9, 1, 1, 0.5, 0, 0),
  },
  stealthAlert: {
    suspicious: mix(0.15, 0, 0.1, 0.55, 0.4, 0, 0, 0),
    alerted: mix(0.3, 0.1, 0.1, 0.55, 0.4, 0, 0, 0),
  },
  bossMixes: {
    // Skarl, two phases and a hush for his Spare window: the drums go out, the bass and the harsh chant hold.
    'corvin-skarl': {
      phases: [mix(1, 1, 1, 1, 1, 0.7, 1, 0), mix(1, 1, 1, 1, 1, 1, 1, 0)],
      hush: mix(0, 0, 0.3, 0.8, 0.6, 0.5, 1, 0),
    },
    // The Ysmeryth trial: the warm cathedral chant carries it, the harsh boss stem stays out, the drums are a heartbeat.
    [YSMERYTH_TRIAL_ID]: {
      phases: [mix(0.3, 0.3, 0.2, 0.7, 0.5, 0.6, 0, 1), mix(0.3, 0.3, 0.2, 0.7, 0.5, 0.8, 0, 1)],
    },
  },
  synth: {
    pattern: [
      'B - t - K - t B B - t - K - t t',
      'B - t t K - t - B - B t K - ts -',
    ],
    bHatExtra: [
      '- t - - - t - - - - t - - t - -',
      '- - t - - - - t - - - t - - - t',
    ],
    tonic: 146.83,
    scale: [0, 2, 4, 6, 7, 9, 11],
    // I, II, vi, V then I, vi, II, V.
    bassA: [0, 1, 5, 4],
    bassB: [0, 5, 1, 4],
    vocalA: [4, 5, 2, 1],
    vocalB: [4, 2, 5, 1],
    tuneA: [
      [4, 2], [7, 2], [9, 4], [8, 2], [7, 2], [4, 4],
      [5, 2], [8, 2], [10, 4], [9, 2], [8, 2], [7, 4],
    ],
    tuneB: [
      [7, 4], [9, 2], [11, 2], [10, 2], [9, 2], [7, 4],
      [8, 2], [7, 2], [6, 2], [4, 2], [5, 4], [7, 4],
    ],
    jitter: 0.004,
    voices: {
      snare: 'room-clap', vocal: 'falsetto-choir', melody: 'soar-whistle', boss: 'harsh-chant',
      kick: 'airy', hat: 'tick', bass: 'chest-bass', chant: 'cathedral-chant',
    },
  },
};
