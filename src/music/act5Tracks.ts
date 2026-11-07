import type { StemMix, TrackDef } from './tracks';

// Act 5 tracks (design 6.3, plan Part 4 item 17), on the PR #92 synth kit: "Heart of the Anvil" (the Sunforge Caldera),
// the two ending themes and the credits ballad. Data only: tracks.ts registers them and the voices are in act5Voices.ts.
// This file imports types from tracks.ts and nothing at runtime, so tracks.ts can import it without a cycle.

/** The Caldera's track id and BPM (v0.9 item 17 reserved it). */
export const HEART_OF_THE_ANVIL_ID = 'heart-of-the-anvil';
export const ACT5_TRACK_SLOTS: readonly { id: string; bpm: number }[] = [
  { id: HEART_OF_THE_ANVIL_ID, bpm: 100 },
  { id: 'ending.rekindle', bpm: 100 },
  { id: 'ending.let-it-die', bpm: 100 },
  { id: 'credits', bpm: 72 },
];

/** Mix keys the Caldera's cues step through (the helpers in act5Cues.ts and the music router use these, not literals). */
export const SIEGE_LULL_MIX_KEY = 'siege.lull';
export const ULTHRED_DROP_MIX_KEY = 'ulthred.3.drop';
export const ULTHRED_BUILD_MIX_KEY = 'ulthred.3.build';
export const ENDING_THEME_MIX_KEY = 'theme';
export const CREDITS_VERSE_MIX_KEYS = ['credits.gaut', 'credits.keepers', 'credits.houses', 'credits.walkers'] as const;
export const CREDITS_FIRST_MIX_KEY = 'credits.verse1';
export const CREDITS_LAST_MIX_KEY = 'credits.last';
export const CREDITS_LAST_TOBB_MIX_KEY = 'credits.last.tobb';

/** Where each Act 5 boss-mix key is fought: all of them play on the Caldera's own track. */
export const ACT5_BOSS_MIX_TRACK: Readonly<Record<string, string>> = {
  vey: HEART_OF_THE_ANVIL_ID,
  ulthred: HEART_OF_THE_ANVIL_ID,
  'ulthred.1': HEART_OF_THE_ANVIL_ID,
  'ulthred.2': HEART_OF_THE_ANVIL_ID,
  'ulthred.3': HEART_OF_THE_ANVIL_ID,
  [ULTHRED_DROP_MIX_KEY]: HEART_OF_THE_ANVIL_ID,
  [ULTHRED_BUILD_MIX_KEY]: HEART_OF_THE_ANVIL_ID,
  siege: HEART_OF_THE_ANVIL_ID,
  [SIEGE_LULL_MIX_KEY]: HEART_OF_THE_ANVIL_ID,
};

/** A full mix over `stems`: the listed gains, every other stem 0. */
const over = (stems: readonly string[], gains: Readonly<Record<string, number>>): StemMix => {
  const out: Record<string, number> = {};
  for (const s of stems) out[s] = gains[s] ?? 0;
  return out;
};

const HEART_STEMS = ['kick', 'snare', 'hat', 'bass', 'vocal', 'melody', 'boss', 'medley', 'heartbeat'] as const;
const heart = (gains: Readonly<Record<string, number>>): StemMix => over(HEART_STEMS, gains);

const VEY = heart({ kick: 1, snare: 1, hat: 1, bass: 1, vocal: 0.8, melody: 0.3, boss: 1 });
const ULTHRED_1 = heart({ kick: 1, snare: 1, hat: 1, bass: 1, vocal: 1, melody: 0.7, boss: 1 });
const ULTHRED_2 = heart({ kick: 1, snare: 1, hat: 1, bass: 1, vocal: 0.6, melody: 0.5, medley: 1 });
const ULTHRED_3 = heart({ kick: 1, snare: 1, hat: 1, bass: 1, vocal: 1, melody: 1, boss: 0.6, medley: 0.6, heartbeat: 0.8 });

/**
 * "Heart of the Anvil", the Sunforge Caldera: D Dorian (an invented reading, design silent: the dragons' key, hotter than
 * Wing over Rime's Lydian), 100 BPM, nine stems. `boss` is Vey's bitter lead and double-time snare, `medley` is Ulthred's
 * quote of every area's voice, `heartbeat` is his last phase.
 */
export const HEART_OF_THE_ANVIL: TrackDef = {
  id: HEART_OF_THE_ANVIL_ID,
  bpm: 100,
  bars: 16,
  stems: HEART_STEMS,
  mixes: {
    explore: heart({ hat: 0.15, bass: 0.65, vocal: 0.4 }),
    discover: heart({ hat: 0.15, bass: 0.65, vocal: 0.4, melody: 0.9 }),
    silence: heart({}),
    combat: heart({ kick: 1, snare: 1, hat: 0.9, bass: 1, vocal: 1, melody: 0.5 }),
    boss: heart({ kick: 1, snare: 1, hat: 1, bass: 1, vocal: 1, melody: 0.7, boss: 1 }),
    ending: heart({ bass: 0.4, melody: 1 }),
    talk: heart({ bass: 0.5, melody: 0.5 }),
    stealth: heart({ hat: 0.1, bass: 0.6, vocal: 0.35 }),
    chase: heart({ kick: 1, snare: 0.6, hat: 1, bass: 0.9, vocal: 0.5, melody: 0.2 }),
  },
  stealthAlert: {
    suspicious: heart({ kick: 0.15, hat: 0.1, bass: 0.6, vocal: 0.35 }),
    alerted: heart({ kick: 0.3, snare: 0.1, hat: 0.1, bass: 0.6, vocal: 0.35 }),
  },
  bossMixes: {
    // Vey (D09): four poise breaks, no phases, so one mix; the hush is his mercy window (drums out, the lead alone).
    vey: { phases: [VEY], hush: heart({ bass: 0.8, vocal: 0.3, boss: 0.4 }) },
    // Ulthred (D10), three phases from boss.phase; the same mixes are also reachable by id.
    ulthred: { phases: [ULTHRED_1, ULTHRED_2, ULTHRED_3] },
    'ulthred.1': { phases: [ULTHRED_1] },
    'ulthred.2': { phases: [ULTHRED_2] },
    'ulthred.3': { phases: [ULTHRED_3] },
    // Phase 3 drops to the bass and the heartbeat, then builds back in one bar (stepped on the bar line by the router).
    [ULTHRED_DROP_MIX_KEY]: { phases: [heart({ bass: 0.8, heartbeat: 1 })] },
    [ULTHRED_BUILD_MIX_KEY]: { phases: [heart({ kick: 0.6, snare: 0.5, hat: 0.6, bass: 1, vocal: 0.6, heartbeat: 1 })] },
    // The siege (M52, R27) and the breather between its waves.
    siege: { phases: [heart({ kick: 1, snare: 1, hat: 1, bass: 1, vocal: 1, melody: 0.7, boss: 0.5 })] },
    [SIEGE_LULL_MIX_KEY]: { phases: [heart({ hat: 0.15, bass: 0.8, vocal: 0.8, melody: 0.8 })] },
  },
  synth: {
    pattern: [
      'B - B t K - t - B - B t K - t K',
      'B - t B K - t - B B t - K - ts t',
    ],
    bHatExtra: [
      '- - - t - - - - - t - - - t - -',
      '- t - - - - - t - - - - - - t -',
    ],
    tonic: 146.83,
    scale: [0, 2, 3, 5, 7, 9, 10],
    // i, IV, v, i then bVII, IV, v, i: the chest-voice bass moves more here than on any other track.
    bassA: [0, 3, 4, 0],
    bassB: [6, 3, 4, 0],
    vocalA: [0, 2, 3, 0],
    vocalB: [4, 3, 2, 0],
    // The rising tune: the A half climbs, the B half peaks and comes down to the tonic.
    tuneA: [
      [4, 2], [5, 2], [6, 4],
      [7, 2], [6, 2], [5, 4],
      [4, 2], [5, 2], [7, 4],
      [8, 2], [7, 2], [9, 4],
    ],
    tuneB: [
      [9, 2], [8, 2], [7, 4],
      [8, 2], [7, 2], [6, 4],
      [5, 2], [4, 2], [3, 4],
      [2, 2], [1, 2], [0, 4],
    ],
    jitter: 0.005,
    trimDb: -2,
    voices: {
      kick: 'anvil-kick', snare: 'stomp-clap', hat: 'steam-hiss', bass: 'anvil-bass', vocal: 'crew-chant', melody: 'rising-choir',
      boss: 'bitter-lead', medley: 'medley', heartbeat: 'heartbeat',
    },
  },
};

const REKINDLE_STEMS = ['kick', 'bass', 'vocal', 'melody'] as const;
const ENDING_THEME = over(REKINDLE_STEMS, { kick: 0.8, bass: 0.6, vocal: 0.5, melody: 1 });
const THEME_MIXES = (theme: StemMix, stems: readonly string[]): TrackDef['mixes'] => {
  const off = over(stems, {});
  return { explore: theme, discover: theme, silence: off, combat: theme, boss: theme, ending: theme, talk: theme, stealth: theme, chase: theme };
};

/** "The Last Ember": the Caldera's tune lifted into D major, a low "hoh" bed, one strike of the Anvil every two bars. */
export const ENDING_REKINDLE: TrackDef = {
  id: 'ending.rekindle',
  bpm: 100,
  bars: 16,
  stems: REKINDLE_STEMS,
  mixes: THEME_MIXES(ENDING_THEME, REKINDLE_STEMS),
  bossMixes: { [ENDING_THEME_MIX_KEY]: { phases: [ENDING_THEME] } },
  synth: {
    pattern: ['B - - - - - - - - - - - - - - -', '- - - - - - - - - - - - - - - -'],
    bHatExtra: ['- - - - - - - - - - - - - - - -', '- - - - - - - - - - - - - - - -'],
    tonic: 146.83,
    scale: [0, 2, 4, 5, 7, 9, 11],
    bassA: [0, 3, 4, 0],
    bassB: [3, 3, 4, 0],
    vocalA: [0, 2, 3, 0],
    vocalB: [4, 3, 2, 0],
    tuneA: [
      [4, 2], [5, 2], [6, 4],
      [7, 2], [6, 2], [5, 4],
      [4, 2], [5, 2], [7, 4],
      [8, 2], [7, 2], [9, 4],
    ],
    tuneB: [
      [9, 2], [8, 2], [7, 4],
      [8, 2], [7, 2], [6, 4],
      [5, 2], [4, 2], [3, 4],
      [2, 2], [1, 2], [0, 4],
    ],
    jitter: 0.004,
    trimDb: -3,
    voices: { kick: 'anvil-strike', snare: 'snap', bass: 'anvil-bass', vocal: 'crew-hoh', melody: 'rising-choir', boss: 'tolling-gong' },
  },
};

const LONG_STEMS = ['bass', 'vocal', 'melody'] as const;
const LONG_THEME = over(LONG_STEMS, { bass: 0.7, vocal: 0.55, melody: 1 });

/** "The Long Dawn": the same tune slowed to long notes in D Dorian, a bass drone, a breathy choir, no drums. */
export const ENDING_LET_IT_DIE: TrackDef = {
  id: 'ending.let-it-die',
  bpm: 100,
  bars: 16,
  stems: LONG_STEMS,
  mixes: THEME_MIXES(LONG_THEME, LONG_STEMS),
  bossMixes: { [ENDING_THEME_MIX_KEY]: { phases: [LONG_THEME] } },
  synth: {
    pattern: ['- - - - - - - - - - - - - - - -', '- - - - - - - - - - - - - - - -'],
    bHatExtra: ['- - - - - - - - - - - - - - - -', '- - - - - - - - - - - - - - - -'],
    tonic: 146.83,
    scale: [0, 2, 3, 5, 7, 9, 10],
    bassA: [0, 3, 4, 0],
    bassB: [6, 3, 4, 0],
    vocalA: [0, 2, 3, 0],
    vocalB: [4, 3, 2, 0],
    tuneA: [[4, 4], [5, 4], [6, 8], [5, 4], [4, 4], [3, 8]],
    tuneB: [[2, 4], [3, 4], [4, 8], [3, 4], [1, 4], [0, 8]],
    jitter: 0.004,
    trimDb: -5,
    voices: { snare: 'snap', bass: 'drone-bass', vocal: 'falsetto-choir', melody: 'overtone-whistle', boss: 'tolling-gong' },
  },
};

const CREDITS_STEMS = ['bass', 'pluck', 'vocal', 'crew', 'verse-gaut', 'verse-keepers', 'verse-houses', 'verse-walkers'] as const;
const cred = (gains: Readonly<Record<string, number>>): StemMix => over(CREDITS_STEMS, gains);
const CREDITS_BASE = cred({ bass: 0.5, pluck: 0.8, vocal: 0.6 });

/**
 * The credits ballad (72 BPM, D Dorian): Tobb's voice and a lute over a low bass; four verse stems colour R30's chosen
 * verse (gaut, keepers, houses, walkers), and `crew` is the singalong refrain of the last verse. Sung as texture: the
 * words are on screen (N11's credits text).
 */
export const CREDITS: TrackDef = {
  id: 'credits',
  bpm: 72,
  bars: 16,
  stems: CREDITS_STEMS,
  mixes: THEME_MIXES(CREDITS_BASE, CREDITS_STEMS),
  bossMixes: {
    [CREDITS_FIRST_MIX_KEY]: { phases: [cred({ bass: 0.6, pluck: 0.8, vocal: 1 })] },
    'credits.gaut': { phases: [cred({ bass: 0.5, pluck: 0.8, vocal: 1, 'verse-gaut': 1 })] },
    'credits.keepers': { phases: [cred({ bass: 0.5, pluck: 0.7, vocal: 0.8, 'verse-keepers': 1 })] },
    'credits.houses': { phases: [cred({ bass: 0.6, pluck: 0.7, vocal: 0.9, crew: 0.5, 'verse-houses': 0.9 })] },
    'credits.walkers': { phases: [cred({ bass: 0.5, pluck: 0.6, vocal: 0.8, 'verse-walkers': 0.9 })] },
    [CREDITS_LAST_MIX_KEY]: { phases: [cred({ bass: 0.8, pluck: 1, vocal: 1, crew: 1, 'verse-gaut': 0.35, 'verse-keepers': 0.35, 'verse-houses': 0.35, 'verse-walkers': 0.35 })] },
    [CREDITS_LAST_TOBB_MIX_KEY]: { phases: [cred({ bass: 0.5, pluck: 1, vocal: 1 })] },
  },
  synth: {
    pattern: ['- - - - - - - - - - - - - - - -', '- - - - - - - - - - - - - - - -'],
    bHatExtra: ['- - - - - - - - - - - - - - - -', '- - - - - - - - - - - - - - - -'],
    tonic: 146.83,
    scale: [0, 2, 3, 5, 7, 9, 10],
    bassA: [0, 3, 0, 4],
    bassB: [3, 4, 0, 0],
    vocalA: [0, 2, 3, 0],
    vocalB: [4, 3, 2, 0],
    tuneA: [
      [4, 3], [5, 1], [4, 2], [2, 2],
      [0, 4], [2, 2], [3, 2],
      [4, 3], [5, 1], [6, 2], [5, 2],
      [4, 4], [2, 4],
    ],
    tuneB: [
      [7, 3], [6, 1], [5, 2], [4, 2],
      [5, 4], [4, 2], [3, 2],
      [2, 3], [3, 1], [4, 2], [2, 2],
      [0, 8],
    ],
    jitter: 0.004,
    trimDb: -3,
    voices: {
      snare: 'snap', bass: 'anvil-bass', vocal: 'ballad-voice', melody: 'flute', boss: 'tolling-gong', pluck: 'ballad-pluck', crew: 'refrain-crew',
      'verse-gaut': 'verse-gaut', 'verse-keepers': 'verse-keepers', 'verse-houses': 'verse-houses', 'verse-walkers': 'verse-walkers',
    },
  },
};
