import type { Condition, QuestDef } from '../../../../types';
import { flagsAll, interacts, reads } from '../../helpers';

export const R08_RELICS = ['note-r08-tally', 'note-r08-lamp', 'note-r08-tin', 'note-r08-wall', 'note-r08-marker', 'note-r08-chit'];
export const R08_LETTER = 'note-r08-letter';
/** The shift tasks in the order the prop gate allows: pump, cart and prop in any order, then the bell. */
export const R08_TASKS = ['use:r08-pump', 'use:r08-cart', 'use:r08-prop', 'use:r08-bell'];
export const R08_BELL_GATE: Condition = flagsAll(['story.r08.pump', 'story.r08.cart', 'story.r08.prop']);
/** Tolling the bell raises the shift (the wraith spawner's flag). */
export const R08_BELL_FLAG = 'story.r08.bell';
/** Set when Pickett is laid to rest (hides his ghost). */
export const R08_LAID_FLAG = 'story.r08.laid';

/**
 * R08 Pickett's Last Shift. The ghost of a shift boss in the Old Galleries wants his last shift finished: Cael reads six
 * relics, does the four tasks (the bell last), beats the wraith shift the bell raises, hears the crew and the widow's
 * letter, and lays him to rest. Plain quest: no choice, no favour.
 */
export const r08: QuestDef = {
  id: 'r08',
  titleKey: 'quest.r08.title',
  summaryKey: 'quest.r08.summary',
  sequential: true,
  startWhen: { quest: 'm17', state: 'completed' },
  objectives: [
    { id: 'brief', type: 'talk', target: 'pickett', textKey: 'quest.r08.brief' },
    reads('relics', 'quest.r08.relics', R08_RELICS),
    interacts('tasks', 'quest.r08.tasks', R08_TASKS),
    { id: 'wraiths', type: 'kill', target: 'ash-wraith', required: 5, spawnTag: 'r08.shift', textKey: 'quest.r08.wraiths' },
    { id: 'crew', type: 'talk', target: 'shift-crew', textKey: 'quest.r08.crew' },
    reads('letter', 'quest.r08.letter', [R08_LETTER]),
    { id: 'report', type: 'talk', target: 'pickett', textKey: 'quest.r08.report' },
  ],
  rewards: [{ xp: 400 }, { give: [{ itemId: 'picketts-lantern', count: 1 }] }],
};
