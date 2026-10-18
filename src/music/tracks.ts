export type MixState = 'explore' | 'discover' | 'silence' | 'combat' | 'boss' | 'ending' | 'talk';

export type StemMix = Readonly<Record<string, number>>;

export interface TrackDef {
  id: string;
  bpm: number;
  /** Bars in the loop; stems all have exactly this many. */
  bars: number;
  stems: readonly string[];
  mixes: Readonly<Record<MixState, StemMix>>;
}

const mix = (kick: number, snare: number, hat: number, bass: number, vocal: number, melody: number, boss: number): StemMix => ({
  kick, snare, hat, bass, vocal, melody, boss,
});

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
  },
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
  for (const [state, stemMix] of Object.entries(track.mixes)) {
    for (const [stem, gain] of Object.entries(stemMix)) {
      if (!track.stems.includes(stem)) fail(`mix "${state}" references unknown stem "${stem}"`);
      if (!Number.isFinite(gain) || gain < 0 || gain > 1) fail(`mix "${state}" has gain ${gain} for "${stem}"`);
    }
  }
}
