// The Singing Slag's three phrases (Act 4 L1 PR 2, plans/act4-L1.md section 17; design 7.7): Ebba's tune in the Dust Chant's
// notation. Each phrase is one 16-step bar; each strike names a glass pillar (1 to 6, west to east along the arc) and an
// attack key (1 to 4). Plain data and tuning.

export interface ChimePhrase {
  /** Strike steps of the 16-step bar (RhythmRun's custom steps: ascending, at least 2 apart). */
  steps: readonly number[];
  /** The pillar (1 to 6) each strike rings. */
  pillars: readonly number[];
  /** The attack key (1 to 4) each strike needs. */
  keys: readonly (1 | 2 | 3 | 4)[];
}

/** Four, five and six strikes (the plan keeps M45's phrases short: R13's 22-strike song was the playthrough's slowest beat). */
export const CHIME_PHRASES: readonly ChimePhrase[] = [
  { steps: [0, 4, 8, 12], pillars: [1, 3, 2, 4], keys: [1, 1, 2, 1] },
  { steps: [0, 4, 6, 10, 12], pillars: [2, 4, 5, 3, 1], keys: [1, 2, 2, 3, 1] },
  { steps: [0, 2, 6, 8, 12, 14], pillars: [6, 5, 3, 4, 2, 1], keys: [2, 1, 3, 4, 1, 1] },
];

export const CHIME_TUNING = {
  /** The Dust Chant's tempo (L8); the puzzle runs on a metronome at it, so the music is never needed. */
  bpm: 91,
  divisions: 4,
  /** The player strikes from within this many metres of `waste.glasslands.strike`. */
  strikeRadius: 3.5,
  /** Fails on one phrase before the plaque hums it and the next run shows each pillar a beat early (the lesson). */
  lessonAfter: 2,
  /** R13's numbers: the hit window widens after three fails on a phrase... */
  widenAfter: 3,
  wideGoodMs: 260,
  /** ...and after five the next run is struck for the player, so M45 can never loop for ever. */
  assistAfter: 5,
  /** Presses off the pattern a phrase forgives (R13's number). */
  straysAllowed: 3,
  /** A struck pillar glows for this many steps. */
  ringSteps: 2,
  /** The lesson's lead light shows a pillar this many steps before its strike (one beat). */
  leadSteps: 4,
} as const;

export const CHIME_PHRASE_FLAG = 'story.m45.chime.phrase';
export const CHIME_FAILS_FLAG = 'story.m45.chime.fails';
/** The puzzle runs while M45 is under way and the shrine is unlit. */
export const CHIME_LIVE_FLAG = 'story.m45.started';
/** Emitted once when the third phrase is struck (L11 plays Ulthred's voice and finishes M45). */
export const CHIME_SOLVED_EVENT = 'waste.chime.solved';
