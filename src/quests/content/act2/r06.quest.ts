import type { QuestDef } from '../../types';
import { flagsAll, interacts, reads, story } from './helpers';

export const R06_SAMPLES = ['use:r06-sample-1', 'use:r06-sample-2', 'use:r06-sample-3'];
export const R06_WELLHOUSE = ['note-r06-rope', 'note-r06-bucket', 'note-r06-tally', 'note-r06-prayer'];
export const R06_HEARD = [1, 2, 3, 4].map((n) => `story.r06.heard.${n}`);
const seal = { flag: 'story.r06.branch', equals: 'seal' } as const;
const cleanse = { flag: 'story.r06.branch', equals: 'cleanse' } as const;
const emberwright = { flag: 'story.r06.emberwright', equals: true } as const;

/**
 * R06 The Cinderford Well. Maud, three blight samples, the well-house, the well-keeper and the four households (all
 * required), then the choice. A3 hides the cast the moment `story.r06.choice` reads `sealed`, so that flag is written by
 * the objective-flag row of the sealed hand-in (after the talk is over); every step before it runs off the private
 * `story.r06.branch`. The branch the player did not take is skipped by `doneWhen`, so one sequential list serves both.
 * Cleansed: an Emberwright cleanses the well alone; anyone else guards Pennard's rite through two wraith waves.
 */
export const r06: QuestDef = {
  id: 'r06',
  titleKey: 'quest.r06.title',
  summaryKey: 'quest.r06.summary',
  sequential: true,
  startWhen: { quest: 'm12', state: 'completed' },
  objectives: [
    { id: 'brief', type: 'talk', target: 'maud', textKey: 'quest.r06.brief' },
    interacts('samples', 'quest.r06.samples', R06_SAMPLES),
    reads('wellhouse', 'quest.r06.wellhouse', R06_WELLHOUSE),
    { id: 'keeper', type: 'talk', target: 'household-1', textKey: 'quest.r06.keeper' },
    story('households', 'quest.r06.households', 'story.r06.heard', {
      required: 4, dedupeBy: 'n', doneWhen: flagsAll(R06_HEARD),
    }),
    story('choice', 'quest.r06.choice', 'story.r06.branched', { doneWhen: { any: [cleanse, seal] } }),
    // sealed: carry the four bundles to the cart, board the well
    story('bundles', 'quest.r06.bundles', 'carry.delivered', {
      required: 4, match: { destinationId: 'trg.q12.r06.cart' }, dedupeBy: 'carryId', doneWhen: cleanse,
    }),
    story('board', 'quest.r06.board', 'interact', { match: { interactableId: 'use:r06-board-well' }, doneWhen: cleanse }),
    story('sealed', 'quest.r06.sealed', 'dialogue.ended', { match: { npcId: 'maud', reason: 'completed' }, doneWhen: cleanse }),
    // cleansed: fire (Emberwright) or Pennard's rite (everyone else)
    story('fire', 'quest.r06.fire', 'interact', {
      match: { interactableId: 'use:r06-cleanse' }, doneWhen: { any: [seal, { not: emberwright }] },
    }),
    story('rite', 'quest.r06.rite', 'story.r06.riteDone', { doneWhen: { any: [seal, emberwright] } }),
    story('cleansed', 'quest.r06.cleansed', 'dialogue.ended', { match: { npcId: 'maud', reason: 'completed' }, doneWhen: seal }),
  ],
  rewards: [{ xp: 350 }, { give: [{ itemId: 'maud-remedy', count: 1 }] }],
};
