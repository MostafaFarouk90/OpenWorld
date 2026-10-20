import type { QuestDef } from '../types';

/**
 * M10 Smoke Over the Rooftops. Gerta's go-node completes o1 itself (before the dialogue ends) so o2 is already current
 * when thread 18 starts the chase on `dialogue.ended`. `story.m10.ashmare` unlocks the mount (thread 20). The density
 * pass: the sealed orders are picked up where the courier fell, two of Vey's men try to take them back, Gerta reads
 * them and sets the Ashmare flag at her hand-in (so the horse stands at the stables), then Wace Carter introduces the
 * Ashmare and Cael rides her to the South Gate.
 */
export const m10: QuestDef = {
  id: 'm10',
  titleKey: 'quest.m10.title',
  summaryKey: 'quest.m10.summary',
  sequential: true,
  objectives: [
    { id: 'o1', type: 'talk', target: 'gerta', textKey: 'quest.m10.o1' },
    { id: 'o2', type: 'event', target: 'chase.started', match: { chaseId: 'm10.rooftops' }, textKey: 'quest.m10.o2' },
    { id: 'o3', type: 'event', target: 'chase.caught', match: { chaseId: 'm10.rooftops' }, textKey: 'quest.m10.o3' },
    { id: 'orders', type: 'talk', target: 'note-m10-orders', textKey: 'quest.m10.orders' },
    { id: 'ambush', type: 'kill', target: 'guildhall-thug', required: 2, spawnTag: 'm10.ambush', textKey: 'quest.m10.ambush' },
    { id: 'o4', type: 'talk', target: 'gerta', textKey: 'quest.m10.o4' },
    { id: 'wace', type: 'talk', target: 'wace', textKey: 'quest.m10.wace' },
    { id: 'ride', type: 'event', target: 'mount.mounted', textKey: 'quest.m10.ride' },
    { id: 'gate', type: 'goTo', target: 'trg.harrowmark.m10-ride', textKey: 'quest.m10.gate' },
  ],
  onComplete: [{ setFlag: 'story.m10.ashmare', value: true }],
  rewards: [{ xp: 400 }, { give: [{ itemId: 'couriers-cloak', count: 1 }] }],
};
