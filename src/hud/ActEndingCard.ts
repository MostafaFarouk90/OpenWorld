import type { DocumentLike, ElementLike } from './dom';
import type { KeyLike, KeySource } from './ActContinuesCard';
import { defaultHudT } from './strings.en';
import { makeEl, setShown, type HudWidgetView, type Translate } from './widget';

export const ACT_ENDING_ID = 'smoke-over-harrowmark';
export const ACT_ENDING_SEEN_FLAG = 'codex.actEndingSeen';
export const ACT_ENDING_CAMP_FLAG = 'story.act1.campSeen';
/** Thread 6 may ship the camp-seen flag under either name; either one means the camp scene already ran. */
export const ACT_ENDING_CAMP_FLAGS: readonly string[] = [ACT_ENDING_CAMP_FLAG, 'story.d02.campSeen'];
export const ACT_ENDING_GATE_FLAG = 'story.gate.a2';
/** Seconds after the card appears before a key can dismiss it (a key held while playing must not). */
export const ACT_ENDING_ARM_SECONDS = 0.5;
/** Most recap lines drawn. */
export const ACT_ENDING_MAX_LINES = 12;

/**
 * Where the journal plugin plugs the recap in later (`buildRecap` lines) without this plugin importing it.
 * Absent or throwing gives an empty body.
 */
export const endingOptions: { recap?: () => readonly string[] } = {};

export interface ActEndingSource {
  t?: Translate;
  keys?: KeySource | null;
  /** True while any HUD modal is open: the card hides and comes back after. */
  modalOpen?(): boolean;
  /** `codex.actEndingSeen`. */
  seen?(): boolean;
  /** `story.act1.campSeen` or `story.d02.campSeen`. */
  campSeen?(): boolean;
  /** Sets `codex.actEndingSeen` (called once, when the card is first shown). */
  markSeen?(): void;
  /** Dismissed by the player: emit `hud.actEnding.closed`. */
  closed?(endingId: string): void;
  recap?(): readonly string[] | null | undefined;
}

/** "Smoke Over Harrowmark" mini-ending card (center). No auto-dismiss: a fresh key or a click closes it. */
export class ActEndingCard implements HudWidgetView {
  readonly id = 'act-ending-card';
  readonly element;
  private readonly t: Translate;
  private readonly body: ElementLike;
  private pending: string | null = null;
  private shown = false;
  private age = 0;
  private listening = false;
  private readonly onKey = (e?: KeyLike) => {
    if (!this.shown || e?.repeat || this.age < ACT_ENDING_ARM_SECONDS) return;
    // Escape belongs to the pause menu: it never closes the card (no hud.actEnding.closed).
    if (e?.key === 'Escape' || e?.code === 'Escape') return;
    this.dismiss();
  };

  constructor(private readonly doc: DocumentLike, private readonly source: ActEndingSource = {}) {
    this.t = source.t ?? defaultHudT;
    this.element = makeEl(doc, 'div', 'owg-card owg-ending');
    makeEl(doc, 'h2', 'owg-card-title', this.element).textContent = this.t('hud.ending.title');
    this.body = makeEl(doc, 'div', 'owg-card-body owg-ending-body', this.element);
    makeEl(doc, 'div', 'owg-card-hint', this.element).textContent = this.t('hud.ending.hint');
    this.element.onclick = () => {
      if (this.shown) this.dismiss();
    };
    setShown(this.element, false);
  }

  /** True while the card is on screen. */
  get visible(): boolean {
    return this.shown;
  }

  /** True while an ending is waiting or showing (a modal can hide a pending card). */
  get active(): boolean {
    return this.pending !== null;
  }

  /** `act.ended`: only Act 1's ending shows, and only once (`codex.actEndingSeen`). */
  onActEnded(e: { act: number; endingId: string } | null | undefined): void {
    if (!e || e.act !== 1 || e.endingId !== ACT_ENDING_ID) return;
    if (this.safe(this.source.seen)) return;
    this.request(e.endingId);
  }

  /** `save.loaded`: the loaded save's once-flags win; a card waiting or showing is hidden if the ending was seen. */
  onLoaded(): void {
    if (this.pending === null) return;
    if (this.safe(this.source.seen) || this.safe(this.source.campSeen)) this.hide(true);
  }

  /** `ctx.gates.flag('story.gate.a2')`: a load with the gate set re-derives the card; the gate falling hides it. */
  onGate(open: boolean): void {
    if (!open) {
      this.hide(true);
      return;
    }
    if (this.pending !== null) return;
    if (this.safe(this.source.seen) || this.safe(this.source.campSeen)) return;
    this.request(ACT_ENDING_ID);
  }

  dismiss(): void {
    const id = this.pending;
    if (id === null) return;
    this.hide(true);
    try {
      this.source.closed?.(id);
    } catch (err) {
      console.warn('ActEndingCard: closed callback failed', err);
    }
  }

  update(dt = 0): void {
    if (this.pending === null) return;
    const blocked = this.safe(this.source.modalOpen);
    if (blocked) {
      if (this.shown) this.display(false);
      return;
    }
    if (!this.shown) this.display(true);
    else if (Number.isFinite(dt) && dt > 0) this.age += dt;
  }

  dispose(): void {
    this.unlisten();
    this.element.remove();
  }

  private request(endingId: string): void {
    if (this.pending !== null) return; // already showing or waiting for a modal to close
    this.pending = endingId;
    if (!this.safe(this.source.modalOpen)) this.display(true);
  }

  private display(on: boolean): void {
    if (on === this.shown) return;
    this.shown = on;
    setShown(this.element, on);
    if (on) {
      this.age = 0;
      this.renderBody();
      if (this.source.keys && !this.listening) {
        this.source.keys.addEventListener('keydown', this.onKey);
        this.listening = true;
      }
      // Set when shown, not when dismissed: quitting mid-card never replays it forever.
      try {
        this.source.markSeen?.();
      } catch (err) {
        console.warn('ActEndingCard: markSeen failed', err);
      }
    } else {
      this.unlisten();
    }
  }

  private hide(clearPending: boolean): void {
    this.display(false);
    if (clearPending) this.pending = null;
  }

  private renderBody(): void {
    let lines: readonly string[] = [];
    try {
      lines = (this.source.recap ?? endingOptions.recap)?.() ?? [];
    } catch {
      lines = [];
    }
    const els: ElementLike[] = [];
    for (const line of lines) {
      if (typeof line !== 'string' || !line || els.length >= ACT_ENDING_MAX_LINES) continue;
      const el = this.doc.createElement('div');
      el.className = 'owg-ending-line';
      el.textContent = line;
      els.push(el);
    }
    this.body.replaceChildren(...els);
  }

  private safe(fn: (() => boolean) | undefined): boolean {
    try {
      return fn?.() === true;
    } catch {
      return false;
    }
  }

  private unlisten(): void {
    if (this.listening) this.source.keys?.removeEventListener('keydown', this.onKey);
    this.listening = false;
  }
}
