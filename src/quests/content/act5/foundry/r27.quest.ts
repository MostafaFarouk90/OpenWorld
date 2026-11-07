import type { QuestDef } from '../../../types';
import { interacts, reads, story } from '../../act2/helpers';
import { STOKERS_TUNNEL_ID } from '../../../../caldera/interiors/sites';
import { R27_CHARGE, R27_CHOICE, R27_HELD, R27_LAMP, R27_PROP } from './flags';
import { phaseJOpen } from './phase';
import { rewardOf } from './rewards';

export const R27_PROPS = [1, 2, 3] as const;
export const R27_LAMPS = [1, 2, 3, 4] as const;
export const R27_CHARGES = [1, 2, 3] as const;
export const R27_USE = { prop: (n: number) => `use:r27-prop-${n}`, lamp: (n: number) => `use:r27-lamp-${n}`, charge: (n: number) => `use:r27-charge-${n}` } as const;
export const R27_CAPTAIN = 'tunnel-captain';
export const R27_ENTERED = 'story.r27.entered';
/** Raised by the choice line (the step is done on the flag, not on a talk ending). */
export const R27_CHOSEN_EVENT = 'story.r27.chosen';
export const R27_NOTES = { tally: 'note-r27-tally', door: 'note-r27-old-door' } as const;
export { R27_CHARGE, R27_LAMP, R27_PROP };

/**
 * R27 Grisel's Redemption (plan 2.2 and 2.7, Q6). Vey's counter-attack comes through the old stokers' tunnel. Wenna leads Cael
 * in; the garrison's captain (miners, stewards, both or none by F5) sets the line; Cael props the shoring, lights the lamps and
 * sets the charges; N4's siege kit runs the hold (three waves, four with F6 Leaders: the far end is open); then the choice at
 * the far shoring: collapse it or keep the tunnel as a sally port. No favour (design).
 */
export const r27: QuestDef = {
  id: 'r27',
  titleKey: 'quest.r27.title',
  summaryKey: 'quest.r27.summary',
  sequential: true,
  startWhen: phaseJOpen(),
  objectives: [
    { id: 'brief', type: 'talk', target: 'wenna', textKey: 'quest.r27.brief' },
    story('enter', 'quest.r27.enter', 'interior.entered', { match: { interiorId: STOKERS_TUNNEL_ID }, doneWhen: { flag: R27_ENTERED, equals: true } }),
    { id: 'captain', type: 'talk', target: R27_CAPTAIN, textKey: 'quest.r27.captain' },
    interacts('props', 'quest.r27.props', R27_PROPS.map(R27_USE.prop)),
    interacts('lamps', 'quest.r27.lamps', R27_LAMPS.map(R27_USE.lamp)),
    interacts('charges', 'quest.r27.charges', R27_CHARGES.map(R27_USE.charge)),
    reads('signs', 'quest.r27.signs', [R27_NOTES.tally, R27_NOTES.door], { optional: false }),
    story('hold', 'quest.r27.hold', R27_HELD, { doneWhen: { flag: R27_HELD, equals: true } }),
    story('choose', 'quest.r27.choose', R27_CHOSEN_EVENT, { doneWhen: { any: [{ flag: R27_CHOICE, equals: 'collapse' }, { flag: R27_CHOICE, equals: 'keep' }] } }),
    { id: 'report', type: 'talk', target: 'wenna', textKey: 'quest.r27.report' },
  ],
  rewards: rewardOf('r27'),
};
