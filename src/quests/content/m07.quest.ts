import type { QuestDef } from '../types';

/** The five class ids; thread 12 mirrors `classes.drill.<id>` ('done' | 'skipped') for the drill that was run. */
const CLASS_IDS = ['knight', 'warden', 'emberwright', 'ashblade', 'pathfinder'];

/**
 * M07 The Tilted Anvil. `story.m07.classOpen` is written by Aldith's hand-in node (o4): thread 12 refuses a class
 * choice until it is set. Thread 19 opens the back room on the o4 `quest.objective` event. o6 and o7 read thread 12's
 * mirror flags so a choice made before the objective is current still counts.
 */
export const m07: QuestDef = {
  id: 'm07',
  titleKey: 'quest.m07.title',
  summaryKey: 'quest.m07.summary',
  sequential: true,
  objectives: [
    { id: 'o1', type: 'talk', target: 'aldith', textKey: 'quest.m07.o1' },
    { id: 'o2', type: 'kill', target: 'alley-cutpurse', required: 3, spawnTag: 'm07.thieves', textKey: 'quest.m07.o2' },
    { id: 'o3', type: 'interact', target: 'pickup:satchel', textKey: 'quest.m07.o3' },
    { id: 'o4', type: 'talk', target: 'aldith', textKey: 'quest.m07.o4' },
    { id: 'o5', type: 'goTo', target: 'trg.harrowmark.bastion-yard', textKey: 'quest.m07.o5' },
    { id: 'o6', type: 'event', target: 'class.chosen', doneWhen: { flag: 'classes.chosen' }, textKey: 'quest.m07.o6' },
    {
      id: 'o7', type: 'event', target: 'class.drill',
      doneWhen: { any: CLASS_IDS.map((id) => ({ flag: `classes.drill.${id}` })) }, textKey: 'quest.m07.o7',
    },
  ],
  rewards: [{ xp: 300 }],
};
