import type { Condition, QuestDef } from '../../../types';
import { interacts, nums, reads, story } from '../../act2/helpers';

export const R12_PICK = 'story.r12.pick';
/** The locked choice (`burned` | `cut`), K3's readers mirror it into the reed beds. */
export const R12_CHOICE = 'story.r12.choice';
export const R12_FAVOURED = 'story.r12.favoured';
export const R12_ARMOUR_GIVEN = 'story.r12.armourGiven';
export const R12_NOTES = ['note-r12-tally', 'note-r12-cache', 'note-r12-nest'];
export const R12_BEDS = [1, 2, 3, 4, 5] as const;
export const R12_TORCHES = R12_BEDS.map((n) => `use:r12-bed-${n}-torch`);
export const R12_CUTS = R12_BEDS.flatMap((n) => [1, 2].map((c) => `use:r12-bed-${n}-cut-${c}`));
export const R12_TORCH_FLAG = (n: number): string => `story.r12.bed${n}.torch`;
export const R12_CUT_FLAG = (n: number, c: number): string => `story.r12.bed${n}.cut${c}`;
export const R12_BURN_TAG = 'r12.burn';
export const R12_CUT_TAG = 'r12.cut';
/** Leeches the torch drives out: bed 1 gives two, the rest one each (six in all); the cut gives three a bed (fifteen). */
export const R12_BURN_LEECHES = [2, 1, 1, 1, 1] as const;
export const R12_CUT_LEECHES = 3;
export const R12_BURN_KILLS = 6;
export const R12_CUT_KILLS = 15;
export const R12_BURN_KILL_COUNT = 'story.r12.burnKills';
export const R12_CUT_KILL_COUNT = 'story.r12.cutKills';
export const R12_BURN_DOWN = 'story.r12.burnDown';
export const R12_CUT_DOWN = 'story.r12.cutDown';

const picked = (v: 'burned' | 'cut'): Condition => ({ flag: R12_PICK, equals: v });
/** Prop gates: the branch the player picked at Dudda (the lock follows the first bed). */
export const R12_BURNING: Condition = picked('burned');
export const R12_CUTTING: Condition = picked('cut');

/**
 * R12 Reed-Cutters' Dues. The reed-cutters owe Dudda their dues in reeds and the beds are fouled with leeches. Dudda and
 * the two cutters set the matter out; Cael picks the torch or the sickle with Dudda (changeable until the first bed is
 * treated, then fixed in `story.r12.choice`, favour once), finds three tallies, then treats five beds: five torches (the
 * shorter way; six leeches driven out) or ten cuts (fifteen leeches). The unused branch's objectives credit by themselves
 * (the M21 pattern). Leech deaths are counted by the director from the start of the work, so a bed fought out of order is
 * not lost.
 */
export const r12: QuestDef = {
  id: 'r12',
  titleKey: 'quest.r12.title',
  summaryKey: 'quest.r12.summary',
  sequential: true,
  startWhen: { quest: 'm24', state: 'completed' },
  objectives: [
    { id: 'brief', type: 'talk', target: 'dudda', textKey: 'quest.r12.brief' },
    { id: 'cutter1', type: 'talk', target: 'reed-cutter-1', textKey: 'quest.r12.cutter1' },
    { id: 'cutter2', type: 'talk', target: 'reed-cutter-2', textKey: 'quest.r12.cutter2' },
    reads('search', 'quest.r12.search', R12_NOTES),
    story('choice', 'quest.r12.choice', 'story.r12.picked', { doneWhen: { any: [picked('burned'), picked('cut')] } }),
    interacts('burn', 'quest.r12.burn', R12_TORCHES, { doneWhen: R12_CUTTING }),
    story('burnKills', 'quest.r12.burnKills', 'story.r12.burnDown', { required: 1, doneWhen: { any: [R12_CUTTING, { flag: R12_BURN_DOWN, equals: true }] } }),
    interacts('cut', 'quest.r12.cut', R12_CUTS, { doneWhen: R12_BURNING }),
    story('cutKills', 'quest.r12.cutKills', 'story.r12.cutDown', { required: 1, doneWhen: { any: [R12_BURNING, { flag: R12_CUT_DOWN, equals: true }] } }),
    { id: 'report', type: 'talk', target: 'dudda', textKey: 'quest.r12.report' },
  ],
  rewards: [
    { xp: 450 },
    // the burn branch is paid at its last bed (director); the cut branch is paid here
    { if: { not: { flag: R12_ARMOUR_GIVEN, equals: true } }, then: [{ give: [{ itemId: 'reed-armour', count: 1 }] }, { setFlag: R12_ARMOUR_GIVEN, value: true }] },
  ],
};

export const R12_BED_NUMS = nums('', 5);
