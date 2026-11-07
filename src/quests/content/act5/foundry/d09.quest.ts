import type { QuestDef } from '../../../types';
import { reads, story } from '../../act2/helpers';
import { FOUNDRY_DESCENT_ID } from '../../../../caldera/interiors/sites';
import { D09_GUARDS_DOWN, D09_PATROL_DOWN, D09_SLAG, VEY_OUTCOME } from './flags';
import { rewardOf } from './rewards';

export const D09_ENTERED = 'story.d09.entered';
export const D09_STOKER = 'captive-stoker';
export const D09_SLUICES = [1, 2, 3] as const;
export const D09_SLUICE_USE = (n: number): string => `use:d09-sluice-${n}`;
/** The order the stokers' plate shows (a fixed reading of the plate, Q6): west, east, middle. */
export const D09_SLUICE_ORDER = [1, 3, 2] as const;
/** A wrong sluice floods the runnels for this long (N3's lava volumes: never kills, throws to the lip) and resets the order. */
export const D09_FLOOD_S = 8;
/** After this many wrong orders the next right sluice glows (the M50 lesson rule). */
export const D09_LESSON_AFTER = 2;
export const D09_NOTES = { plate: 'note-d09-plate', ledgers: 'note-d09-heart-ledgers', vats: 'note-d09-vats', map: 'note-d09-anvils-map', orders: 'note-d09-orders' } as const;
export const D09_GROUPS = { patrol: 'd09.patrol', guards: 'd09.guards', vatPatrol: 'd09.vat-patrol' } as const;
export const D09_WENNA = 'wenna-foundry';
/** The outcome scene played (the spare or the strike, and Alric's words after). */
export const D09_OUTCOME_SEEN = 'story.d09.outcomeSeen';

/**
 * D09 Iron and Ember (plan 2.2 and 2.7, Q6). Alric at the Foundry door. The D09 favour read is taken the first time Cael enters
 * (idempotent, coordinator ruling 4). Floor 1: the Warhost patrol and the slag-flow puzzle (three sluices in the plate's order;
 * a wrong one floods the runnels, the lesson after two); routing the slag writes `story.d09.slag` (N2's lift gate). Floor 2:
 * the vat gallery's Grisel guards (F1 Spy: Wenna turns all at Grisel 25 or more, half below) and the ledgers. Floor 3: Morcant
 * Vey (N6), spared or defeated; then his outcome scene and Alric.
 */
export const d09: QuestDef = {
  id: 'd09',
  titleKey: 'quest.d09.title',
  summaryKey: 'quest.d09.summary',
  sequential: true,
  startWhen: { quest: 'm53', state: 'completed' },
  objectives: [
    { id: 'brief', type: 'talk', target: 'alric', textKey: 'quest.d09.brief' },
    story('enter', 'quest.d09.enter', 'interior.entered', { match: { interiorId: FOUNDRY_DESCENT_ID }, doneWhen: { flag: D09_ENTERED, equals: true } }),
    story('patrol', 'quest.d09.patrol', D09_PATROL_DOWN, { doneWhen: { flag: D09_PATROL_DOWN, equals: true } }),
    { id: 'stoker', type: 'talk', target: D09_STOKER, textKey: 'quest.d09.stoker' },
    reads('plate', 'quest.d09.plate', [D09_NOTES.plate]),
    story('slag', 'quest.d09.slag', D09_SLAG, { doneWhen: { flag: D09_SLAG, equals: true } }),
    story('guards', 'quest.d09.guards', D09_GUARDS_DOWN, { doneWhen: { flag: D09_GUARDS_DOWN, equals: true } }),
    reads('gallery', 'quest.d09.gallery', [D09_NOTES.ledgers, D09_NOTES.vats, D09_NOTES.map, D09_NOTES.orders]),
    story('vey', 'quest.d09.vey', ['boss.defeated', 'boss.spared'], {
      match: { bossId: 'vey' },
      doneWhen: { any: [{ flag: VEY_OUTCOME, equals: 'spared' }, { flag: VEY_OUTCOME, equals: 'defeated' }] },
    }),
    story('after', 'quest.d09.after', D09_OUTCOME_SEEN, { doneWhen: { flag: D09_OUTCOME_SEEN, equals: true } }),
  ],
  rewards: [
    ...rewardOf('d09'),
    // design 3: spared O +4 H -4; struck down H +4 O -2. The Spare's O +4 is paid by N6's BOSS_MERCY row (the hold-T mercy
    // tally, as Redmane and Skarl), so only the rest is paid here.
    { if: { flag: VEY_OUTCOME, equals: 'spared' }, then: [{ favour: 'halvard', delta: -4 }], else: [{ favour: 'halvard', delta: 4 }, { favour: 'oswin', delta: -2 }] },
  ],
};
