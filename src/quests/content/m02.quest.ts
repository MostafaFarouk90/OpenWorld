import type { QuestDef } from '../types';

export const M02_RUBBLE = ['use:m02-rubble-1', 'use:m02-rubble-2'];

/**
 * M02 A Mother's Bread. The bakery door is burning (two buckets from the well), fallen thatch buries the hearth, and
 * the heat has drawn wraiths into the oven yard. With the stone in hand Cael finds Edda at the granary Cael refused
 * to burn, where the reeve's man who carried out that order still keeps the door; Edda tells the disgrace there.
 * The stone goes on the common hearth in the Grey Goose yard. The stone pickup is thread 4's and reads `o2`.
 */
export const m02: QuestDef = {
  id: 'm02',
  titleKey: 'quest.m02.title',
  summaryKey: 'quest.m02.summary',
  sequential: true,
  objectives: [
    { id: 'door', type: 'carry', target: 'm02.bakery-door', required: 2, textKey: 'quest.m02.door' },
    { id: 'o1', type: 'goTo', target: 'm02.bakery', textKey: 'quest.m02.o1' },
    {
      id: 'rubble', type: 'event', target: 'interact', match: { interactableId: M02_RUBBLE }, dedupeBy: 'interactableId',
      required: 2, textKey: 'quest.m02.rubble',
    },
    { id: 'oven', type: 'kill', target: 'ash-wraith', required: 3, spawnTag: 'm02.oven-yard', textKey: 'quest.m02.oven' },
    { id: 'o2', type: 'interact', target: 'pickup:hearth-stone', textKey: 'quest.m02.o2' },
    // the family chest in the loft: Cael's broken badge, before Edda tells the story behind it
    { id: 'badge', type: 'talk', target: 'note-m02-badge', textKey: 'quest.m02.badge' },
    { id: 'granary', type: 'goTo', target: 'm02.granary', textKey: 'quest.m02.granary' },
    { id: 'garrick', type: 'talk', target: 'garrick', textKey: 'quest.m02.garrick' },
    { id: 'o3', type: 'talk', target: 'edda', textKey: 'quest.m02.o3' },
    { id: 'hearth', type: 'interact', target: 'use:m02-common-hearth', textKey: 'quest.m02.hearth' },
  ],
  onComplete: [{ take: 'hearth-stone' }],
  rewards: [{ xp: 250 }, { give: [{ itemId: 'hearth-stone-charm', count: 1 }] }],
};
