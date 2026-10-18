import { SHRINE_TUNING } from './tuning';

const R = SHRINE_TUNING.respec;
const PERMIT = 'lectern';

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

export interface RespecOption {
  id: string;
  label: string;
}

/**
 * Thread 8's `respecModal` service. It never calls progression; `confirm` does. With `options` (Phase B) it lists
 * them, shows `quoteFor(id)` for the highlighted one and passes the chosen id to `confirm`.
 */
export interface RespecDialog {
  open(opts: {
    quote: RespecQuote;
    options?: readonly RespecOption[];
    quoteFor?: (id: string) => RespecQuote;
    confirm: (id?: string) => RespecResult;
    cancel: () => void;
  }): boolean;
}

/** What the lectern needs from thread 12's `classes` service. */
export type ClassQuote = { ok: true; free: boolean; gold: number; canAfford: boolean } | { ok: false; reason: string };
export interface RespecClasses {
  chosen(): boolean;
  current(): string;
  changeQuote(id: string): ClassQuote;
  change(id: string): { ok: true } | { ok: false; reason: string };
}

export interface RespecPorts {
  progression(): Partial<RespecProgression> | undefined;
  dialog(): RespecDialog | undefined;
  /** Thread 12's service; undefined before it merges. Class change is offered only once a class is chosen. */
  classes?(): RespecClasses | undefined;
  classIds?(): readonly string[];
  className?(id: string): string;
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
    // The dialog owns its own buttons; a stray press does not confirm. (If it was dismissed without
    // telling us, `dialogClosed()` has already dropped the permit.)
    if (this.release && this.mode === 'dialog') return 'dialog';
    // Second press of the fallback, inside the window.
    if (this.release && this.ports.now() <= this.pendingUntil) {
      const r = this.confirm();
      return r.ok ? 'done' : 'failed';
    }
    this.close();
    const quote = p.respecQuote();
    this.release = p.allowRespec(PERMIT);
    const dialog = this.ports.dialog();
    let opened = false;
    try {
      opened = !!dialog?.open({ quote, ...this.classOptions(quote), confirm: (id) => this.confirm(id), cancel: () => this.close() });
    } catch {
      opened = false;
    }
    if (opened) {
      this.mode = 'dialog';
      return 'dialog';
    }
    this.mode = 'armed';
    this.pendingUntil = this.ports.now() + R.confirmSeconds;
    this.ports.toast(quote.free ? 'shrine.respec.confirmFree' : 'shrine.respec.confirmCost', { gold: quote.gold });
    return 'armed';
  }

  /** The dialog's modal closed or the player died: drop the permit if it was a dialog session. */
  dialogClosed(): void {
    if (this.mode === 'dialog') this.close();
  }

  /** Cancels the fallback when the window passes or the player walks away. */
  update(): void {
    if (!this.release || this.mode === 'dialog') return;
    if (this.ports.now() > this.pendingUntil || this.ports.distanceToLectern() > R.radius + 1) this.close();
  }

  /**
   * `id` is the class picked in the dialog: another class is a class change (`classes.change`, which respecs
   * through progression and starts no drill); the current class, or no id, is the plain skill respec.
   */
  confirm(id?: string): RespecResult {
    const p = this.ports.progression();
    const classes = this.ports.classes?.();
    if (!this.release || !p?.respec) return { ok: false, reason: 'closed' };
    const change = classes && id !== undefined && classes.chosen() && id !== classes.current();
    const r = change ? classes.change(id) : p.respec();
    this.close();
    if (r.ok) this.ports.toast(change ? 'shrine.class.done' : 'shrine.respec.done', change ? { name: this.ports.className?.(id) ?? id } : undefined);
    else this.ports.toast('shrine.respec.refused', { reason: r.reason });
    return r;
  }

  /** The five classes with the highlighted one's quote, once a class has been chosen; otherwise nothing. */
  private classOptions(plain: RespecQuote): { options?: RespecOption[]; quoteFor?: (id: string) => RespecQuote } {
    const classes = this.ports.classes?.();
    const ids = this.ports.classIds?.();
    if (!classes?.chosen() || !ids?.length) return {};
    const current = classes.current();
    return {
      options: ids.map((id) => ({ id, label: this.ports.className?.(id) ?? id })),
      quoteFor: (id) => {
        if (id === current) return plain;
        const q = classes.changeQuote(id);
        return q.ok ? { free: q.free, gold: q.gold, canAfford: q.canAfford } : { free: false, gold: 0, canAfford: false };
      },
    };
  }

  close(): void {
    this.release?.();
    this.release = null;
    this.pendingUntil = 0;
    this.mode = 'armed';
  }
}
