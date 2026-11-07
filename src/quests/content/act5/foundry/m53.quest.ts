import type { QuestDef } from '../../../types';
import { reads, story } from '../../act2/helpers';
import { M53_BROKEN_DOWN, M53_TRUCE_SEEN } from './flags';
import { phaseJOpen } from './phase';
import { rewardOf } from './rewards';

export const M53_TRUCE_SCENE = 'scene-m53-truce';
/** The truce at the Inner Gate's apron: reaching it starts the truce scene. */
export const M53_GATE_TRIGGER = 'trg.caldera.q.f.m53.truce';
/** Vey at the truce (an NPC on the far side of the gate; gone once he withdraws). */
export const M53_VEY = 'vey-truce';
export const M53_NOTES = { ledger: 'note-m53-ledger', vial: 'note-m53-heart-vial', seal: 'note-m53-aldous-seal' } as const;
/** The groups at the gate: Aldous's loyalists (F1 Confront: six `footman-grisel`) or the pickets (Spy: two Warhost). */
export const M53_GROUPS = { loyalists: 'm53.loyalists', pickets: 'm53.pickets' } as const;
/** Vey has withdrawn and Edric has decided (the gate opens on `story.m53.complete`, N0's face). */
export const M53_WITHDRAWN = 'story.m53.withdrawn';

/**
 * M53 Vey's Last Argument (plan 2.2 and 2.7, Q5). Edric asks Cael to hear the Regent first. At the Inner Gate under a truce
 * banner Vey makes his case in three parts and Cael answers each from what the player did (the words change, never the
 * outcome). F1 Confront: Aldous's loyalists break the truce and fight; Spy: the pickets only. Three things read at the gate.
 * Vey withdraws into the Foundry; Edric decides; the Inner Gate opens with the quest.
 */
export const m53: QuestDef = {
  id: 'm53',
  titleKey: 'quest.m53.title',
  summaryKey: 'quest.m53.summary',
  sequential: true,
  startWhen: phaseJOpen(),
  objectives: [
    { id: 'brief', type: 'talk', target: 'edric', textKey: 'quest.m53.brief' },
    { id: 'rook', type: 'talk', target: 'rook', textKey: 'quest.m53.rook' },
    story('truce', 'quest.m53.truce', M53_TRUCE_SEEN, { doneWhen: { flag: M53_TRUCE_SEEN, equals: true } }),
    story('broken', 'quest.m53.broken', M53_BROKEN_DOWN, { doneWhen: { flag: M53_BROKEN_DOWN, equals: true } }),
    reads('gate', 'quest.m53.gate', [M53_NOTES.ledger, M53_NOTES.vial, M53_NOTES.seal]),
    { id: 'decide', type: 'talk', target: 'edric', textKey: 'quest.m53.decide' },
  ],
  rewards: rewardOf('m53'),
};
