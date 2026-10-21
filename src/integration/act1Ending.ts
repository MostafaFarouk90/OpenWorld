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

export interface Act1EndingPorts {
  questState(id: string): string;
  getFlag(key: string): unknown;
  setFlag(key: string, value: true): void;
  emitActEnded(e: { act: 1; endingId: string }): void;
  /** True while any dialogue or HUD modal is open, or the ending card is waiting or showing. */
  busy(): boolean;
  /** True while hostiles are aggroed on the player, or the player is dead. */
  inCombat(): boolean;
  /** Starts the camp dialogue; false when refused (try again later). */
  startCamp(): boolean;
}

export class Act1Ending {
  /** The camp is owed and not running. */
  private campPending = false;
  /** The camp dialogue is open (started by us, not yet ended). */
  private campRunning = false;

  constructor(private readonly ports: Act1EndingPorts) {}

  get pending(): boolean {
    return this.campPending;
  }

  get ended(): boolean {
    return this.ports.getFlag(ACT1_GATE_FLAG) === true;
  }

  private questsDone(): boolean {
    return ACT1_ENDING_QUESTS.every((q) => this.ports.questState(q) === 'completed');
  }

  private seen(flag: string): boolean {
    return this.ports.getFlag(flag) === true;
  }

  /** `quest.completed`: the live transition. */
  onQuestCompleted(questId: string): void {
    if (!ACT1_ENDING_QUESTS.includes(questId)) return;
    if (this.ended || !this.questsDone()) return;
    this.ports.setFlag(ACT1_GATE_FLAG, true);
    this.ports.emitActEnded({ act: 1, endingId: ACT1_ENDING_ID });
  }

  /** `hud.actEnding.closed`: the card is gone; the camp is owed. */
  onCardClosed(endingId: string): void {
    if (endingId !== ACT1_ENDING_ID || !this.ended || this.seen(ACT1_CAMP_SEEN_FLAG)) return;
    this.campPending = true;
  }

  /** `save.loaded`: re-derives from the loaded flags. Starts nothing (the dialogue plugin closes dialogues on load). */
  onLoaded(): void {
    this.campRunning = false;
    this.campPending = false;
    if (!this.ended) {
      // Saved between the completion and the gate (or by an older build): the act did end. The HUD's gate watcher shows
      // the card; no `act.ended` (that event is the live moment only).
      if (this.questsDone()) this.ports.setFlag(ACT1_GATE_FLAG, true);
      return;
    }
    if (this.seen(ACT1_CAMP_SEEN_FLAG)) return;
    // Card seen: the camp is owed. A card the HUD re-shows on this load is marked seen before this handler runs (its
    // gate watcher goes first), so the tick also waits while the card is up (`busy`); its `closed` arms it again.
    if (this.seen(ACT1_CARD_SEEN_FLAG) || this.seen(ACT1_CARD_SEEN_FLAG_V06)) this.campPending = true;
  }

  /** `dialogue.ended` for the camp: it ran to its end (campSeen set) or was cut short (re-armed). */
  onDialogueEnded(dialogueId: string): void {
    if (dialogueId !== ACT1_CAMP_DIALOGUE || !this.campRunning) return;
    this.campRunning = false;
    if (!this.seen(ACT1_CAMP_SEEN_FLAG)) this.campPending = true;
  }

  /**
   * Rules tick: starts the owed camp once nothing is open (the ending card included, through `busy`) and no fight is on.
   */
  tick(): void {
    if (!this.campPending) return;
    if (this.seen(ACT1_CAMP_SEEN_FLAG)) {
      this.campPending = false;
      return;
    }
    const p = this.ports;
    if (p.busy() || p.inCombat()) return;
    if (!p.startCamp()) return;
    this.campPending = false;
    this.campRunning = true;
  }
}
