import type { Condition, QuestDef } from '../../../types';
import { ACT4_REWARDS_IDS } from './rewards';
import { interacts, reads, story } from '../../act2/helpers';
import { ACT4_SPAWN_FLAGS } from '../../../../harrowmark/act4/spawners';

/** The four banner-captains in walking order (L2's posts): wall walk, Bastion yard, stables, chapel yard. */
export const R19_CAPTAINS = [
  { npc: 'captain-hesketh', id: 'archers' },
  { npc: 'captain-morwen', id: 'pikes' },
  { npc: 'captain-bran', id: 'horse' },
  { npc: 'captain-tolly', id: 'engineers' },
] as const;
export type R19Company = (typeof R19_CAPTAINS)[number]['id'];
export const R19_MUSTER = (id: R19Company): string => `story.r19.muster.${id}`;
/** `story.r19.choice`: the two mustered companies, sorted by id and joined with '-' (six pairs). */
export const R19_CHOICE = 'story.r19.choice';
export const r19Pair = (a: R19Company, b: R19Company): string => [a, b].sort().join('-');
export const R19_PAIRS: readonly string[] = (() => {
  const ids = R19_CAPTAINS.map((c) => c.id);
  const out: string[] = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) out.push(r19Pair(ids[i]!, ids[j]!));
  return out;
})();
const mustered = (id: R19Company): Condition => ({ flag: R19_MUSTER(id), equals: true });
const none = (...ids: R19Company[]): Condition => ({ all: ids.map((i) => ({ not: mustered(i) })) });
const some = (...ids: R19Company[]): Condition => ({ any: ids.map(mustered) });
/** Two companies are mustered among `ids`. */
const twoOf = (...ids: R19Company[]): Condition => {
  const pairs: Condition[] = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) pairs.push({ all: [mustered(ids[i]!), mustered(ids[j]!)] });
  return { any: pairs };
};
/**
 * Which answers each captain offers, so exactly two companies are mustered whatever the player picks: muster while fewer than
 * two are, hold the city while enough captains remain to make two.
 */
export const R19_CAN: Readonly<Record<R19Company, { muster: Condition; hold: Condition }>> = {
  archers: { muster: { all: [] }, hold: { all: [] } },
  pikes: { muster: { all: [] }, hold: { all: [] } },
  horse: { muster: { not: twoOf('archers', 'pikes') }, hold: some('archers', 'pikes') },
  engineers: { muster: { not: twoOf('archers', 'pikes', 'horse') }, hold: twoOf('archers', 'pikes', 'horse') },
};
export const R19_NONE_YET = none('archers', 'pikes', 'horse', 'engineers');
export const R19_DESERTERS_FLAG = ACT4_SPAWN_FLAGS.r19Deserters;
export const R19_DESERTER_GROUPS = ['r19.deserters.1', 'r19.deserters.2'] as const;
export const R19_DESERTERS_DOWN = 'story.r19.desertersDown';
/** Captain Bran's bout (one round on the shipped trial service, the R10 pattern). */
export const R19_BOUT_WON = 'story.r19.boutWon';
export const R19_BANNERS = ['use:r19-banner-1', 'use:r19-banner-2'] as const;
export const R19_HORN = 'use:r19-horn';
export const R19_NOTES = ['note-r19-roll', 'note-r19-letter'] as const;

/**
 * R19 Halvard Banners (plan 2.7). Four captains; muster two (the pair is `story.r19.choice`), the other two hold the city.
 * Halvard deserters come up after the second captain; Bran wants a bout before he will talk muster.
 */
export const r19: QuestDef = {
  id: 'r19',
  titleKey: 'quest.r19.title',
  summaryKey: 'quest.r19.summary',
  sequential: true,
  startWhen: { quest: 'm35', state: 'completed' },
  objectives: [
    { id: 'brief', type: 'talk', target: 'wystan', textKey: 'quest.r19.brief' },
    reads('roll', 'quest.r19.roll', [R19_NOTES[0]]),
    { id: 'archers', type: 'talk', target: 'captain-hesketh', textKey: 'quest.r19.archers' },
    { id: 'pikes', type: 'talk', target: 'captain-morwen', textKey: 'quest.r19.pikes' },
    story('deserters', 'quest.r19.deserters', R19_DESERTERS_DOWN, { doneWhen: { flag: R19_DESERTERS_DOWN, equals: true } }),
    story('bout', 'quest.r19.bout', R19_BOUT_WON, { doneWhen: { flag: R19_BOUT_WON, equals: true } }),
    { id: 'horse', type: 'talk', target: 'captain-bran', textKey: 'quest.r19.horse' },
    reads('letter', 'quest.r19.letter', [R19_NOTES[1]]),
    { id: 'engineers', type: 'talk', target: 'captain-tolly', textKey: 'quest.r19.engineers' },
    interacts('banners', 'quest.r19.banners', R19_BANNERS),
    { id: 'horn', type: 'interact', target: R19_HORN, textKey: 'quest.r19.horn' },
    { id: 'report', type: 'talk', target: 'wystan', textKey: 'quest.r19.report' },
  ],
  rewards: [{ xp: 550 }, { give: [{ itemId: ACT4_REWARDS_IDS.r19, count: 1 }] }],
};
