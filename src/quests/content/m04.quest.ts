import type { QuestDef } from '../types';

export const M04_WAGONS = ['use:m04-wagon-1', 'use:m04-wagon-2', 'use:m04-wagon-3'];

/**
 * M04 The Toll at Hollin Ford. Gaut offers it in Kettlewick and waits at the ford (post rule). His lesson
 * unlocks Spare before the Footman pairs; a kill credits o3 the same as a Spare. The density pass counts all four
 * Footmen, adds the Toll Sergeant who holds the bridge after them (an elite: Spare him or beat him), the toll box with
 * the Regent's ledger, the three chained wagons and a word with each carter. carter-1 speaks last: his dialogue writes
 * `story.m04.cartersFreed` and the carters walk off.
 */
export const m04: QuestDef = {
  id: 'm04',
  titleKey: 'quest.m04.title',
  summaryKey: 'quest.m04.summary',
  sequential: true,
  objectives: [
    { id: 'o1', type: 'goTo', target: 'trg.ford.toll-post', textKey: 'quest.m04.o1' },
    { id: 'o2', type: 'talk', target: 'gaut', textKey: 'quest.m04.o2' },
    { id: 'o3', type: 'kill', target: 'blighted-soldier', required: 4, textKey: 'quest.m04.o3' },
    { id: 'sergeant', type: 'kill', target: 'toll-sergeant', spawnTag: 'm04.sergeant', textKey: 'quest.m04.sergeant' },
    {
      // The post is a structure anyone can break at any time, so the world flag (thread 4) also credits it.
      id: 'o4', type: 'event', target: 'actor.died', match: { kind: 'toll-post' },
      doneWhen: { flag: 'world.brightwater.tollPost' }, textKey: 'quest.m04.o4',
    },
    { id: 'ledger', type: 'talk', target: 'note-m04-toll-box', textKey: 'quest.m04.ledger' },
    // Gaut reads the ledger with Cael and they decide who keeps it (story.m04.ledger)
    { id: 'shown', type: 'talk', target: 'gaut', textKey: 'quest.m04.shown' },
    {
      id: 'wagons', type: 'event', target: 'interact', match: { interactableId: M04_WAGONS }, dedupeBy: 'interactableId',
      required: 3, textKey: 'quest.m04.wagons',
    },
    {
      id: 'carters', type: 'event', target: 'dialogue.ended', match: { npcId: ['carter-2', 'carter-3'], reason: 'completed' },
      dedupeBy: 'npcId', required: 2, textKey: 'quest.m04.carters',
    },
    { id: 'o5', type: 'talk', target: 'carter-1', textKey: 'quest.m04.o5' },
    { id: 'o6', type: 'talk', target: 'gaut', textKey: 'quest.m04.o6' },
  ],
  rewards: [{ xp: 350 }, { give: [{ itemId: 'ford-guard-shield', count: 1 }] }],
};
