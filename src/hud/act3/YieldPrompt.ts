import type { DocumentLike } from '../dom';
import { makeEl, safeRead, setShown, type HudWidgetView, type Translate } from '../widget';
import { ACT3_HUD_STRINGS_EN } from './strings.en';

/** Seconds the mercy key is held to yield. */
export const YIELD_HOLD_SECONDS = 1.0;

/** The part of K0's `trials` service the prompt reads. Generic: any trial started with `allowYield` works. */
export interface YieldTrials {
  canYield(): boolean;
  state(): { id: string } | null;
  yield(id: string): boolean;
}

export interface YieldPromptSource {
  trials?(): YieldTrials | undefined;
  /** True while the mercy key is down (gameplay input only). */
  mercyDown?(): boolean;
  /** True on the tick the mercy key went down. */
  mercyPressed?(): boolean;
  glyph?(): string;
  t?: Translate;
}

const defaultT: Translate = (key, p) => (ACT3_HUD_STRINGS_EN[key] ?? key).replace(/\{(\w+)\}/g, (m, k: string) => (p && k in p ? String(p[k]) : m));

/**
 * "Hold {key} to yield" with a hold ring. The prompt shows only while `trials.canYield()` is true, and that is also the
 * only condition under which the hold can call `trials.yield`, so Cael can never yield before the breaks the trial asked
 * for or outside a trial. K15 owns the hold (K6a owns only `canYield` and `yield`). `tick(dt)` runs on the fixed step;
 * `update()` draws. The hold starts on a fresh press, so a key already down when the prompt appears does nothing.
 */
export class YieldPrompt implements HudWidgetView {
  readonly id = 'yield-prompt';
  readonly element;
  private readonly text;
  readonly ring;
  private readonly t: Translate;
  private shown = false;
  private held = 0;
  private armed = false;
  private trialId: string | null = null;

  constructor(doc: DocumentLike, private readonly source: YieldPromptSource = {}) {
    this.t = source.t ?? defaultT;
    this.element = makeEl(doc, 'div', 'owg-yield');
    this.ring = makeEl(doc, 'div', 'owg-yield-ring', this.element);
    this.text = makeEl(doc, 'div', 'owg-yield-text', this.element);
    setShown(this.element, false);
  }

  /** The trial id the prompt is offering to yield, or null. */
  private offer(): { trials: YieldTrials; id: string } | null {
    const trials = safeRead(this.source.trials);
    if (!trials) return null;
    try {
      if (!trials.canYield()) return null;
      const id = trials.state()?.id;
      return id ? { trials, id } : null;
    } catch {
      return null;
    }
  }

  /** Fixed step: advances the hold, and yields once when it completes. */
  tick(dt: number): void {
    const o = this.offer();
    if (!o || o.id !== this.trialId) {
      this.held = 0;
      this.armed = false;
      this.trialId = o?.id ?? null;
    }
    if (!o) return;
    const down = safeRead(this.source.mercyDown) === true;
    if (!down) {
      this.held = 0;
      this.armed = false;
      return;
    }
    if (!this.armed) {
      if (safeRead(this.source.mercyPressed) !== true) return;
      this.armed = true;
    }
    if (!(dt > 0) || !Number.isFinite(dt)) return;
    this.held += dt;
    if (this.held + 1e-9 >= YIELD_HOLD_SECONDS) {
      this.held = 0;
      this.armed = false;
      try {
        o.trials.yield(o.id);
      } catch (err) {
        console.warn('YieldPrompt: yield failed', err);
      }
    }
  }

  /** Hold progress 0..1. */
  get progress(): number {
    return Math.min(1, this.held / YIELD_HOLD_SECONDS);
  }

  update(): void {
    const ok = this.offer() !== null;
    if (ok) {
      this.text.textContent = this.t('act3.hud.yield', { key: safeRead(this.source.glyph) ?? '?' });
      const deg = Math.round(this.progress * 360);
      this.ring.style.background = `conic-gradient(#f0d890 ${deg}deg, rgba(255,255,255,.15) 0deg)`;
    }
    if (ok !== this.shown) {
      this.shown = ok;
      setShown(this.element, ok, 'flex');
    }
  }

  get visible(): boolean {
    return this.shown;
  }

  dispose(): void {
    this.element.remove();
  }
}
