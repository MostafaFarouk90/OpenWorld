export type MixState = 'explore' | 'discover' | 'silence' | 'combat' | 'boss' | 'ending' | 'talk' | 'stealth' | 'chase';

export type StemMix = Readonly<Record<string, number>>;

export interface TrackDef {
  id: string;
  bpm: number;
  /** Bars in the loop; stems all have exactly this many. */
  bars: number;
  stems: readonly string[];
  mixes: Readonly<Record<MixState, StemMix>>;
  /**
   * Boss mixes by boss id: `phases[phase - 1]` (boss phases are 1-based) and an optional `hush` used
   * while the Release window is open. An id without an entry plays `mixes.boss` for every phase.
   */
  bossMixes?: Readonly<Record<string, BossMixDef>>;
  /** Stealth mix while the loudest guard is suspicious or alerted; `calm` plays `mixes.stealth`. */
  stealthAlert?: Readonly<Record<'suspicious' | 'alerted', StemMix>>;
  /** Data for the procedural placeholder stems; absent means the Barley data. */
  synth?: TrackSynth;
}

/** [scale degree, quarter-note beats] pairs. */
export type TuneNote = readonly [number, number];

/** Everything stemSynth needs to render a track's placeholder stems. */
export interface TrackSynth {
  /** Two bars of beatbox notation (16 steps each): B kick, K snare, t closed hat, ts open hat, - rest. */
  pattern: readonly string[];
  /** Extra closed-hat ghost notes for the B half (two bars). */
  bHatExtra: readonly string[];
  /** Tonic in Hz and scale semitone offsets (seven entries). */
  tonic: number;
  scale: readonly number[];
  /** Bass root scale degrees per bar, repeated every four bars. */
  bassA: readonly number[];
  bassB: readonly number[];
  /** Vocal scale degrees per bar, repeated every four bars. */
  vocalA: readonly number[];
  vocalB: readonly number[];
  tuneA: readonly TuneNote[];
  tuneB: readonly TuneNote[];
  voices: {
    snare: 'snap' | 'rimshot';
    vocal: 'hum' | 'throat-chant';
    melody: 'whistle' | 'trumpet';
    boss: 'tolling-gong' | 'steam-anvil';
  };
}

export interface BossMixDef {
  phases: readonly StemMix[];
  hush?: StemMix;
}

const mix = (kick: number, snare: number, hat: number, bass: number, vocal: number, melody: number, boss: number): StemMix => ({
  kick, snare, hat, bass, vocal, melody, boss,
});

/** Barley's placeholder-stem data (D natural minor, D3 root). */
export const BARLEY_SYNTH: TrackSynth = {
  pattern: [
    'B - t - K - t - B - t B K - ts -',
    'B - t - K - t t B - t - K - t ts',
  ],
  bHatExtra: [
    '- t - - - t - t - - - t - t - -',
    '- - t - - - - - t - - - t - - t',
  ],
  tonic: 146.83,
  scale: [0, 2, 3, 5, 7, 8, 10],
  bassA: [0, 0, 5, 4],
  bassB: [0, 2, 5, 4],
  vocalA: [0, 0, 2, 0],
  vocalB: [0, 4, 2, 0],
  tuneA: [
    [7, 2], [9, 1], [8, 1], [7, 2], [4, 2], [5, 2], [6, 2], [7, 4],
    [9, 2], [10, 1], [9, 1], [8, 2], [7, 2], [6, 2], [4, 2], [5, 4],
  ],
  tuneB: [
    [11, 2], [10, 1], [9, 1], [8, 2], [7, 2], [9, 3], [8, 1], [7, 4],
    [4, 1], [5, 1], [6, 2], [7, 2], [9, 2], [8, 2], [6, 2], [7, 4],
  ],
  voices: { snare: 'snap', vocal: 'hum', melody: 'whistle', boss: 'tolling-gong' },
};

/** "Barley and Brazier", Brightwater Fields (design 6.3). */
export const BARLEY_AND_BRAZIER: TrackDef = {
  id: 'barley-and-brazier',
  bpm: 92,
  bars: 16,
  stems: ['kick', 'snare', 'hat', 'bass', 'vocal', 'melody', 'boss'],
  mixes: {
    explore: mix(0, 0, 0.15, 0.6, 0.3, 0, 0),
    discover: mix(0, 0, 0.15, 0.6, 0.3, 0.9, 0),
    silence: mix(0, 0, 0, 0, 0, 0, 0),
    combat: mix(1, 0.9, 0.8, 1, 0.9, 0.35, 0),
    boss: mix(1, 1, 1, 1, 1, 0.7, 1),
    ending: mix(0, 0, 0, 0.4, 0, 1, 0),
    talk: mix(0, 0, 0, 0.5, 0, 0.5, 0),
    // Slice 2 phase B (this thread's reading; not in design 6.1). Alert overlays are in `stealthAlert`.
    stealth: mix(0, 0, 0.1, 0.5, 0.2, 0, 0),
    chase: mix(1, 0.6, 1, 0.9, 0.5, 0.2, 0),
  },
  synth: BARLEY_SYNTH,
  stealthAlert: {
    suspicious: mix(0.15, 0, 0.1, 0.5, 0.2, 0, 0),
    alerted: mix(0.3, 0.1, 0.1, 0.5, 0.2, 0, 0),
  },
  bossMixes: {
    // Design 6.1 trigger 3: phase 2 and 3 re-ramp the same seven stems (hat, boss and melody lift).
    'ashen-prior': {
      phases: [
        mix(1, 1, 1, 1, 1, 0.7, 1),
        mix(1, 1, 1, 1, 1, 0.85, 1),
        mix(1, 1, 1, 1, 1, 1, 1),
      ],
      // The Release choice: drums drop out, the tolling chant and bass hold.
      hush: mix(0, 0, 0.3, 0.8, 0.6, 0.5, 1),
    },
  },
};

/** "Seven Gates, One Drum": E natural minor, marching rimshot, throat chant, trumpet-lip melody. */
export const SEVEN_GATES_ONE_DRUM: TrackDef = {
  id: 'seven-gates-one-drum',
  bpm: 96,
  bars: 16,
  stems: ['kick', 'snare', 'hat', 'bass', 'vocal', 'melody', 'boss'],
  mixes: {
    explore: mix(0, 0, 0.15, 0.6, 0.35, 0, 0),
    discover: mix(0, 0, 0.15, 0.6, 0.35, 0.9, 0),
    silence: mix(0, 0, 0, 0, 0, 0, 0),
    combat: mix(1, 1, 0.9, 1, 1, 0.4, 0),
    boss: mix(1, 1, 1, 1, 1, 0.7, 1),
    ending: mix(0, 0, 0, 0.4, 0, 1, 0),
    talk: mix(0, 0, 0, 0.5, 0, 0.5, 0),
    stealth: mix(0, 0, 0.1, 0.5, 0.2, 0, 0),
    chase: mix(1, 0.6, 1, 0.9, 0.5, 0.2, 0),
  },
  stealthAlert: {
    suspicious: mix(0.15, 0, 0.1, 0.5, 0.2, 0, 0),
    alerted: mix(0.3, 0.1, 0.1, 0.5, 0.2, 0, 0),
  },
  bossMixes: {
    'gaffer-grimtooth': {
      phases: [
        mix(1, 1, 1, 1, 1, 0.7, 1),
        mix(1, 1, 1, 1, 1, 0.85, 1),
        mix(1, 1, 1, 1, 1, 1, 1),
      ],
      hush: mix(0, 0, 0.3, 0.8, 0.6, 0.5, 1),
    },
  },
  synth: {
    pattern: [
      'B - - t K - t - B - B t K - t ts',
      'B - t - K - t t B - - t K K t -',
    ],
    bHatExtra: [
      '- - t - - t - - - t - - t - - t',
      '- t - - - - t - - - t - - t - -',
    ],
    tonic: 164.81,
    scale: [0, 2, 3, 5, 7, 8, 10],
    bassA: [0, 0, 3, 4],
    bassB: [0, 5, 3, 4],
    vocalA: [0, 0, 2, 0],
    vocalB: [0, 4, 2, 4],
    tuneA: [
      [7, 1], [7, 1], [9, 2], [10, 2], [9, 2], [7, 4], [4, 1], [4, 1], [5, 2], [7, 2], [6, 2], [4, 4],
      [7, 1], [9, 1], [11, 2], [10, 2], [9, 2],
    ],
    tuneB: [
      [11, 2], [12, 1], [11, 1], [10, 2], [9, 2], [11, 3], [10, 1], [9, 4],
      [7, 1], [8, 1], [9, 2], [11, 2], [10, 2], [9, 2], [8, 2], [7, 4],
    ],
    voices: { snare: 'rimshot', vocal: 'throat-chant', melody: 'trumpet', boss: 'steam-anvil' },
  },
};

export const TRACKS_BY_ID: Readonly<Record<string, TrackDef>> = {
  [BARLEY_AND_BRAZIER.id]: BARLEY_AND_BRAZIER,
  [SEVEN_GATES_ONE_DRUM.id]: SEVEN_GATES_ONE_DRUM,
};

/** The one canonical sample length of every stem: round(bars * 240 / bpm * sampleRate). */
export function loopSamples(track: Pick<TrackDef, 'bars' | 'bpm'>, sampleRate: number): number {
  return Math.round(((track.bars * 240) / track.bpm) * sampleRate);
}

export function loopSeconds(track: Pick<TrackDef, 'bars' | 'bpm'>, sampleRate: number): number {
  return loopSamples(track, sampleRate) / sampleRate;
}

/** Throws a descriptive error when a track definition cannot be played. */
export function validateTrack(track: TrackDef): void {
  const fail = (why: string): never => {
    throw new Error(`Track "${track.id}": ${why}`);
  };
  if (!Number.isFinite(track.bpm) || track.bpm <= 0) fail(`bpm must be positive, got ${track.bpm}`);
  if (!Number.isInteger(track.bars) || track.bars <= 0 || track.bars % 2 !== 0) {
    fail(`bars must be a positive even integer (A and B halves), got ${track.bars}`);
  }
  if (track.stems.length === 0) fail('has no stems');
  if (new Set(track.stems).size !== track.stems.length) fail('has duplicate stem ids');
  const allMixes: Array<[string, StemMix]> = Object.entries(track.mixes);
  for (const [id, def] of Object.entries(track.bossMixes ?? {})) {
    if (def.phases.length === 0) fail(`boss mix "${id}" has no phases`);
    def.phases.forEach((m, i) => allMixes.push([`boss ${id} phase ${i + 1}`, m]));
    if (def.hush) allMixes.push([`boss ${id} hush`, def.hush]);
  }
  for (const [level, m] of Object.entries(track.stealthAlert ?? {})) allMixes.push([`stealth ${level}`, m]);
  for (const [state, stemMix] of allMixes) {
    for (const [stem, gain] of Object.entries(stemMix)) {
      if (!track.stems.includes(stem)) fail(`mix "${state}" references unknown stem "${stem}"`);
      if (!Number.isFinite(gain) || gain < 0 || gain > 1) fail(`mix "${state}" has gain ${gain} for "${stem}"`);
    }
  }
}
