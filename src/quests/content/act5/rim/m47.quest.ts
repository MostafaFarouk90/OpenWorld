import type { QuestDef } from '../../../types';
import { reads, story } from '../../act2/helpers';
import { TQ } from './ids';
import { rewardOf } from './rewards';

/** v0.9's named flag (ACT5_FLAG_OWNERS: N10): the winch is wound and the Rim Gate's face opens (N1's leaf reads it on load). */
export const M47_RIM_GATE_OPEN = 'story.m47.rimGateOpen';
export const M47_WINCH = 'use:m47-winch';
/** N1's winch anchor on the west tower's outer stair (outside the face, reachable before the gate opens). */
export const M47_WINCH_ANCHOR = 'caldera.rim-gate.winch';
export const M47_HAIRPIN_TRIGGER = `${TQ}.m47.hairpin`;
export const M47_HAIRPIN = 'story.m47.hairpin';
export const M47_GROUPS = { knot1: 'm47.knot.1', knot2: 'm47.knot.2' } as const;
export const M47_DOWN = { knot1: 'story.m47.knot1Down', knot2: 'story.m47.knot2Down' } as const;
export const M47_NOTES = { journal: 'note-m47-journal', inscription: 'note-m47-inscription', bell: 'note-m47-bell' } as const;
export const M47_SIGHT_SCENE = 'scene-m47-sight';
export const M47_SIGHT = 'story.m47.sight';
export const M47_BRAZIER = 'use:m47-brazier';
export const M47_BRAZIER_LIT = 'story.m47.brazier';
export const M47_LAMP = 'use:m47-lamp';
export const M47_LAMP_LIT = 'story.m47.lamp';
export const RIM_CAMP_WAYSTONE = 'rim-camp';
export const ALRIC = 'alric';

/**
 * M47 Rim of the World (plan 2.1, 2.7). Starts by itself on `story.gate.a5` (the M39 pattern; the director starts it). Wulfhild
 * at the Rimfoot fire points up the stairs; two knots of stoker wraiths and gnats on the switchbacks; the journal at the hairpin
 * and the gate's inscription; the winch opens the Rim Gate; Alric at the stokers' post inside; the first sight of the Caldera;
 * Edric and Rook, who came up behind; the stokers' brazier and the gatehouse lamp; the bell; the Rim Camp waystone; Alric names
 * the Lava Stair.
 */
export const m47: QuestDef = {
  id: 'm47',
  titleKey: 'quest.m47.title',
  summaryKey: 'quest.m47.summary',
  sequential: true,
  startWhen: { flag: 'story.gate.a5', equals: true },
  objectives: [
    { id: 'wulfhild', type: 'talk', target: 'wulfhild', textKey: 'quest.m47.wulfhild' },
    story('knot1', 'quest.m47.knot1', M47_DOWN.knot1, { doneWhen: { flag: M47_DOWN.knot1, equals: true } }),
    story('hairpin', 'quest.m47.hairpin', M47_HAIRPIN, { doneWhen: { flag: M47_HAIRPIN, equals: true } }),
    reads('journal', 'quest.m47.journal', [M47_NOTES.journal]),
    story('knot2', 'quest.m47.knot2', M47_DOWN.knot2, { doneWhen: { flag: M47_DOWN.knot2, equals: true } }),
    reads('inscription', 'quest.m47.inscription', [M47_NOTES.inscription]),
    // the prop's used flag is the gate's flag; `doneWhen` also closes the step if the gate was opened another way (a dev jump)
    story('winch', 'quest.m47.winch', 'story.m47.winch', { doneWhen: { flag: M47_RIM_GATE_OPEN, equals: true } }),
    { id: 'alric', type: 'talk', target: ALRIC, textKey: 'quest.m47.alric' },
    story('sight', 'quest.m47.sight', M47_SIGHT, { doneWhen: { flag: M47_SIGHT, equals: true } }),
    { id: 'edric', type: 'talk', target: 'edric', textKey: 'quest.m47.edric' },
    { id: 'rook', type: 'talk', target: 'rook', textKey: 'quest.m47.rook' },
    { id: 'brazier', type: 'interact', target: M47_BRAZIER, textKey: 'quest.m47.brazier' },
    { id: 'lamp', type: 'interact', target: M47_LAMP, textKey: 'quest.m47.lamp' },
    reads('bell', 'quest.m47.bell', [M47_NOTES.bell]),
    story('stone', 'quest.m47.stone', 'waystone.rekindled', { match: { waystoneId: RIM_CAMP_WAYSTONE }, doneWhen: { flag: `waystone.${RIM_CAMP_WAYSTONE}.lit`, equals: true } }),
    { id: 'report', type: 'talk', target: ALRIC, textKey: 'quest.m47.report' },
  ],
  rewards: rewardOf('m47', 1000),
};
