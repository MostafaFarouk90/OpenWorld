import type { QuestDef } from '../../types';

/**
 * j09 Stane's Open Board (side job, after R02). Marshal Stane keeps an open board in the Halvard Bastion yard: three bouts
 * against yard veterans, one at a time, a word between each, and a closing talk where he tells what the yard is for. The
 * bouts use R02's machinery (the same yard-veteran, the same bastion anchors, a Spare counts as a knock-down); their tags
 * are `j09.b1` to `j09.b3` and pay no kill XP (src/progression/tuning.ts NO_KILL_XP_TAGS), so the job's pay is its reward.
 */
export const j09: QuestDef = {
  id: 'j09',
  titleKey: 'quest.j09.title',
  summaryKey: 'quest.j09.summary',
  sequential: true,
  // R02 can be finished in the Practice Yard before M06; the open board runs where Stane stands from M06 on
  startWhen: { all: [{ quest: 'r02', state: 'completed' }, { flag: 'story.m06.started', equals: true }] },
  objectives: [
    { id: 'bout1', type: 'kill', target: 'yard-veteran', spawnTag: 'j09.b1', textKey: 'quest.j09.bout1' },
    { id: 'word1', type: 'talk', target: 'stane', textKey: 'quest.j09.word1' },
    { id: 'bout2', type: 'kill', target: 'yard-veteran', spawnTag: 'j09.b2', textKey: 'quest.j09.bout2' },
    { id: 'word2', type: 'talk', target: 'stane', textKey: 'quest.j09.word2' },
    { id: 'bout3', type: 'kill', target: 'yard-veteran', spawnTag: 'j09.b3', textKey: 'quest.j09.bout3' },
    { id: 'close', type: 'talk', target: 'stane', textKey: 'quest.j09.close' },
  ],
  rewards: [{ xp: 50 }, { giveGold: 20 }],
};
