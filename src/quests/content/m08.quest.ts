import type { QuestDef } from '../types';

/** The two who wait their turn in the Keep hall (density pass, batch 4). */
export const M08_WAITING = ['merrin', 'grisel'];

/**
 * M08 Kneel Before the Boy. onStart shows the Favour tab; the Keep door opens (`story.m08.keepOpen`, never cleared;
 * thread 3a) once the warden has seen the Watch Pass (the objective-flag bridge, density pass). The audience is a branching dialogue that cannot be failed. The density pass adds the Bastion
 * armourer's fitting, the Keep gate warden's look at the Watch Pass, Merrin and Lord Grisel waiting in the hall, and,
 * after the audience, the Regent's private word overheard at the carved screen by the west wall (a note, read there).
 */
export const m08: QuestDef = {
  id: 'm08',
  titleKey: 'quest.m08.title',
  summaryKey: 'quest.m08.summary',
  sequential: true,
  onStart: [
    { setFlag: 'story.m08.started', value: true },
    { setFlag: 'story.m08.favourTab', value: true },
  ],
  objectives: [
    { id: 'o1', type: 'talk', target: 'wystan', textKey: 'quest.m08.o1' },
    { id: 'fit', type: 'talk', target: 'armourer', textKey: 'quest.m08.fit' },
    { id: 'pass', type: 'talk', target: 'keep-guard', textKey: 'quest.m08.pass' },
    {
      id: 'wait', type: 'event', target: 'dialogue.ended', match: { npcId: M08_WAITING, reason: 'completed' }, dedupeBy: 'npcId',
      required: 2, textKey: 'quest.m08.wait',
    },
    { id: 'o2', type: 'goTo', target: 'trg.harrowmark.keep-hall', textKey: 'quest.m08.o2' },
    { id: 'o3', type: 'talk', target: 'edric', textKey: 'quest.m08.o3' },
    { id: 'screen', type: 'talk', target: 'note-m08-screen', textKey: 'quest.m08.screen' },
    { id: 'o4', type: 'talk', target: 'wystan', textKey: 'quest.m08.o4' },
  ],
  rewards: [{ xp: 400 }, { give: [{ itemId: 'halvard-signet', count: 1 }] }],
};
