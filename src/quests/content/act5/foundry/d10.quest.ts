import type { QuestDef } from '../../../types';
import { interacts, reads, story } from '../../act2/helpers';
import { D10_ADDS_DOWN, ULTHRED_OUTCOME } from './flags';
import { rewardOf } from './rewards';

export const D10_ADDS = { thralls: 'd10.thralls', fire: 'd10.forge-fire' } as const;
/** The four forge vents at the hall's last door: doused, the door's heat drops (four interacts in any order). */
export const D10_VENTS = [1, 2, 3, 4] as const;
export const D10_VENT_USE = (n: number): string => `use:d10-vent-${n}`;
/** The stokers' marks scratched beside the last door (four searches). */
export const D10_MARK_NOTE = (n: number): string => `note-d10-mark-${n}`;

/**
 * D10 The Last Hammer (plan 2.2). Alric sends Cael through the hall's last door: thralls and forge-fire wake in the approach,
 * four vents to douse, the stokers' last marks by the door; then Ulthred, the Ash King, on N6's boss (three phases; at 66%
 * the floor breaks onto the Anvil of Ages; at 33% Vey's armour and the spirit-flames, `spiritFlamesFor`; the Heartshard's
 * final blow). Starting D10 writes `story.d10.started`, which arms N6's boss on the hall trigger and opens the Anvil's hole.
 * After the fall, Alric on the Anvil. Completes there; M56 follows.
 */
export const d10: QuestDef = {
  id: 'd10',
  titleKey: 'quest.d10.title',
  summaryKey: 'quest.d10.summary',
  sequential: true,
  startWhen: { quest: 'm55', state: 'completed' },
  objectives: [
    { id: 'brief', type: 'talk', target: 'alric', textKey: 'quest.d10.brief' },
    story('adds', 'quest.d10.adds', D10_ADDS_DOWN, { doneWhen: { flag: D10_ADDS_DOWN, equals: true } }),
    interacts('vents', 'quest.d10.vents', D10_VENTS.map(D10_VENT_USE)),
    reads('marks', 'quest.d10.marks', D10_VENTS.map(D10_MARK_NOTE)),
    story('ulthred', 'quest.d10.ulthred', ['boss.defeated'], { match: { bossId: 'ulthred' }, doneWhen: { flag: ULTHRED_OUTCOME, equals: 'defeated' } }),
    { id: 'end', type: 'talk', target: 'alric', textKey: 'quest.d10.end' },
  ],
  rewards: rewardOf('d10'),
};
