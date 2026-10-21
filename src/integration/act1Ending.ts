// The Act 1 mini-ending, "Smoke Over Harrowmark" (design 4.5: after M10 and D02). Thread 21 owns the story gate and the
// emission; the HUD shows the card on `act.ended` (and re-derives it from the gate on a load), thread 17's world change
// builds on the gate behind the modal card, and the camp scene (thread 6's `scene-act1-camp`) runs after the card.
//
// Live: when the second of M10 and D02 completes (D02 always ends last, its start needs M10), the director sets
// `story.gate.a2` and emits `act.ended { act: 1, endingId }` once. `story.gate.a2` is the record that Act 1 ended.
// After the card's `hud.actEnding.closed`, the camp is armed and started from the rules tick once nothing is in the way.
//
// Load table (on `save.loaded`; never emits `act.ended`, never starts anything inside the handler):
//   m10 + d02 completed, gate unset (an autosave between the completion and the gate)  -> set the gate (the HUD shows the card)
//   gate set, card not seen                                                             -> wait for the HUD's card and its `closed`
//   gate set, card seen, camp not seen (quit during the card or mid-camp)               -> arm the camp
//   camp seen                                                                           -> nothing
// A camp cut short (death, a load, a script close) is re-armed by the same rule: it ends only on `story.d02.campSeen`.

import { ActEndingDirector, type ActEndingPorts } from './actEndingDirector';

export const ACT1_ENDING_ID = 'smoke-over-harrowmark';
export const ACT1_GATE_FLAG = 'story.gate.a2';
export const ACT1_CARD_SEEN_FLAG = 'codex.actEndingSeen';
/** v0.6 key (integration/actEndings.ts); a legacy save loads with both, the card writes both. */
export const ACT1_CARD_SEEN_FLAG_V06 = 'codex.actEnding.a1.seen';
export const ACT1_CAMP_SEEN_FLAG = 'story.d02.campSeen';
export const ACT1_CAMP_DIALOGUE = 'scene-act1-camp';
/** The camp's npc id: never a real NPC's, so a later `talk` objective cannot be credited by the scene. */
export const ACT1_CAMP_NPC = 'camp';
/** The quests whose completion ends the act. */
export const ACT1_ENDING_QUESTS: readonly string[] = ['m10', 'd02'];

export type Act1EndingPorts = ActEndingPorts;

/** The Act 1 director (the generic one with Act 1's constants). */
export class Act1Ending extends ActEndingDirector {
  constructor(ports: Act1EndingPorts) {
    super(
      {
        act: 1,
        endingId: ACT1_ENDING_ID,
        requires: ACT1_ENDING_QUESTS,
        gateFlag: ACT1_GATE_FLAG,
        cardSeenFlags: [ACT1_CARD_SEEN_FLAG_V06, ACT1_CARD_SEEN_FLAG],
        campDialogueId: ACT1_CAMP_DIALOGUE,
        campSeenFlag: ACT1_CAMP_SEEN_FLAG,
      },
      ports,
    );
  }
}
