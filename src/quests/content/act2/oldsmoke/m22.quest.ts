import type { Condition, QuestDef } from '../../../types';
import { reads, story } from '../helpers';

export const M22_FOUNTAIN = ['note-m22-fountain'];
export const M22_STALLS = ['note-m22-stalls'];
export const M22_BANNER = 'use:m22-banner';

/** Q5: M22 waits for M11 to M21, R05 to R11, D03 and D04. */
export const M22_PREREQUISITES: readonly string[] = [
  'm11', 'm12', 'm13', 'm14', 'm15', 'm16', 'm17', 'm18', 'm19', 'm20', 'm21',
  'r05', 'r06', 'r07', 'r08', 'r09', 'r10', 'r11', 'd03', 'd04',
];
export const m22StartWhen: Condition = { all: M22_PREREQUISITES.map((q): Condition => ({ quest: q, state: 'completed' })) };

/**
 * M22 Return to the Capital. The Council meets in the Keep hall: Wystan and Merrin hear Cael, the Houses pledge, Aldous
 * Grisel's seat stands empty and his steward reads the refusal. The fountain and the stalls are read as they are (shut);
 * A16 relights and reopens them on `story.gate.a3`, which is set only once M22 and D04 are complete.
 */
export const m22: QuestDef = {
  id: 'm22',
  titleKey: 'quest.m22.title',
  summaryKey: 'quest.m22.summary',
  sequential: true,
  startWhen: m22StartWhen,
  objectives: [
    { id: 'keep', type: 'goTo', target: 'trg.harrowmark.keep-hall', textKey: 'quest.m22.keep' },
    story('council', 'quest.m22.council', 'dialogue.ended', { match: { dialogueId: 'scene-m22-council', reason: 'completed' } }),
    { id: 'refusal', type: 'talk', target: 'grisel-steward', textKey: 'quest.m22.refusal' },
    { id: 'edric', type: 'talk', target: 'edric', textKey: 'quest.m22.edric' },
    reads('fountain', 'quest.m22.fountain', M22_FOUNTAIN),
    reads('stalls', 'quest.m22.stalls', M22_STALLS),
    story('banner', 'quest.m22.banner', 'interact', { match: { interactableId: M22_BANNER } }),
    story('raised', 'quest.m22.raised', 'dialogue.ended', { match: { dialogueId: 'scene-m22-banner', reason: 'completed' } }),
    { id: 'report', type: 'talk', target: 'wystan', textKey: 'quest.m22.report' },
  ],
  rewards: [{ xp: 550 }, { give: [{ itemId: 'house-pledge-banner', count: 1 }] }],
};
