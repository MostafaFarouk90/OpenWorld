import type { QuestDef } from '../../types';
import { interacts, story } from './helpers';

export const R07_SIGNS = [1, 2, 3, 4, 5].map((n) => `use:r07-sign-${n}`);
export const R07_PUPS = ['use:r07-pup-1', 'use:r07-pup-2'];
const spared = { flag: 'story.r07.choice', equals: 'spared' } as const;

/**
 * R07 Wolf-Mother's Kits. Ketta, the shepherd who lost his dogs, five den signs (the last wakes the den), the mother and
 * three hounds, then the choice: spare the pups or cull them. Offered from M13 complete wherever Ketta stands.
 */
export const r07: QuestDef = {
  id: 'r07',
  titleKey: 'quest.r07.title',
  summaryKey: 'quest.r07.summary',
  sequential: true,
  startWhen: { quest: 'm13', state: 'completed' },
  objectives: [
    { id: 'brief', type: 'talk', target: 'ketta', textKey: 'quest.r07.brief' },
    { id: 'shepherd', type: 'talk', target: 'osric', textKey: 'quest.r07.shepherd' },
    interacts('signs', 'quest.r07.signs', R07_SIGNS),
    { id: 'hounds', type: 'kill', target: 'ember-hound', required: 3, spawnTag: 'r07.den', textKey: 'quest.r07.hounds' },
    { id: 'mother', type: 'kill', target: 'ember-hound', spawnTag: 'r07.mother', textKey: 'quest.r07.mother' },
    story('choice', 'quest.r07.choice', 'story.r07.branched'),
    interacts('pups', 'quest.r07.pups', R07_PUPS, { doneWhen: spared }),
    { id: 'report', type: 'talk', target: 'ketta', textKey: 'quest.r07.report' },
  ],
  rewards: [{ xp: 350 }, { give: [{ itemId: 'pup-companion', count: 1 }] }],
};
