import type { QuestDef } from '../../../types';
import { reads, story } from '../../act2/helpers';
import { R22_BLADE } from './rewards';

/** The three materials, each a short trip by waystone (plan 2.7), in play order. */
export const R22_SITES = [
  { id: 'star-iron', region: 'cinderreach', item: 'r22-star-iron', local: 'r22-local-cinderreach', near: 'waystone.cinderford' },
  { id: 'bog-oak', region: 'greyfen', item: 'r22-bog-oak', local: 'r22-local-greyfen', near: 'waystone.mireweather-hut' },
  { id: 'rime-iron', region: 'dragonspine', item: 'r22-rime-iron', local: 'r22-local-dragonspine', near: 'waystone.rime-pass' },
] as const;
export type R22Site = (typeof R22_SITES)[number];
export const R22_FIND = (s: R22Site): string => `use:r22-find-${s.id}`;
export const R22_FOUND = (s: R22Site): string => `story.r22.${s.id}.found`;
export const R22_GROUP = (s: R22Site): string => `r22.guard.${s.id}`;
export const R22_ARM = (s: R22Site): string => `story.r22.${s.id}.guards`;
export const R22_DOWN = (s: R22Site): string => `story.r22.${s.id}.guardsDown`;
export const R22_GUARD_TAG = (s: R22Site): string => `r22.guard.${s.id}`;
/** The forge at Dunstan's anvil: bellows, the two rhythm runs (the shipped tempering judge), the quench, the hilt. */
export const R22_BELLOWS = 'use:r22-bellows';
export const R22_QUENCH = 'use:r22-quench';
export const R22_HILT = 'use:r22-hilt';
/** The anvil: one prop per run (each live only while its run is current). */
export const R22_ANVIL = (n: 1 | 2): string => `use:r22-anvil-${n}`;
export const R22_FORGED = (n: 1 | 2): string => `story.r22.forged${n}`;
export const R22_CHOICE = 'story.r22.choice';
export type R22Blade = 'light' | 'heavy';
export const R22_NOTES = ['note-r22-drawing'] as const;

const site = (s: R22Site) => [
  { id: `${s.id}Talk`, type: 'talk' as const, target: s.local, textKey: `quest.r22.${s.id}.talk` },
  story(`${s.id}Guards`, `quest.r22.${s.id}.guards`, R22_DOWN(s), { doneWhen: { flag: R22_DOWN(s), equals: true } }),
  { id: `${s.id}Find`, type: 'interact' as const, target: R22_FIND(s), textKey: `quest.r22.${s.id}.find` },
];
const forged = (n: 1 | 2) => story(`forge${n}`, `quest.r22.forge${n}`, R22_FORGED(n), { doneWhen: { flag: R22_FORGED(n), equals: true } });

/**
 * R22 The King's Blade (plan 2.7). Dunstan forges the boy king a blade from three rare materials, fetched from Acts 2 and 3
 * land (each a talk, a small guard and a find; no Act 4 cap there), then two rhythm runs at the anvil. The choice, light or
 * heavy, is Dunstan's last question (`story.r22.choice`; Edric carries it in M40 and M41 and wields it at M52).
 */
export const r22: QuestDef = {
  id: 'r22',
  titleKey: 'quest.r22.title',
  summaryKey: 'quest.r22.summary',
  sequential: true,
  startWhen: { quest: 'm35', state: 'completed' },
  objectives: [
    { id: 'brief', type: 'talk', target: 'dunstan', textKey: 'quest.r22.brief' },
    reads('drawing', 'quest.r22.drawing', R22_NOTES),
    ...R22_SITES.flatMap(site),
    { id: 'bring', type: 'talk', target: 'dunstan', textKey: 'quest.r22.bring' },
    { id: 'bellows', type: 'interact', target: R22_BELLOWS, textKey: 'quest.r22.bellows' },
    forged(1),
    { id: 'quench', type: 'interact', target: R22_QUENCH, textKey: 'quest.r22.quench' },
    forged(2),
    { id: 'hilt', type: 'interact', target: R22_HILT, textKey: 'quest.r22.hilt' },
    { id: 'choose', type: 'talk', target: 'dunstan', textKey: 'quest.r22.choose' },
  ],
  // The blade follows the choice made in Dunstan's last line (L7's practiceBladeFor, by `story.r22.choice`); quest rewards live
  // in the def, never in dialogue (the Act 1 rule).
  onComplete: [
    { if: { flag: R22_CHOICE, equals: 'light' }, then: [{ give: [{ itemId: R22_BLADE.light, count: 1 }] }] },
    { if: { flag: R22_CHOICE, equals: 'heavy' }, then: [{ give: [{ itemId: R22_BLADE.heavy, count: 1 }] }] },
  ],
  rewards: [{ xp: 650 }],
};
