import type { QuestDef } from '../../../types';
import { story } from '../../act2/helpers';
import { M55_PARLEY_SEEN, M55_TRIAL_PASSED } from './flags';
import { rewardOf } from './rewards';

/** Ulthred, the First Smith, in the Hammer Hall (an NPC until D10 starts; N6's boss is a separate actor). */
export const M55_ULTHRED: string = 'ulthred-spirit';
/** The prop that starts N6's hammer trial (`hammerTrial.start()`); live while the trial step is current, so a load re-offers it. */
export const M55_TRIAL_USE = 'use:m55-trial';

/**
 * M55 Hammer and Heart (plan 2.2). In the Hammer Hall Ulthred parleys: patient, kind, wanting out, and honest that he will
 * wear whoever carries a shard. Then N6's forge-hammer trial: three rounds that cannot kill (the L6 rule; a loss retries the
 * round, a load drops the trial and the prop offers it again). Alric and the companions after.
 */
export const m55: QuestDef = {
  id: 'm55',
  titleKey: 'quest.m55.title',
  summaryKey: 'quest.m55.summary',
  sequential: true,
  startWhen: { quest: 'm54', state: 'completed' },
  objectives: [
    story('parley', 'quest.m55.parley', M55_PARLEY_SEEN, { doneWhen: { flag: M55_PARLEY_SEEN, equals: true } }),
    story('trial', 'quest.m55.trial', M55_TRIAL_PASSED, { doneWhen: { flag: M55_TRIAL_PASSED, equals: true } }),
    { id: 'verdict', type: 'talk', target: M55_ULTHRED, textKey: 'quest.m55.verdict' },
    { id: 'alric', type: 'talk', target: 'alric', textKey: 'quest.m55.alric' },
  ],
  rewards: rewardOf('m55'),
};
