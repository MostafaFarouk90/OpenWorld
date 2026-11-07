import type { QuestDef } from '../../../types';
import { story } from '../../act2/helpers';
import { M56_AFTER_SEEN, M56_CHOICE_FLAG, M56_COMPANY_SEEN, M56_TOLD, M56_YSMERYTH_SEEN } from './flags';
import { FOUNDRY_XP } from './rewards';

/** Ysmeryth at the Anvil's edge and the company gathered (props: neither has a talk interactable on the island). */
export const M56_YSMERYTH_USE = 'use:m56-ysmeryth';
export const M56_COMPANY_USE = 'use:m56-company';

/**
 * M56 Embers or Dawn (plan 2.2 and 2.7, Q13). On the Anvil of Ages after Ulthred falls. The M56 favour snapshot is taken at
 * the start (the epilogue reads it). Alric says plainly what Rekindle costs with Cael's Scars (`caelLivesFor`); Ysmeryth and
 * Ulthred's last words; the company (Tobb, Hrolf, Aelfreda, Edric). The choice with a confirm: nothing is written before the
 * confirm, which writes `story.m56.choice`, `story.m56.caelLives`, `story.m56.scars` and `shrine.anvil-of-ages.lit` at once
 * (the director, which first asks N12's `act5Ending.holdSaves()`; N12 releases it once `world.afterEnding` is written). The aftermath, then the
 * quest completes and N12's ending director runs. Rewards: XP here, the keepsake by branch from the director.
 */
export const m56: QuestDef = {
  id: 'm56',
  titleKey: 'quest.m56.title',
  summaryKey: 'quest.m56.summary',
  sequential: true,
  startWhen: { quest: 'd10', state: 'completed' },
  objectives: [
    story('told', 'quest.m56.told', M56_TOLD, { doneWhen: { flag: M56_TOLD, equals: true } }),
    story('ysmeryth', 'quest.m56.ysmeryth', M56_YSMERYTH_SEEN, { doneWhen: { flag: M56_YSMERYTH_SEEN, equals: true } }),
    story('company', 'quest.m56.company', M56_COMPANY_SEEN, { doneWhen: { flag: M56_COMPANY_SEEN, equals: true } }),
    story('choice', 'quest.m56.choice', M56_CHOICE_FLAG, { doneWhen: { any: [{ flag: M56_CHOICE_FLAG, equals: 'rekindle' }, { flag: M56_CHOICE_FLAG, equals: 'let-it-die' }] } }),
    story('after', 'quest.m56.after', M56_AFTER_SEEN, { doneWhen: { flag: M56_AFTER_SEEN, equals: true } }),
  ],
  rewards: [{ xp: FOUNDRY_XP.m56 }],
};
