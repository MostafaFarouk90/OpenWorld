import type { StemMix, TrackDef } from './tracks';

// Act 4 tracks (design 6.3, plan Part 4 item 19), on the PR #92 synth kit: "Dust Chant" (the Ashen Waste) and the
// Harrowmark ash variant of "Seven Gates, One Drum" (from `story.gate.a4`). Also the shared tune data: Ebba's music box
// and the six glass-pillar pitches of the Singing Slag. Data only: tracks.ts registers the tracks and the voices are in
// act4Voices.ts. This file imports types from tracks.ts and nothing at runtime, so tracks.ts can import it without a cycle.

/** The two Act 4 track ids and their BPM (L0 reserved both ids). */
export const ACT4_TRACK_SLOTS: readonly { id: string; bpm: number }[] = [
  { id: 'dust-chant', bpm: 91 },
  { id: 'seven-gates-ash', bpm: 96 },
];

/**
 * M38, the Council fight (design 6.3: "the melody drops out mid-bar when the betrayal lands"). L10 PR 2 calls
 * `music.setBoss(true, M38_COUNCIL_MIX)` when the chamber turns, then `music.setBoss(true, M38_BETRAYAL_MIX)` the moment
 * the betrayal lands (the 0.4 s ramp drops the melody wherever the bar is), then `setBoss(false)`.
 */
export const M38_COUNCIL_MIX = 'm38-council';
export const M38_BETRAYAL_MIX = 'm38-betrayal';

/** Boss-mix keys by the track that plays where they are fought (the Bellows-Engine in the Crucible, Eormen in the Waste). */
export const ACT4_BOSS_MIX_TRACK: Readonly<Record<string, string>> = {
  'bellows-engine': 'seven-gates-ash',
  eormen: 'dust-chant',
  [M38_COUNCIL_MIX]: 'seven-gates-ash',
  [M38_BETRAYAL_MIX]: 'seven-gates-ash',
};

const mix = (kick: number, snare: number, hat: number, bass: number, vocal: number, melody: number, boss: number, toll?: number): StemMix =>
  toll === undefined ? { kick, snare, hat, bass, vocal, melody, boss } : { kick, snare, hat, bass, vocal, melody, boss, toll };

const STEMS = ['kick', 'snare', 'hat', 'bass', 'vocal', 'melody', 'boss'] as const;

/** "Dust Chant", the Ashen Waste: B Phrygian (an invented reading, design silent), 91 BPM, eight stems (`toll` is Eormen's gong). */
export const DUST_CHANT: TrackDef = {
  id: 'dust-chant',
  bpm: 91,
  bars: 16,
  stems: [...STEMS, 'toll'],
  mixes: {
    explore: mix(0, 0, 0.15, 0.7, 0.5, 0, 0, 0),
    discover: mix(0, 0, 0.15, 0.7, 0.5, 0.9, 0, 0),
    silence: mix(0, 0, 0, 0, 0, 0, 0, 0),
    combat: mix(1, 1, 0.9, 1, 1, 0.3, 0, 0),
    boss: mix(1, 1, 1, 1, 1, 0.7, 1, 0),
    ending: mix(0, 0, 0, 0.4, 0, 1, 0, 0),
    talk: mix(0, 0, 0, 0.5, 0, 0.5, 0, 0),
    stealth: mix(0, 0, 0.1, 0.7, 0.45, 0, 0, 0),
    chase: mix(1, 0.6, 1, 0.9, 0.5, 0.2, 0, 0),
  },
  stealthAlert: {
    suspicious: mix(0.15, 0, 0.1, 0.7, 0.4, 0, 0, 0),
    alerted: mix(0.3, 0.1, 0.1, 0.7, 0.4, 0, 0, 0),
  },
  bossMixes: {
    // Eormen, three phases (three poise bars): the walker chant first, the hollow gong joins, then everything.
    // The hush is his Release window: drums out, the procession and the gong hold.
    eormen: {
      phases: [mix(1, 1, 1, 1, 1, 0.7, 1, 0), mix(1, 1, 1, 1, 1, 0.85, 1, 0.6), mix(1, 1, 1, 1, 1, 1, 1, 1)],
      hush: mix(0, 0, 0.3, 0.8, 0.6, 0.5, 0.7, 1),
    },
  },
  synth: {
    pattern: [
      'B - - - K - t - B - - t K - t -',
      'B - t - K - - t B - B - K - ts t',
    ],
    bHatExtra: [
      '- - - - - - - - - - - - - - - t',
      '- - - - - t - - - - - - - - - -',
    ],
    tonic: 123.47,
    scale: [0, 1, 3, 5, 7, 8, 10],
    // i, i, bII, i then iv, v, bII, i: a drone that barely moves, opening out only in the B half.
    bassA: [0, 0, 1, 0],
    bassB: [3, 4, 1, 0],
    vocalA: [0, 0, 1, 0],
    vocalB: [3, 4, 1, 0],
    tuneA: [
      [0, 4], [1, 2], [3, 2], [1, 4], [0, 4],
      [4, 4], [3, 2], [1, 2], [3, 4], [0, 4],
    ],
    tuneB: [
      [7, 4], [5, 2], [4, 2], [3, 4], [1, 4],
      [3, 2], [4, 2], [5, 4], [4, 2], [1, 2], [0, 4],
    ],
    jitter: 0.006,
    // The sustained drone has a low crest factor: trimmed to the Acts 1 and 2 loudness band.
    trimDb: -4,
    voices: {
      kick: 'muffled', snare: 'dry-slap', hat: 'sand-hiss', bass: 'drone-bass', vocal: 'throat-kh',
      melody: 'overtone-whistle', boss: 'walker-chant', toll: 'hollow-gong',
    },
  },
};

/**
 * The Harrowmark ash variant of "Seven Gates, One Drum": the same 96 BPM and E minor, so the city reads darker, not
 * foreign. Sparser drums held back, a low drone under the shipped "ha-la" chant, a fragment of the trumpet tune, and the
 * Bellows-Engine's hammered industrial boss stem.
 */
export const SEVEN_GATES_ASH: TrackDef = {
  id: 'seven-gates-ash',
  bpm: 96,
  bars: 16,
  stems: STEMS,
  mixes: {
    explore: mix(0, 0, 0.1, 0.5, 0.35, 0, 0),
    discover: mix(0, 0, 0.1, 0.5, 0.35, 0.8, 0),
    silence: mix(0, 0, 0, 0, 0, 0, 0),
    combat: mix(0.7, 0.9, 0.7, 1, 0.9, 0.35, 0),
    boss: mix(0.8, 1, 0.8, 1, 1, 0.6, 1),
    ending: mix(0, 0, 0, 0.4, 0, 1, 0),
    talk: mix(0, 0, 0, 0.5, 0, 0.5, 0),
    stealth: mix(0, 0, 0.08, 0.5, 0.3, 0, 0),
    chase: mix(0.8, 0.6, 0.8, 0.9, 0.5, 0.2, 0),
  },
  stealthAlert: {
    suspicious: mix(0.15, 0, 0.08, 0.5, 0.3, 0, 0),
    alerted: mix(0.3, 0.1, 0.08, 0.5, 0.3, 0, 0),
  },
  bossMixes: {
    // The Bellows-Engine (D07), three poise bars; no hush (a machine has no mercy verb).
    'bellows-engine': {
      phases: [mix(0.8, 1, 0.8, 1, 1, 0.4, 0.8), mix(0.9, 1, 1, 1, 1, 0.6, 1), mix(1, 1, 1, 1, 1, 0.8, 1)],
    },
    // M38: the chamber turns with the trumpet still up; at the betrayal the melody goes out and the drums come forward.
    [M38_COUNCIL_MIX]: { phases: [mix(0.8, 1, 0.8, 1, 1, 0.7, 0)] },
    [M38_BETRAYAL_MIX]: { phases: [mix(1, 1, 1, 1, 1, 0, 0)] },
  },
  synth: {
    pattern: [
      'B - - - - - t - - - - - K - - -',
      'B - - - - - t - - - B - K - - t',
    ],
    bHatExtra: [
      '- - - - - - - - - - t - - - - -',
      '- - t - - - - - - - - - - - - -',
    ],
    tonic: 164.81,
    scale: [0, 2, 3, 5, 7, 8, 10],
    bassA: [0, 0, 3, 4],
    bassB: [0, 5, 3, 4],
    vocalA: [0, 0, 2, 0],
    vocalB: [0, 4, 2, 4],
    // The Seven Gates tune slowed to long notes: the same shape, held like a lament.
    tuneA: [
      [7, 2], [9, 2], [10, 4], [9, 4], [7, 4],
      [4, 2], [5, 2], [7, 4], [6, 4], [4, 4],
    ],
    tuneB: [
      [11, 4], [10, 4], [9, 4], [7, 4],
      [8, 2], [9, 2], [7, 8], [4, 4],
    ],
    trimDb: -4.5,
    voices: {
      kick: 'muffled', snare: 'rimshot', hat: 'sand-hiss', bass: 'drone-bass', vocal: 'throat-chant',
      melody: 'trumpet', boss: 'engine-hammer',
    },
  },
};

// --- Ebba's tune and the Singing Slag --------------------------------------------------------------

/**
 * The six glass pillars of the Singing Slag, in Hz: Dust Chant's B Phrygian degrees 1 to 6 at B4 (B4, C5, D5, E5,
 * F#5, G5). The `sfx.glass.pillar.1` to `.6` sounds ring at exactly these.
 */
export const CHIME_PITCHES_HZ: readonly number[] = [493.88, 523.25, 587.33, 659.26, 739.99, 783.99];

/** The tempo Ebba's tune is played at (Dust Chant's). */
export const EBBA_BPM = 91;

/** Ebba's music-box tune: four bars of 4/4, each note a pillar index (0 to 5) and its length in beats. */
export const EBBA_TUNE: readonly { pillar: number; beats: number }[] = [
  // Bar 1
  { pillar: 2, beats: 1 }, { pillar: 3, beats: 1 }, { pillar: 4, beats: 2 },
  // Bar 2
  { pillar: 5, beats: 1 }, { pillar: 4, beats: 1 }, { pillar: 3, beats: 1 }, { pillar: 2, beats: 1 },
  // Bars 3 and 4
  { pillar: 1, beats: 1 }, { pillar: 2, beats: 1 }, { pillar: 3, beats: 1 }, { pillar: 1, beats: 1 },
  { pillar: 0, beats: 2 }, { pillar: 1, beats: 1 }, { pillar: 0, beats: 1 },
];

/** The three Chime Key phrases as half-open index ranges into `EBBA_TUNE`: bar 1, bar 2, bars 3 and 4. */
export const EBBA_PHRASES: readonly (readonly [number, number])[] = [
  [0, 3],
  [3, 7],
  [7, 14],
];
