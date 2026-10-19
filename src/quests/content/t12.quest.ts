import { BEATS } from '../../tutorial/beats';
import { stepRequired } from '../../tutorial/goals';
import type { QuestDef } from '../types';

/**
 * T12: the bakery lesson. The kit objective counts the director's `tutorial.goal` events of step 0
 * (equip two items, drink a flask); the journal objective follows it, and the director completes the quest
 * through the quests service (complete()) as well.
 */
export const t12: QuestDef = {
  id: 't12',
  titleKey: 'quest.t12.title',
  summaryKey: 'quest.t12.summary',
  sequential: true,
  objectives: [
    {
      id: 'kit',
      type: 'event',
      target: 'tutorial.goal',
      match: { beatId: 't12', step: 0 },
      required: stepRequired(BEATS.t12.steps[0]),
      textKey: 'quest.t12.kit',
      // A save made after the kit lesson (or a restart that skips it) must not wait for events that already fired:
      // the director sets this flag once step 0 is done.
      doneWhen: { flag: 'tutorial.t12.kitDone' },
    },
    {
      id: 'o1',
      type: 'interact',
      target: 'use:t12-journal-open',
      textKey: 'quest.t12.o1',
      optional: false,
      // The director sets the flag once the kit lesson is up, so an earlier J press earns nothing.
      when: { flag: 'tutorial.t12.kit' },
    },
  ],
  onComplete: [{ startQuest: 'm01' }],
};
