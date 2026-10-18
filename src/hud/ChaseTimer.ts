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
  private lastWidth = '';
  private lastSecs = '';
  private lastGap = '';
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
        this.lastClass = this.lastWidth = this.lastSecs = this.lastGap = '';
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
    const width = pct(Math.min(1, remaining / r.total));
    if (width !== this.lastWidth) {
      this.lastWidth = width;
      this.fill.style.width = width;
    }
    const secs = again ? this.t('hud.chase.again') : this.t('hud.chase.seconds', { seconds: Math.ceil(remaining) });
    if (secs !== this.lastSecs) {
      this.lastSecs = secs;
      this.secs.textContent = secs;
    }
    const gapOk = typeof r.gap === 'number' && Number.isFinite(r.gap) && r.gap >= 0;
    const gap = gapOk ? this.t('hud.chase.gap', { metres: Math.round(r.gap) }) : '';
    if (gap !== this.lastGap) {
      this.lastGap = gap;
      this.gapEl.textContent = gap;
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
