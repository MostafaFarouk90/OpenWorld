import { SHRINE_TUNING } from './tuning';

const R = SHRINE_TUNING.respec;

export interface RespecQuote {
  free: boolean;
  gold: number;
  canAfford: boolean;
}

export type RespecResult = { ok: true; refunded?: number } | { ok: false; reason: string };

/** What the shrine needs from thread 2's progression. Progression owns pricing, gold and the free flag. */
export interface RespecProgression {
  allowRespec(source: string): () => void;
  respecQuote(): RespecQuote;
  respec(): RespecResult;
}

/** Thread 8's dialog service. It never calls progression; `confirm` does. */
export interface RespecDialog {
  open(opts: { quote: RespecQuote; confirm: () => RespecResult; cancel: () => void }): boolean;
}

export interface RespecPorts {
  progression(): Partial<RespecProgression> | undefined;
  dialog(): RespecDialog | undefined;
  lit(): boolean;
  inCombat(): boolean;
  /** Seconds on a monotonic sim clock. */
  now(): number;
  distanceToLectern(): number;
  toast(key: string, params?: Record<string, string | number>): void;
}

/**
 * The shrine's respec: it holds `progression.allowRespec('shrine')` while a dialog (or the
 * press-F-again fallback) is open, shows `respecQuote()` and lets `confirm` call `respec()`.
 * Nothing here prices, charges or remembers a respec.
 */
export class RespecFlow {
  private release: (() => void) | null = null;
  private pendingUntil = 0;
  private mode: 'dialog' | 'armed' = 'armed';

  constructor(private readonly ports: RespecPorts) {}

  get open(): boolean {
    return this.release !== null;
  }

  interact(): 'refused' | 'dialog' | 'armed' | 'done' | 'failed' {
    const p = this.ports.progression();
    if (!this.ports.lit()) return 'refused';
    if (!p?.allowRespec || !p.respecQuote || !p.respec) {
      this.ports.toast('shrine.respec.unavailable');
      return 'refused';
    }
    if (this.ports.inCombat()) {
      this.ports.toast('shrine.respec.combat');
      return 'refused';
    }
    // The dialog owns its own buttons; a stray press does not confirm.
    if (this.release && this.mode === 'dialog') return 'dialog';
    // Second press of the fallback, inside the window.
    if (this.release && this.ports.now() <= this.pendingUntil) {
      const r = this.confirm();
      return r.ok ? 'done' : 'failed';
    }
    this.close();
    const quote = p.respecQuote();
    this.release = p.allowRespec('shrine');
    const dialog = this.ports.dialog();
    if (dialog && dialog.open({ quote, confirm: () => this.confirm(), cancel: () => this.close() })) {
      this.mode = 'dialog';
      return 'dialog';
    }
    this.mode = 'armed';
    this.pendingUntil = this.ports.now() + R.confirmSeconds;
    this.ports.toast(quote.free ? 'shrine.respec.confirmFree' : 'shrine.respec.confirmCost', { gold: quote.gold });
    return 'armed';
  }

  /** Cancels the fallback when the window passes or the player walks away. */
  update(): void {
    if (!this.release || this.mode === 'dialog') return;
    if (this.ports.now() > this.pendingUntil || this.ports.distanceToLectern() > R.radius + 1) this.close();
  }

  confirm(): RespecResult {
    const p = this.ports.progression();
    if (!this.release || !p?.respec) return { ok: false, reason: 'closed' };
    const r = p.respec();
    this.close();
    this.ports.toast(r.ok ? 'shrine.respec.done' : 'shrine.respec.refused', r.ok ? undefined : { reason: r.reason });
    return r;
  }

  close(): void {
    this.release?.();
    this.release = null;
    this.pendingUntil = 0;
  }
}
