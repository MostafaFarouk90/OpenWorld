import type { QuestDef } from '../../types';

/**
 * j08 Watch Patrol (side job). Rook's sergeant, who keeps the board, asks Cael to walk the four-point lane loop the watch is
 * short-handed for: the Main Street, the Forge Row end, the Anvil yard and the alley behind it. Two people on the loop
 * remark on what they have seen (Dunstan at his forge, Aldith at the Anvil's door; the second bark wakes the cutpurse pair
 * in the alley). A Spare counts the same as a kill; the report closes the job.
 */

/**
 * A remark the bark node credits itself (`completeObjective`). A bare `talk` objective would be credited by any conversation with
 * the NPC, including one that belongs to a main quest or another job, so this event never matches a real dialogue end.
 */
const BARK = (npc: string, flag: string) => ({
  type: 'event' as const, target: 'dialogue.ended', match: { npcId: npc, reason: 'bark-node-only' }, doneWhen: { flag, equals: true } as const,
});

export const j08: QuestDef = {
  id: 'j08',
  titleKey: 'quest.j08.title',
  summaryKey: 'quest.j08.summary',
  sequential: true,
  startWhen: { quest: 'm06', state: 'completed' },
  objectives: [
    { id: 'orders', type: 'talk', target: 'sergeant', textKey: 'quest.j08.orders' },
    { id: 'lane1', type: 'goTo', target: 'j08.lane-1', textKey: 'quest.j08.lane1' },
    { id: 'lane2', type: 'goTo', target: 'j08.lane-2', textKey: 'quest.j08.lane2' },
    { id: 'bark1', ...BARK('dunstan', 'story.j08.bark1'), textKey: 'quest.j08.bark1' },
    { id: 'lane3', type: 'goTo', target: 'j08.lane-3', textKey: 'quest.j08.lane3' },
    { id: 'bark2', ...BARK('aldith', 'story.j08.alleyWoke'), textKey: 'quest.j08.bark2' },
    { id: 'lane4', type: 'goTo', target: 'j08.lane-4', textKey: 'quest.j08.lane4' },
    { id: 'cutpurses', type: 'kill', target: 'alley-cutpurse', required: 2, spawnTag: 'j08.cutpurse', textKey: 'quest.j08.cutpurses' },
    { id: 'report', type: 'talk', target: 'sergeant', textKey: 'quest.j08.report' },
  ],
  rewards: [{ xp: 55 }, { giveGold: 18 }],
};
