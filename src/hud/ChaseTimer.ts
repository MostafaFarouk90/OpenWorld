import type { DocumentLike } from './dom';
import { makeEl, pct, safeRead, setShown, type HudWidgetView, type Translate } from './widget';
import { defaultHudT } from './strings.en';

export type ChasePhase = 'running' | 'again';

export interface ChaseReading {
  remaining: number;
  total: number;
  /** Metres to the courier. */
  gap: number;
  phase: ChasePhase;
}

export interface ChaseTimerSource {
  /** Thread 18's `chase.timer()`; null when no chase runs. Read every frame. */
  timer?(): ChaseReading | null | undefined;
  t?: Translate;
}

/** Seconds under which the running timer turns red (strictly under). */
export const CHASE_RED_SECONDS = 15;

/** Chase timer (top-center): bar plus seconds, a gap chevron, a pulsing "again" style. */
export class ChaseTimer implements HudWidgetView {
  readonly id = 'chase-timer';
  readonly element;
  private readonly t: Translate;
  private readonly fill;
  private readonly secs;
  private readonly gapEl;
  private shown = false;
  private lastClass = '';
  // Numeric keys: strings are formatted only when one changes, so a steady frame allocates nothing.
  private lastPct = -1;
  private lastSecs = -2;
  private lastGap = -2;
  private gapShown = true;

  constructor(doc: DocumentLike, private readonly source: ChaseTimerSource = {}) {
    this.t = source.t ?? defaultHudT;
    this.element = makeEl(doc, 'div', 'owg-chase');
    const bar = makeEl(doc, 'div', 'owg-chase-bar', this.element);
    this.fill = makeEl(doc, 'div', 'owg-chase-fill', bar);
    this.secs = makeEl(doc, 'span', 'owg-chase-secs', this.element);
    this.gapEl = makeEl(doc, 'span', 'owg-chase-gap', this.element);
    setShown(this.element, false);
  }

  update(): void {
    const r = safeRead(this.source.timer);
    const ok = !!r && typeof r === 'object' && typeof r.remaining === 'number' && Number.isFinite(r.remaining) && typeof r.total === 'number' && Number.isFinite(r.total) && r.total > 0;
    if (!ok) {
      if (this.shown) {
        this.shown = false;
        setShown(this.element, false);
        this.lastClass = '';
        this.lastPct = -1;
        this.lastSecs = this.lastGap = -2;
        this.gapShown = true;
      }
      return;
    }
    const remaining = Math.max(0, r.remaining);
    const again = r.phase === 'again';
    const cls = again ? 'owg-chase owg-chase-again' : remaining < CHASE_RED_SECONDS ? 'owg-chase owg-chase-red' : 'owg-chase';
    if (cls !== this.lastClass) {
      this.lastClass = cls;
      this.element.className = cls;
    }
    const pctNum = Math.round(Math.min(1, remaining / r.total) * 10000) / 100;
    if (pctNum !== this.lastPct) {
      this.lastPct = pctNum;
      this.fill.style.width = pct(pctNum / 100);
    }
    const secsKey = again ? -1 : Math.ceil(remaining);
    if (secsKey !== this.lastSecs) {
      this.lastSecs = secsKey;
      this.secs.textContent = again ? this.t('hud.chase.again') : this.t('hud.chase.seconds', { seconds: secsKey });
    }
    const gapOk = typeof r.gap === 'number' && Number.isFinite(r.gap) && r.gap >= 0;
    const gapKey = gapOk ? Math.round(r.gap) : -1;
    if (gapKey !== this.lastGap) {
      this.lastGap = gapKey;
      this.gapEl.textContent = gapOk ? this.t('hud.chase.gap', { metres: gapKey }) : '';
    }
    if (gapOk !== this.gapShown) {
      this.gapShown = gapOk;
      setShown(this.gapEl, gapOk, 'inline');
    }
    if (!this.shown) {
      this.shown = true;
      setShown(this.element, true, 'flex');
    }
  }

  get visible(): boolean {
    return this.shown;
  }

  dispose(): void {
    this.element.remove();
  }
}
