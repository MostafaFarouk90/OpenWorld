import type { QuestDef } from '../../../types';
import { reads, story } from '../../act2/helpers';
import { rewardOf } from './rewards';

export const EBBA = 'ebba';
export const CHAPEL_KEEPER = 'chapel-keeper';
export const M44_NEST_GROUP = 'm44.nest';
export const M44_NEST_ARM = 'story.m44.nestArmed';
export const M44_NEST_DOWN = 'story.m44.nestDown';
export const M44_NOTES = {
  book: 'note-m44-family-book', letter: 'note-m44-letter', cradle: 'note-m44-cradle', toy: 'note-m44-toy',
  sampler: 'note-m44-sampler', ledger: 'note-m44-ledger', graves: 'note-m44-graves',
} as const;
export const M44_BOX = 'use:m44-music-box';
export const M44_BOX_FLAG = 'story.m44.box';
/** The first dream (Q10): plays once at the first rest after M44; L9's codex reads this flag by name. */
export const M44_DREAM_SCENE = 'scene-a4-dream-1';
export const M44_DREAM_SEEN = 'story.m44.dreamSeen';

/**
 * M44 Ebba's Song (plan 2.7). Ebba at the chapel door; Sister Aedre inside; the three ruined houses (a family book, the nest in
 * the second, a sampler and the music box in the third), two things read in each; the graves behind the chapel; back to Ebba. The first dream plays at the next rest (the director).
 */
export const m44: QuestDef = {
  id: 'm44',
  titleKey: 'quest.m44.title',
  summaryKey: 'quest.m44.summary',
  sequential: true,
  startWhen: { quest: 'm43', state: 'completed' },
  objectives: [
    { id: 'brief', type: 'talk', target: EBBA, textKey: 'quest.m44.brief' },
    { id: 'keeper', type: 'talk', target: CHAPEL_KEEPER, textKey: 'quest.m44.keeper' },
    reads('house1', 'quest.m44.house1', [M44_NOTES.book, M44_NOTES.letter]),
    story('nest', 'quest.m44.nest', M44_NEST_DOWN, { doneWhen: { flag: M44_NEST_DOWN, equals: true } }),
    reads('house2', 'quest.m44.house2', [M44_NOTES.cradle, M44_NOTES.toy]),
    reads('house3', 'quest.m44.house3', [M44_NOTES.sampler, M44_NOTES.ledger]),
    { id: 'box', type: 'interact', target: M44_BOX, textKey: 'quest.m44.box' },
    // the village's graves behind the chapel (a pacing beat, plan 5: M44 measured under 45% on L1's close-set houses)
    reads('graves', 'quest.m44.graves', [M44_NOTES.graves]),
    // Sister Aedre at the graves (L13 Phase H M1: M44 at 35% by the shipped count, notes as one search beat each)
    { id: 'aedre', type: 'talk', target: CHAPEL_KEEPER, textKey: 'quest.m44.aedre' },
    { id: 'report', type: 'talk', target: EBBA, textKey: 'quest.m44.report' },
  ],
  rewards: rewardOf('m44', 800),
};
