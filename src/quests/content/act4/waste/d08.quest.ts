import type { QuestDef } from '../../../types';
import { reads, story } from '../../act2/helpers';

/** L1 PR 2's cathedral interior (L6's id). */
export const CATHEDRAL_ID = 'husk-cathedral';
export const D08_DYING = 'dying-walker';
export const D08_ENTERED = 'story.d08.entered';
/** The narthex's two Husk Knights and their husks (a knight and its husks are separate groups: a skin dresses one kind). */
export const D08_KNIGHTS = ['d08.knight-1', 'd08.husks-1', 'd08.knight-2', 'd08.husks-2'] as const;
export const D08_KNIGHTS_DOWN = 'story.d08.knightsDown';
export const D08_NOTES = { bones: 'note-d08-bones', rope: 'note-d08-gong-rope', tablets: 'note-d08-tablets', niche: 'note-d08-niche' } as const;
/** L6's boss; the core registry writes the outcome before `boss.ended`. */
export const D08_BOSS_FLAG = 'boss.eormen.outcome';
/** The Crown Shard is given once, by the director, when D08 completes with Eormen destroyed (not a talk effect: a second
 *  Wulfhild talk ending in the same conversation could pass the report without its lines). */
export const D08_SHARD_GIVEN = 'story.d08.shardGiven';

/**
 * D08 The Cathedral of Husks (plan 2.7). Wulfhild sends Cael to the cathedral; Leofric, dying at the door; inside, two Husk
 * Knight groups in the narthex, a pilgrim's bones and the gong-rope; Archwraith Eormen (L6: released or destroyed, both end
 * the fight); the crypt (its gate opens on the outcome, L1's blocker), the tablets and the crown's niche; Wulfhild hears the end. The Crown Shard
 * is given in that talk only when Eormen was destroyed (plan 2.4); the shard-gem pays itself (L7).
 */
export const d08: QuestDef = {
  id: 'd08',
  titleKey: 'quest.d08.title',
  summaryKey: 'quest.d08.summary',
  sequential: true,
  startWhen: { quest: 'm43', state: 'completed' },
  objectives: [
    { id: 'brief', type: 'talk', target: 'wulfhild', textKey: 'quest.d08.brief' },
    { id: 'dying', type: 'talk', target: D08_DYING, textKey: 'quest.d08.dying' },
    story('enter', 'quest.d08.enter', 'interior.entered', { match: { interiorId: CATHEDRAL_ID }, doneWhen: { flag: D08_ENTERED, equals: true } }),
    story('knights', 'quest.d08.knights', D08_KNIGHTS_DOWN, { doneWhen: { flag: D08_KNIGHTS_DOWN, equals: true } }),
    reads('bones', 'quest.d08.bones', [D08_NOTES.bones]),
    reads('rope', 'quest.d08.rope', [D08_NOTES.rope]),
    story('boss', 'quest.d08.boss', ['boss.defeated', 'boss.released'], {
      match: { bossId: 'eormen' },
      doneWhen: { any: [{ flag: D08_BOSS_FLAG, equals: 'released' }, { flag: D08_BOSS_FLAG, equals: 'defeated' }] },
    }),
    reads('tablets', 'quest.d08.tablets', [D08_NOTES.tablets]),
    reads('niche', 'quest.d08.niche', [D08_NOTES.niche]),
    { id: 'report', type: 'talk', target: 'wulfhild', textKey: 'quest.d08.report' },
  ],
  rewards: [{ xp: 1100 }],
};
