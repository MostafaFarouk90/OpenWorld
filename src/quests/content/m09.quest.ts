import type { QuestDef } from '../types';

export const M09_INVOICES = ['use:m09-invoice-1', 'use:m09-invoice-2', 'use:m09-invoice-3'];

/**
 * M09 Oswin's Ledger. Merrin's offer node sets `story.m09.houseOpen` (the Counting-House door, never cleared). The three
 * invoices are one objective in any order; thread 18's `m09.counting-house` section reports the clean exit.
 */
export const m09: QuestDef = {
  id: 'm09',
  titleKey: 'quest.m09.title',
  summaryKey: 'quest.m09.summary',
  sequential: true,
  objectives: [
    { id: 'o1', type: 'talk', target: 'merrin', textKey: 'quest.m09.o1' },
    { id: 'o2', type: 'event', target: 'interior.entered', match: { interiorId: 'counting-house' }, textKey: 'quest.m09.o2' },
    {
      id: 'o3', type: 'event', target: 'interact', match: { interactableId: M09_INVOICES }, dedupeBy: 'interactableId',
      required: 3, textKey: 'quest.m09.o3',
    },
    {
      id: 'o4', type: 'event', target: 'stealth.section', match: { sectionId: 'm09.counting-house', phase: 'cleared' },
      textKey: 'quest.m09.o4',
    },
    { id: 'o5', type: 'talk', target: 'merrin', textKey: 'quest.m09.o5' },
  ],
  rewards: [{ xp: 450 }, { give: [{ itemId: 'oswin-lockpicks', count: 5 }] }],
};
