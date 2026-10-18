import type { QuestDef } from '../types';

/**
 * T12: the bakery lesson. The director completes this quest through the quests service
 * (complete()), so the single objective only exists to give the journal a line to show.
 */
export const t12: QuestDef = {
  id: 't12',
  titleKey: 'quest.t12.title',
  summaryKey: 'quest.t12.summary',
  objectives: [
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
