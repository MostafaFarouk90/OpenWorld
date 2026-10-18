import type { DocumentLike } from './dom';
import { defaultHudT } from './strings.en';
import { makeEl, safeRead, setShown, type HudWidgetView, type Translate } from './widget';

export interface BoltCounterSource {
  /** Thread 16's `pathfinder.ammo()`; null when the class is not the Pathfinder or the bolt item is not defined. */
  ammo?(): { count: number; max: number } | null | undefined;
  t?: Translate;
}

/** Bolt counter next to the stamina bar (top-left). Hidden when the reader is absent, null or malformed. */
export class BoltCounter implements HudWidgetView {
  readonly id = 'bolt-counter';
  readonly element;
  private readonly text;
  private shown = false;
  private last = '';

  constructor(doc: DocumentLike, private readonly source: BoltCounterSource = {}) {
    const t = source.t ?? defaultHudT;
    this.element = makeEl(doc, 'div', 'owg-bolts');
    this.element.setAttribute('aria-label', t('hud.bolts.label'));
    this.text = makeEl(doc, 'span', 'owg-bolts-text', this.element);
    setShown(this.element, false);
  }

  update(): void {
    const a = safeRead(this.source.ammo);
    const ok = !!a && typeof a === 'object' && Number.isFinite(a.count) && Number.isFinite(a.max) && a.max > 0;
    if (ok) {
      const key = `${Math.max(0, Math.floor(a.count))}|${Math.floor(a.max)}`;
      if (key !== this.last) {
        this.last = key;
        const [c, m] = key.split('|');
        this.text.textContent = `${c} / ${m}`;
      }
    }
    if (ok !== this.shown) {
      this.shown = ok;
      setShown(this.element, ok);
      if (!ok) this.last = '';
    }
  }

  get visible(): boolean {
    return this.shown;
  }

  dispose(): void {
    this.element.remove();
  }
}
