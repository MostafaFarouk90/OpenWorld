import type { QuestDef } from '../../../types';
import { ACT4_REWARDS_IDS } from './rewards';
import { reads, story } from '../../act2/helpers';
import { ACT4_SPAWN_FLAGS } from '../../../../harrowmark/act4/spawners';

/** The five old watchmen (L2's posts) in walking order: barracks, gatehouse, stables, chapel, the Tilted Anvil's yard. */
export const R23_WITNESSES = ['witness-barracks', 'witness-gatehouse', 'witness-stables', 'witness-chapel', 'witness-anvil'] as const;
export const R23_ORDER = (n: number): string => `note-r23-order-${n}`;
/** The first testimony names the Crucible under the Keep: D07 opens on it (plan 2.5). */
export const R23_CRUCIBLE = 'story.r23.crucible';
export const R23_FORGER_FLAG = ACT4_SPAWN_FLAGS.r23Forger;
export const R23_FORGER_GROUPS = ['r23.forger'] as const;
export const R23_FORGER_DOWN = 'story.r23.forgerDown';
/** F7: `public` (H +5, O -2) or `private` (O +4). */
export const R23_CHOICE = 'story.r23.choice';
export type R23Way = 'public' | 'private';
export const R23_EXPOSED = 'story.r23.exposed';
/** Public: the reading in the watch yard. Private: Hamon Quill, the Council clerk, at the Keep court. */
export const R23_READING = 'use:r23-reading';
export const R23_CLERK = 'hamon-quill';

/**
 * R23 The Watch Remembers (plan 2.7). Five old watchmen, each a testimony and a sealed order of Vey's found where he keeps it;
 * the forger's minders come for Cael after the third. Rook asks how the forged orders are to be exposed (F7).
 */
export const r23: QuestDef = {
  id: 'r23',
  titleKey: 'quest.r23.title',
  summaryKey: 'quest.r23.summary',
  sequential: true,
  startWhen: { quest: 'm35', state: 'completed' },
  objectives: [
    { id: 'brief', type: 'talk', target: 'rook', textKey: 'quest.r23.brief' },
    ...R23_WITNESSES.flatMap((w, i) => [
      { id: `w${i + 1}`, type: 'talk' as const, target: w, textKey: `quest.r23.w${i + 1}` },
      reads(`o${i + 1}`, 'quest.r23.order', [R23_ORDER(i + 1)]),
      ...(i === 2 ? [story('forger', 'quest.r23.forger', R23_FORGER_DOWN, { doneWhen: { flag: R23_FORGER_DOWN, equals: true } })] : []),
    ]),
    { id: 'choose', type: 'talk', target: 'rook', textKey: 'quest.r23.choose' },
    story('expose', 'quest.r23.expose', R23_EXPOSED, { doneWhen: { flag: R23_EXPOSED, equals: true } }),
    { id: 'report', type: 'talk', target: 'rook', textKey: 'quest.r23.report' },
  ],
  rewards: [{ xp: 550 }, { give: [{ itemId: ACT4_REWARDS_IDS.r23, count: 1 }] }],
};
