import type { DocumentLike } from '../dom';
import { barFraction } from '../StatusBars';
import { makeEl, pct, safeRead, setShown, type HudWidgetView, type Translate } from '../widget';
import { ACT3_HUD_STRINGS_EN } from './strings.en';
import { DIVE_TUNING } from '../../water/types';

/** Under this many seconds of breath the bar turns to its warning colour. */
export const BREATH_LOW_SECONDS = 10;

export interface BreathReading {
  state: string;
  /** Seconds of breath left while diving. */
  breath: number;
}

export interface BreathMeterSource {
  /** K7's `water` state and breath; undefined when the service is missing. Read every frame. */
  water?(): BreathReading | null | undefined;
  t?: Translate;
}

const defaultT: Translate = (key) => ACT3_HUD_STRINGS_EN[key] ?? key;

/**
 * Breath meter (top-left, under the mount bar), polled each frame like `MountStamina`: shown only while the water state is
 * `diving`, so it hides on surfacing, after a drowning return and after a load with no event wired.
 */
export class BreathMeter implements HudWidgetView {
  readonly id = 'breath-meter';
  readonly element;
  private readonly fill;
  private readonly label;
  private shown = false;
  private lastPct = -1;
  private low = false;

  constructor(doc: DocumentLike, private readonly source: BreathMeterSource = {}) {
    const t = source.t ?? defaultT;
    this.element = makeEl(doc, 'div', 'owg-breath');
    this.element.setAttribute('aria-label', t('act3.hud.breath'));
    // The label shares the row with the bar (a small caption to its left), so the thin bar is not a mystery.
    this.label = makeEl(doc, 'span', 'owg-breath-label', this.element);
    this.label.textContent = t('act3.hud.breath');
    const bar = makeEl(doc, 'div', 'owg-bar owg-bar-breath', this.element);
    this.fill = makeEl(doc, 'div', 'owg-bar-fill', bar);
    setShown(this.element, false);
  }

  update(): void {
    const w = safeRead(this.source.water);
    const ok = !!w && typeof w === 'object' && w.state === 'diving' && typeof w.breath === 'number' && Number.isFinite(w.breath);
    if (ok) {
      const p = Math.round(barFraction(w.breath, DIVE_TUNING.breathSeconds) * 10000) / 100;
      if (p !== this.lastPct) {
        this.lastPct = p;
        this.fill.style.width = pct(p / 100);
      }
      const low = w.breath < BREATH_LOW_SECONDS;
      if (low !== this.low) {
        this.low = low;
        this.element.className = low ? 'owg-breath owg-breath-low' : 'owg-breath';
      }
    }
    if (ok !== this.shown) {
      this.shown = ok;
      setShown(this.element, ok);
      if (!ok) {
        this.lastPct = -1;
        this.low = false;
        this.element.className = 'owg-breath';
      }
    }
  }

  get visible(): boolean {
    return this.shown;
  }

  dispose(): void {
    this.element.remove();
  }
}
