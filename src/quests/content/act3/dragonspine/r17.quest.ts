import type { QuestDef } from '../../../types';
import { flagsAll, story } from '../../act2/helpers';
import { WAYSIDE } from '../../../../shrine/act3/tuning';

export const R17_BUNDLE_ITEM = 'forge-candle-bundle';
export const R17_BUNDLE = 'use:r17-bundle';
export const R17_BUNDLE_LYING = 'use:r17-bundle-lying';
export const R17_TAKEN = 'story.r17.bundleTaken';
/** True while the player holds the bundle (the light gate reads it); cleared by a carry reset, set again on the re-pick. */
export const R17_HELD = 'story.r17.held';
export const R17_DOWN = [3, 2, 1] as const;
export const R17_UP = [4, 5, 6] as const;
export const R17_HAWK_TAGS = ['r17.hawks.a', 'r17.hawks.b'] as const;
export const R17_HAWK_FLAGS = ['story.r17.hawksA', 'story.r17.hawksB'] as const;
export const r17LitFlag = (n: number): string => WAYSIDE.flag(n);

const lit = (n: number) =>
  story(`shrine${n}`, `quest.r17.shrine${n}`, 'wayside.lit', { match: { index: n }, doneWhen: { flag: r17LitFlag(n), equals: true } });

/**
 * R17 Candles for the Last Anvil. Ansgar gives Cael a bundle of forge candles to carry down the road: shrines 3, 2, 1 (a
 * pilgrim between 2 and 1), then back up past the Anvil to 4, 5, 6 (a pilgrim between 5 and 6). K9's wayside shrines light only
 * for whoever holds the bundle. Walked on foot (a held carry refuses the Ashmare). No choice, no favour.
 */
export const r17: QuestDef = {
  id: 'r17',
  titleKey: 'quest.r17.title',
  summaryKey: 'quest.r17.summary',
  sequential: true,
  startWhen: { quest: 'm30', state: 'completed' },
  objectives: [
    { id: 'brief', type: 'talk', target: 'ansgar', textKey: 'quest.r17.brief' },
    story('take', 'quest.r17.take', 'flag.changed', { match: { key: R17_TAKEN, value: true }, doneWhen: { flag: R17_TAKEN, equals: true } }),
    lit(3), lit(2),
    { id: 'pilgrim1', type: 'talk', target: 'pilgrim-1', textKey: 'quest.r17.pilgrim1' },
    lit(1), lit(4), lit(5),
    { id: 'pilgrim2', type: 'talk', target: 'pilgrim-2', textKey: 'quest.r17.pilgrim2' },
    lit(6),
    { id: 'report', type: 'talk', target: 'ansgar', textKey: 'quest.r17.report' },
  ],
  rewards: [{ xp: 450 }, { give: [{ itemId: 'ansgars-blessing', count: 1 }] }],
};

export const R17_ALL_LIT = flagsAll([...R17_DOWN, ...R17_UP].map(r17LitFlag));
