import type { QuestDef } from '../../../types';
import { flagsAll, reads, story } from '../../act2/helpers';
import { LAST_ANVIL, rubbingFlag } from '../../../../shrine/act3/tuning';

export const M30_PACK_TAG = 'm30.shoulder';
export const M30_PACK_FLAG = 'story.m30.packOut';
export const M30_PACK_DOWN = 'story.m30.packDown';
/** K9's three steps and the rekindle, read through their own flags. */
export const M30_STEP_FLAGS = LAST_ANVIL.steps.map((s) => s.flag);
export const M30_LIT_FLAG = `shrine.${LAST_ANVIL.id}.lit`;
export const M30_RUBBING_FLAGS = LAST_ANVIL.rubbingIds.map((id) => rubbingFlag(id));
export const M30_MARKS = ['note-m30-mark-1', 'note-m30-mark-2'];

const step = (id: string, flag: string, textKey: string) =>
  story(id, textKey, 'flag.changed', { match: { key: flag, value: true }, doneWhen: { flag, equals: true } });

/**
 * M30 The Keepers' Rubbings. Brother Ansgar keeps the Last Anvil. Cael hears the lore, speaks to the pilgrim, clears the shoulder
 * (hawks and an ogre), then does K9's work at the Anvil (sweep, relight, sound, rekindle: those flags are K9's), takes the six
 * rubbings, reads the two keeper marks and has the carvings read aloud. The rubbings are the reward (codex-locked until M32).
 */
export const m30: QuestDef = {
  id: 'm30',
  titleKey: 'quest.m30.title',
  summaryKey: 'quest.m30.summary',
  sequential: true,
  startWhen: { quest: 'm29', state: 'completed' },
  objectives: [
    { id: 'brief', type: 'talk', target: 'ansgar', textKey: 'quest.m30.brief' },
    { id: 'lore', type: 'talk', target: 'ansgar', textKey: 'quest.m30.lore' },
    { id: 'pilgrim', type: 'talk', target: 'pilgrim-3', textKey: 'quest.m30.pilgrim' },
    { id: 'pack', type: 'event', target: M30_PACK_DOWN, textKey: 'quest.m30.pack', doneWhen: { flag: M30_PACK_DOWN, equals: true } },
    step('sweep', M30_STEP_FLAGS[0], 'quest.m30.sweep'),
    step('relight', M30_STEP_FLAGS[1], 'quest.m30.relight'),
    step('sound', M30_STEP_FLAGS[2], 'quest.m30.sound'),
    story('rekindle', 'quest.m30.rekindle', 'shrine.rekindled', { match: { shrineId: LAST_ANVIL.id }, doneWhen: { flag: M30_LIT_FLAG, equals: true } }),
    { id: 'rise', type: 'talk', target: 'ansgar', textKey: 'quest.m30.rise' },
    story('rubbings', 'quest.m30.rubbings', 'rubbing.taken', { required: 6, dedupeBy: 'rubbingId', doneWhen: flagsAll(M30_RUBBING_FLAGS) }),
    reads('marks', 'quest.m30.marks', M30_MARKS),
    { id: 'carvings', type: 'talk', target: 'ansgar', textKey: 'quest.m30.carvings' },
    { id: 'report', type: 'talk', target: 'ansgar', textKey: 'quest.m30.report' },
  ],
  rewards: [{ xp: 650 }],
};
