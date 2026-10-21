// Flags A3 owns (the `world.cinderreach.*` namespace; quest threads never write them) and the story flags it only reads.
export const CINDERFORD_SEALED_FLAG = 'world.cinderreach.cinderford.sealed';
export const CINDERFORD_CLEANSED_FLAG = 'world.cinderreach.cinderford.cleansed';
export const PASTURE_REDUCED_FLAG = 'world.cinderreach.pasture.reduced';
export const DEN_SPARED_FLAG = 'world.cinderreach.den.spared';
export const DEN_SLAIN_FLAG = 'world.cinderreach.den.slain';

/** Choice flags (written by A12) and the exact value each derived flag mirrors. */
export const DERIVED_FLAGS: ReadonlyArray<{ derived: string; source: string; equals: string }> = [
  { derived: PASTURE_REDUCED_FLAG, source: 'story.r05.choice', equals: 'fox' },
  { derived: CINDERFORD_SEALED_FLAG, source: 'story.r06.choice', equals: 'sealed' },
  { derived: CINDERFORD_CLEANSED_FLAG, source: 'story.r06.choice', equals: 'cleansed' },
  { derived: DEN_SPARED_FLAG, source: 'story.r11.choice', equals: 'spared' },
  { derived: DEN_SLAIN_FLAG, source: 'story.r11.choice', equals: 'slain' },
];
