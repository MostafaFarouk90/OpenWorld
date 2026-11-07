import type { QuestDef } from '../../../types';
import { reads, story } from '../../act2/helpers';
import { rewardOf } from './rewards';
import { CHAPEL_KEEPER, EBBA } from './m44.quest';

export const R25_HEARTHS = [1, 2, 3] as const;
export const R25_CANDLE_ITEM = 'r25-candle';
export const R25_LIGHT = (n: number): string => `use:r25-hearth-${n}`;
export const R25_LIT = (n: number): string => `story.r25.lit${n}`;
/** Written by the director while R25 runs: Cael holds no candle (a hearth will not take a light; Ebba gives another). */
export const R25_NO_CANDLE = 'story.r25.noCandle';
/** Ebba's spare (dialogue event): the director gives one candle when Cael holds none. Quest items stay out of dialogue. */
export const R25_SPARE_ASKED = 'story.r25.spareAsked';
/** The director gave the three candles on R25's start (once). */
export const R25_CANDLES_GIVEN = 'story.r25.candlesGiven';
export const R25_NAME_NOTE = (n: number): string => `note-r25-name-${n}`;
export const R25_REGISTER = 'note-r25-register';
/** A letter folded into the register (a pacing beat, plan 5). */
export const R25_LETTER = 'note-r25-letter';
export const R25_KNOT_GROUP = 'r25.knot';
export const R25_KNOT_ARM = 'story.r25.knotArmed';
export const R25_KNOT_DOWN = 'story.r25.knotDown';

/**
 * R25 The Child's Candle (plan 2.3). Ebba gives three candles; at each lost family's hearth (the three burned village shells
 * round the chapel, coordinator 18:01) Cael reads the family's name and lights a candle; a wraith knot holds the third; the
 * chapel register names them all; back to Ebba. Ebba gives a new candle to anyone who has lost one (her tree).
 */
export const r25: QuestDef = {
  id: 'r25',
  titleKey: 'quest.r25.title',
  summaryKey: 'quest.r25.summary',
  sequential: true,
  startWhen: { quest: 'm44', state: 'completed' },
  objectives: [
    { id: 'brief', type: 'talk', target: EBBA, textKey: 'quest.r25.brief' },
    reads('name1', 'quest.r25.name1', [R25_NAME_NOTE(1)]),
    { id: 'light1', type: 'interact', target: R25_LIGHT(1), textKey: 'quest.r25.light1' },
    reads('name2', 'quest.r25.name2', [R25_NAME_NOTE(2)]),
    { id: 'light2', type: 'interact', target: R25_LIGHT(2), textKey: 'quest.r25.light2' },
    story('knot', 'quest.r25.knot', R25_KNOT_DOWN, { doneWhen: { flag: R25_KNOT_DOWN, equals: true } }),
    reads('name3', 'quest.r25.name3', [R25_NAME_NOTE(3)]),
    { id: 'light3', type: 'interact', target: R25_LIGHT(3), textKey: 'quest.r25.light3' },
    reads('register', 'quest.r25.register', [R25_REGISTER, R25_LETTER]),
    // Sister Aedre writes the three hearths into the register (L13 Phase H M1: R25 at 35% by the shipped count)
    { id: 'aedre', type: 'talk', target: CHAPEL_KEEPER, textKey: 'quest.r25.aedre' },
    { id: 'report', type: 'talk', target: EBBA, textKey: 'quest.r25.report' },
  ],
  rewards: rewardOf('r25', 550),
};

