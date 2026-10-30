// The act-ending director, one per act (contracts v0.6 item 7): sets the act's gate and emits `act.ended` live, re-derives
// on load, and runs the camp scene after the card. Act 1's rules, documented in act1Ending.ts, apply to every act.

export interface ActEndingDirectorDef {
  act: number;
  endingId: string;
  /** Quests whose completion ends the act. */
  requires: readonly string[];
  gateFlag: string;
  /** Any of these set means the card was seen. */
  cardSeenFlags: readonly string[];
  campDialogueId: string;
  campSeenFlag: string;
  /** Fade and move the party here before the camp (needs the `moveTo` port). */
  campAnchorId?: string;
}

export interface ActEndingPorts {
  questState(id: string): string;
  getFlag(key: string): unknown;
  setFlag(key: string, value: true): void;
  emitActEnded(e: { act: number; endingId: string }): void;
  /** True while any dialogue or HUD modal is open, or the ending card is waiting or showing. */
  busy(): boolean;
  /** True while hostiles are aggroed on the player, or the player is dead. */
  inCombat(): boolean;
  /** Starts the camp dialogue; false when refused (try again later). */
  startCamp(): boolean;
  /** Fades and moves the party to the anchor; resolves false when it could not. */
  moveTo?(anchorId: string): Promise<boolean> | boolean;
}

export class ActEndingDirector {
  /** The camp is owed and not running. */
  private campPending = false;
  /** The camp dialogue is open (started by us, not yet ended). */
  private campRunning = false;
  /** The move to the camp anchor is in flight, or done for this camp. */
  private moving = false;
  private moved = false;
  private warned = false;

  constructor(
    private readonly def: ActEndingDirectorDef,
    private readonly ports: ActEndingPorts,
  ) {}

  get pending(): boolean {
    return this.campPending;
  }

  get ended(): boolean {
    return this.ports.getFlag(this.def.gateFlag) === true;
  }

  private questsDone(): boolean {
    return this.def.requires.every((q) => this.ports.questState(q) === 'completed');
  }

  private seen(flag: string): boolean {
    return this.ports.getFlag(flag) === true;
  }

  /** `quest.completed`: the live transition. */
  onQuestCompleted(questId: string): void {
    if (!this.def.requires.includes(questId)) return;
    if (this.ended || !this.questsDone()) return;
    this.ports.setFlag(this.def.gateFlag, true);
    this.ports.emitActEnded({ act: this.def.act, endingId: this.def.endingId });
  }

  /** `hud.actEnding.closed`: the card is gone; the camp is owed. */
  onCardClosed(endingId: string): void {
    if (endingId !== this.def.endingId || !this.ended || this.seen(this.def.campSeenFlag)) return;
    this.campPending = true;
  }

  /** `save.loaded`: re-derives from the loaded flags. Starts nothing (the dialogue plugin closes dialogues on load). */
  onLoaded(): void {
    this.campRunning = false;
    this.campPending = false;
    this.moving = false;
    this.moved = false;
    if (!this.ended) {
      // Saved between the completion and the gate (or by an older build): the act did end. The HUD's gate watcher shows
      // the card; no `act.ended` (that event is the live moment only).
      if (this.questsDone()) this.ports.setFlag(this.def.gateFlag, true);
      return;
    }
    if (this.seen(this.def.campSeenFlag)) return;
    // Card seen: the camp is owed. A card the HUD re-shows on this load is marked seen before this handler runs (its
    // gate watcher goes first), so the tick also waits while the card is up (`busy`); its `closed` arms it again.
    if (this.def.cardSeenFlags.some((f) => this.seen(f))) this.campPending = true;
  }

  /** `dialogue.ended` for the camp: it ran to its end (campSeen set) or was cut short (re-armed). */
  onDialogueEnded(dialogueId: string): void {
    if (dialogueId !== this.def.campDialogueId || !this.campRunning) return;
    this.campRunning = false;
    if (!this.seen(this.def.campSeenFlag)) this.campPending = true;
  }

  /**
   * Rules tick: starts the owed camp once nothing is open (the ending card included, through `busy`) and no fight is on.
   */
  tick(): void {
    if (!this.campPending) return;
    if (this.seen(this.def.campSeenFlag)) {
      this.campPending = false;
      return;
    }
    const p = this.ports;
    if (this.moving) return;
    if (p.busy() || p.inCombat()) return;
    if (this.def.campAnchorId && !this.moved) {
      this.moveThenStart(this.def.campAnchorId);
      return;
    }
    if (!p.startCamp()) return;
    this.campPending = false;
    this.campRunning = true;
  }

  private moveThenStart(anchorId: string): void {
    const p = this.ports;
    this.moving = true;
    const done = (ok: boolean): void => {
      if (!this.moving) return; // a load cancelled the move
      this.moving = false;
      this.moved = true;
      if (!ok && !this.warned) {
        this.warned = true;
        console.warn(`act ending ${this.def.endingId}: could not move to ${anchorId}; the camp starts where the player stands`);
      }
    };
    if (!p.moveTo) return done(false);
    let r: Promise<boolean> | boolean;
    try {
      r = p.moveTo(anchorId);
    } catch {
      return done(false);
    }
    if (r instanceof Promise) r.then((ok) => done(ok === true), () => done(false));
    else done(r === true);
  }
}
