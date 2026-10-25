// Flags K3 owns (the `world.greyfen.*` namespace; quest threads read them, never write them) and the story flags it reads.
export const REEDS_BURNED_FLAG = 'world.greyfen.reeds.burned';
export const REEDS_CUT_FLAG = 'world.greyfen.reeds.cut';
export const DESERTER_STOCKS_FLAG = 'world.greyfen.deserter.stocks';
export const DESERTER_GONE_FLAG = 'world.greyfen.deserter.gone';

/** M23's plank bridges: K3's flags, written when a bridge is lowered (K12's M23 objective reads them as its `doneWhen`). */
export const bridgeFlag = (n: 1 | 2): string => `world.greyfen.bridge.${n}.down`;

/** Choice flags (written by K12) and the exact value each derived flag mirrors. Any other value derives nothing. */
export const DERIVED_FLAGS: ReadonlyArray<{ derived: string; source: string; equals: string }> = [
  { derived: REEDS_BURNED_FLAG, source: 'story.r12.choice', equals: 'burned' },
  { derived: REEDS_CUT_FLAG, source: 'story.r12.choice', equals: 'cut' },
  { derived: DESERTER_STOCKS_FLAG, source: 'story.r14.choice', equals: 'returned' },
  { derived: DESERTER_GONE_FLAG, source: 'story.r14.choice', equals: 'released' },
];
