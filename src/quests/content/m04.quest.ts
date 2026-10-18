import type { QuestDef } from '../types';

/**
 * M04 The Toll at Hollin Ford. Gaut offers it in Kettlewick and waits at the ford (post rule). His lesson
 * unlocks Spare before the Footman pair; a kill credits o3 the same as a Spare. The carters walk off on the flag
 * `story.m04.cartersFreed`, written by the carter dialogue.
 */
export const m04: QuestDef = {
  id: 'm04',
  titleKey: 'quest.m04.title',
  summaryKey: 'quest.m04.summary',
  sequential: true,
  objectives: [
    { id: 'o1', type: 'goTo', target: 'trg.ford.toll-post', textKey: 'quest.m04.o1' },
    { id: 'o2', type: 'talk', target: 'gaut', textKey: 'quest.m04.o2' },
    { id: 'o3', type: 'kill', target: 'blighted-soldier', required: 2, textKey: 'quest.m04.o3' },
    {
      // The post is a structure anyone can break at any time, so the world flag (thread 4) also credits it.
      id: 'o4', type: 'event', target: 'actor.died', match: { kind: 'toll-post' },
      doneWhen: { flag: 'world.brightwater.tollPost' }, textKey: 'quest.m04.o4',
    },
    { id: 'o5', type: 'talk', target: 'carter-1', textKey: 'quest.m04.o5' },
    { id: 'o6', type: 'talk', target: 'gaut', textKey: 'quest.m04.o6' },
  ],
  rewards: [{ xp: 350 }, { give: [{ itemId: 'ford-guard-shield', count: 1 }] }],
};
