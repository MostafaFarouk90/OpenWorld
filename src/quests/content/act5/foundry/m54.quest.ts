import type { QuestDef } from '../../../types';
import { reads, story } from '../../act2/helpers';
import { HAMMER_HALL_ID } from '../../../../caldera/interiors/sites';
import { M54_ENTERED, M54_MURALS_FLAG, M54_THRALLS_DOWN, M54_VOICE_SEEN } from './flags';
import { rewardOf } from './rewards';

/** Ulthred's voice through the approach's walls (a tree of its own, opened by the director on the approach trigger). */
export const M54_VOICE = 'ulthred-voice';
/** N2's approach trigger: the voice starts the first time Cael walks into it while the step is current. */
export const M54_APPROACH_TRIGGER = 'trg.caldera.int.hammer.approach';
export const M54_MURALS = [1, 2, 3, 4] as const;
export const M54_MURAL_NOTE = (n: number): string => `note-m54-mural-${n}`;
export const M54_THRALLS = 'm54.thralls';

/**
 * M54 Ulthred Wakes (plan 2.2, Q12). Offered by Alric at the Rim Camp once D09 and R27 are done; before it starts his
 * "last chance on the rim" names every open rim quest (R28, R29, R30), and starting it withdraws them (the director). Below
 * the Foundry the Ash King's voice speaks through the walls (Ebba's music-box hum, then words); four murals show the first
 * king chaining the keepers to the anvil (`story.m54.murals` once all four are read: N9's codex); four forge-thralls wake;
 * Alric's last warnings, with the companions. `story.m54.complete` opens N2's hall gate.
 */
export const m54: QuestDef = {
  id: 'm54',
  titleKey: 'quest.m54.title',
  summaryKey: 'quest.m54.summary',
  sequential: true,
  startWhen: { all: [{ quest: 'd09', state: 'completed' }, { quest: 'r27', state: 'completed' }] },
  objectives: [
    { id: 'brief', type: 'talk', target: 'alric', textKey: 'quest.m54.brief' },
    story('descend', 'quest.m54.descend', 'interior.entered', { match: { interiorId: HAMMER_HALL_ID }, doneWhen: { flag: M54_ENTERED, equals: true } }),
    story('voice', 'quest.m54.voice', M54_VOICE_SEEN, { doneWhen: { flag: M54_VOICE_SEEN, equals: true } }),
    { ...reads('murals', 'quest.m54.murals', M54_MURALS.map(M54_MURAL_NOTE)), doneWhen: { flag: M54_MURALS_FLAG, equals: true } },
    story('thralls', 'quest.m54.thralls', M54_THRALLS_DOWN, { doneWhen: { flag: M54_THRALLS_DOWN, equals: true } }),
    { id: 'warnings', type: 'talk', target: 'alric', textKey: 'quest.m54.warnings' },
  ],
  rewards: rewardOf('m54'),
};
