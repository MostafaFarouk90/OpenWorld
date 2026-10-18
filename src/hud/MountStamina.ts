import type { DocumentLike } from './dom';
import { barFraction } from './StatusBars';
import { defaultHudT } from './strings.en';
import { makeEl, pct, safeRead, setShown, type HudWidgetView, type Translate } from './widget';

export interface MountStaminaSource {
  /** Thread 20's `mount.stamina()`; null when not mounted. Read every frame. */
  stamina?(): { value: number; max: number } | null | undefined;
  t?: Translate;
}

/** Mount stamina bar (top-left, under the Ember bar). Hidden when the reader is absent or null. */
export class MountStamina implements HudWidgetView {
  readonly id = 'mount-stamina';
  readonly element;
  private readonly fill;
  private shown = false;
  private lastPct = -1;

  constructor(doc: DocumentLike, private readonly source: MountStaminaSource = {}) {
    const t = source.t ?? defaultHudT;
    this.element = makeEl(doc, 'div', 'owg-mount');
    this.element.setAttribute('aria-label', t('hud.bar.mount'));
    const bar = makeEl(doc, 'div', 'owg-bar owg-bar-mount', this.element);
    this.fill = makeEl(doc, 'div', 'owg-bar-fill', bar);
    setShown(this.element, false);
  }

  update(): void {
    const s = safeRead(this.source.stamina);
    const ok = !!s && typeof s === 'object' && typeof s.value === 'number' && typeof s.max === 'number';
    if (ok) {
      const p = Math.round(barFraction(s.value, s.max) * 10000) / 100;
      if (p !== this.lastPct) {
        this.lastPct = p;
        this.fill.style.width = pct(p / 100);
      }
    }
    if (ok !== this.shown) {
      this.shown = ok;
      setShown(this.element, ok);
      if (!ok) this.lastPct = -1;
    }
  }

  get visible(): boolean {
    return this.shown;
  }

  dispose(): void {
    this.element.remove();
  }
}
