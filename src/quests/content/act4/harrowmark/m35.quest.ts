import type { QuestDef } from '../../../types';
import { ACT4_REWARDS_IDS } from './rewards';
import { reads, story } from '../../act2/helpers';
import { ACT4_SPAWN_FLAGS } from '../../../../harrowmark/act4/spawners';

/** The three delegations, in the order M35 walks them (plan 2.7). */
export const M35_HOUSES = ['oswin', 'halvard', 'grisel'] as const;
export type M35House = (typeof M35_HOUSES)[number];
export const M35_ESCORT = (h: M35House): string => `m35.${h}`;
export const M35_IN = (h: M35House): string => `story.m35.${h}.in`;
/** The checkpoint each delegation is passed through (L2's sites), and the guard who reads the seal there. */
export const M35_CHECKPOINT: Readonly<Record<M35House, string>> = { oswin: 'counting', halvard: 'keep-road-s', grisel: 'river-gate' };
export const M35_GUARD = (h: M35House): string => `vey-guard-${M35_CHECKPOINT[h]}-1`;
/** Who hands Cael each delegation. */
export const M35_LEAD: Readonly<Record<M35House, string>> = { oswin: 'merrin', halvard: 'aldric-cole', grisel: 'grisel-steward' };
export const M35_AMBUSH_FLAG = ACT4_SPAWN_FLAGS.m35Ambush;
export const M35_AMBUSH_GROUPS = ['m35.ambush.1', 'm35.ambush.2'] as const;
export const M35_AMBUSH_DOWN = 'story.m35.ambushDown';
export const M35_CHAIN = 'use:m35-river-chain';
export const M35_CHAIN_FLAG = 'story.m35.chain';
export const M35_NOTES = ['note-m35-ledger', 'note-m35-mask', 'note-m35-orders'] as const;
export const M35_ENTERED = 'story.m35.entered';
/** The lane trigger the Grisel delegation walks into: the masked men spring when the escort reaches it. */
export const M35_LANE_TRIGGER = 'trg.harrowmark.a4.q.m35.lane';

const escortIn = (h: M35House) =>
  story(`${h}In`, `quest.m35.${h}In`, 'escort.arrived', { match: { escortId: M35_ESCORT(h) }, doneWhen: { flag: M35_IN(h), equals: true } });

/**
 * M35 Summons to the Council (plan 2.1, 2.7). Wystan sends Cael for the three House delegations: each is met, shown past one of
 * Vey's checkpoints (the guard reads the Council writ) and walked to the Keep court behind Cael on L4's escort. The Grisel party
 * comes in from the river road by the farm-ring; masked men spring in the River Gate lane (L2's first-arrival groups).
 */
export const m35: QuestDef = {
  id: 'm35',
  titleKey: 'quest.m35.title',
  summaryKey: 'quest.m35.summary',
  sequential: true,
  startWhen: { flag: 'story.gate.a4', equals: true },
  objectives: [
    { id: 'brief', type: 'talk', target: 'wystan', textKey: 'quest.m35.brief' },
    { id: 'oswin', type: 'talk', target: M35_LEAD.oswin, textKey: 'quest.m35.oswin' },
    { id: 'oswinPass', type: 'talk', target: M35_GUARD('oswin'), textKey: 'quest.m35.oswinPass' },
    escortIn('oswin'),
    { id: 'halvard', type: 'talk', target: M35_LEAD.halvard, textKey: 'quest.m35.halvard' },
    { id: 'halvardPass', type: 'talk', target: M35_GUARD('halvard'), textKey: 'quest.m35.halvardPass' },
    escortIn('halvard'),
    { id: 'grisel', type: 'talk', target: M35_LEAD.grisel, textKey: 'quest.m35.grisel' },
    { id: 'chain', type: 'interact', target: M35_CHAIN, textKey: 'quest.m35.chain' },
    { id: 'griselPass', type: 'talk', target: M35_GUARD('grisel'), textKey: 'quest.m35.griselPass' },
    story('ambush', 'quest.m35.ambush', M35_AMBUSH_DOWN, { doneWhen: { flag: M35_AMBUSH_DOWN, equals: true } }),
    reads('search', 'quest.m35.search', M35_NOTES),
    escortIn('grisel'),
    story('entered', 'quest.m35.entered', M35_ENTERED, { doneWhen: { flag: M35_ENTERED, equals: true } }),
    { id: 'report', type: 'talk', target: 'wystan', textKey: 'quest.m35.report' },
  ],
  rewards: [{ xp: 700 }, { give: [{ itemId: ACT4_REWARDS_IDS.m35, count: 1 }] }],
};
