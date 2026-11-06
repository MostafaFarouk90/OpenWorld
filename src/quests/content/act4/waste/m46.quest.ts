import type { QuestDef } from '../../../types';
import { reads, story } from '../../act2/helpers';
import { rewardOf } from './rewards';

export const M46_CAIRNS = [1, 2, 3] as const;
/** L1's three cairns on `rope.cinder-road-north` (plans/act4-L1.md s.16 item 7). */
export const M46_CAIRN_ANCHOR = (n: number): string => `waste.cinder-road.cairn.${n}`;
export const M46_KEEPER = (n: number): string => `cairn-walker-${n}`;
export const M46_REACHED = (n: number): string => `story.m46.cairn${n}`;
export const M46_CAIRN_TRIGGER = (n: number): string => `trg.waste.q.m46.cairn-${n}`;
/** One wave at each cairn on the shipped wave director (the set id). */
export const M46_WAVE = (n: number): string => `m46.cairn-${n}`;
export const M46_HELD = (n: number): string => `story.m46.held${n}`;
/** Cairns 1 and 2 are lit (interact); cairn 3 is the rim's own. */
export const M46_LIGHT = (n: 1 | 2): string => `use:m46-cairn-${n}`;
export const M46_LIT = (n: 1 | 2): string => `story.m46.lit${n}`;
export const M46_MARKS = ['note-m46-mark-1', 'note-m46-mark-2'] as const;
export const M46_LORE = ['note-m46-lore-1', 'note-m46-lore-2'] as const;
export const M46_OUTRIDERS = ['m46.outriders', 'm46.outriders.striders'] as const;
export const M46_OUTRIDERS_ARM = 'story.m46.outridersArmed';
export const M46_OUTRIDERS_DOWN = 'story.m46.outridersDown';
export const M46_RIM_SCENE = 'scene-m46-rim';
export const M46_RIM = 'story.m46.rim';
export const M46_RIM_TRIGGER = 'trg.waste.q.m46.rim';
/** Hrolf walks with Cael for the quest even when benched (L4's follow override, a guest slot). */
export const M46_GUEST = 'hrolf';

/** Plan 2.5 and Q12: every other Phase H quest, D08 included. Plain clauses, so L9's "still needed" note reads them. */
export const M46_NEEDS = ['m42', 'm43', 'm44', 'm45', 'd08', 'r24', 'r25'] as const;

/**
 * M46 Road to the Rim (plan 2.7). Hrolf leads up the Cinder Road North; at each cairn a cairn-keeper's lore, a wave of the
 * wraith column (the storm held clear only while it runs; the road between keeps real weather), a mark searched and the cairn
 * lit; the column's outriders before the third; at Rimfoot the rim in sight. The act's ending is L13's (`requires m46, d08`).
 */
export const m46: QuestDef = {
  id: 'm46',
  titleKey: 'quest.m46.title',
  summaryKey: 'quest.m46.summary',
  sequential: true,
  startWhen: { all: M46_NEEDS.map((q) => ({ quest: q, state: 'completed' as const })) },
  objectives: [
    { id: 'brief', type: 'talk', target: 'hrolf', textKey: 'quest.m46.brief' },
    { id: 'keeper1', type: 'talk', target: M46_KEEPER(1), textKey: 'quest.m46.keeper1' },
    story('wave1', 'quest.m46.wave1', M46_HELD(1), { doneWhen: { flag: M46_HELD(1), equals: true } }),
    reads('mark1', 'quest.m46.mark1', [M46_MARKS[0]]),
    { id: 'light1', type: 'interact', target: M46_LIGHT(1), textKey: 'quest.m46.light1' },
    { id: 'keeper2', type: 'talk', target: M46_KEEPER(2), textKey: 'quest.m46.keeper2' },
    story('wave2', 'quest.m46.wave2', M46_HELD(2), { doneWhen: { flag: M46_HELD(2), equals: true } }),
    reads('mark2', 'quest.m46.mark2', [M46_MARKS[1]]),
    { id: 'light2', type: 'interact', target: M46_LIGHT(2), textKey: 'quest.m46.light2' },
    story('outriders', 'quest.m46.outriders', M46_OUTRIDERS_DOWN, { doneWhen: { flag: M46_OUTRIDERS_DOWN, equals: true } }),
    { id: 'keeper3', type: 'talk', target: M46_KEEPER(3), textKey: 'quest.m46.keeper3' },
    story('wave3', 'quest.m46.wave3', M46_HELD(3), { doneWhen: { flag: M46_HELD(3), equals: true } }),
    reads('lore', 'quest.m46.lore', M46_LORE),
    story('rim', 'quest.m46.rim', M46_RIM, { doneWhen: { flag: M46_RIM, equals: true } }),
    { id: 'report', type: 'talk', target: 'hrolf', textKey: 'quest.m46.report' },
  ],
  rewards: rewardOf('m46', 950),
};
