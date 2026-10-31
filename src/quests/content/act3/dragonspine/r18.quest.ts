import type { QuestDef } from '../../../types';
import { nums, reads, story } from '../../act2/helpers';

export const R18_CAMP_NOTES = ['note-r18-sack', 'note-r18-straw', 'note-r18-tracks', 'note-r18-shell'];
export const R18_EGG_ITEM = 'rime-hawk-egg';
/** Pick-up props `use:r18-egg-N` (usedFlag `story.r18.egg.N.taken`) and nest props `use:r18-nest-N` (`story.r18.nest.N`). */
export const R18_EGG_PROPS = nums('use:r18-egg-', 3);
export const R18_EGG_TAKEN = nums('story.r18.egg.', 3).map((f) => `${f}.taken`);
export const R18_NEST_PROPS = nums('use:r18-nest-', 3);
export const R18_NEST_FLAGS = nums('story.r18.nest.', 3);
/** The nest anchors: K4's first nest is the quest's, the other two are its neighbours. */
export const R18_NEST_ANCHORS = ['dragonspine.hawk.nest.r18', 'dragonspine.hawk.nest.2', 'dragonspine.hawk.nest.3'];
export const R18_EGG_ANCHORS = nums('dragonspine.hawk.egg.', 3);
/** How many eggs are set in the nest (a number flag); a parent's death sets it back to 0. */
export const R18_EGGS_SET = 'story.r18.eggsSet';
export const R18_HOLDING = 'story.r18.holding';
export const R18_NESTED = 'story.r18.nested';
export const R18_EGG_EVENT = 'story.r18.eggSet';
export const R18_FAILED_EVENT = 'story.r18.failed';
export const R18_PARENTS_TAG = 'r18.parents';
export const R18_NEST_TRIGGER = 'trg.dragonspine.hawkcliffs.nest';
export const R18_FAIL_TOAST = 'r18.failed';

/**
 * R18 Rime Hawk Eggs. Thorgar wants the hawks' nest on the cliffs let alone; an egg thief has been robbing it. Cael talks the thief
 * round, searches his camp, then returns the three eggs to the nest, one at a time, up the cliff, past the parents (a stealth
 * section: they attack only if Cael is seen). If a parent dies the parents take every egg back to the camp and the step is
 * retried from there; the quest never fails.
 */
export const r18: QuestDef = {
  id: 'r18',
  titleKey: 'quest.r18.title',
  summaryKey: 'quest.r18.summary',
  sequential: true,
  startWhen: { quest: 'm28', state: 'completed' },
  objectives: [
    { id: 'brief', type: 'talk', target: 'thorgar', textKey: 'quest.r18.brief' },
    { id: 'thief', type: 'talk', target: 'egg-thief', textKey: 'quest.r18.thief' },
    { id: 'excuse', type: 'talk', target: 'egg-thief', textKey: 'quest.r18.excuse' },
    reads('camp', 'quest.r18.camp', R18_CAMP_NOTES),
    story('nested', 'quest.r18.nested', R18_NESTED, { doneWhen: { flag: R18_NESTED, equals: true } }),
    { id: 'report', type: 'talk', target: 'thorgar', textKey: 'quest.r18.report' },
  ],
  rewards: [{ xp: 500 }, { give: [{ itemId: 'hawk-feather-charm', count: 1 }] }],
};
