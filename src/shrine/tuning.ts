/** Numbers for the Quenchstone Shrine, the Warmth Tier and the wardstone rhythm (plans/slice-2-shrine-warmth.md). */
export const SHRINE_TUNING = {
  cooled: {
    buffId: 'shrine.cooled',
    nameKey: 'shrine.cooled',
    /** Design 7.1: +10% max health for 20 minutes of simulated time. */
    seconds: 20 * 60,
    multiplier: 1.1,
  },
  basin: {
    triggerId: 'trg.shrine.basin',
    anchorId: 'shrine.quenchstone.basin',
    /** Fraction of max health restored per second while standing in a lit basin. */
    healFractionPerSecond: 0.08,
    /** Burn is cleared on entering and then at this period while the player stays. */
    burnClearPeriod: 0.5,
  },
  respec: {
    /** Metres from the basin anchor; clear of the 2.5 m hold-F radius of the waystone at the pillar. */
    offsetX: 4.5,
    radius: 1.2,
    /** The no-dialog fallback: confirm within this long, and without leaving the radius. */
    confirmSeconds: 4,
  },
  wardstones: {
    /** The track's tempo (music-states.md section 3); also the fallback metronome. */
    bpm: 92,
    /** A hit is |error| <= this, inclusive. */
    windowMs: 120,
    phraseLength: 3,
    strikeRange: 3,
    strikeConeDegrees: 120,
    count: 5,
    /** Beats ignored after the beat source switches, so the player can hear the new beat. */
    listenBeats: 1,
  },
} as const;
