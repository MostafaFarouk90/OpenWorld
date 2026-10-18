import type { DocumentLike } from './dom';
import { defaultHudT } from './strings.en';
import { makeEl, safeRead, setShown, type HudWidgetView, type Translate } from './widget';

export interface ClassLabelSource {
  /** `classes.chosen()`: the label shows only when truthy (`current()` defaults to knight when unchosen). */
  chosen?(): unknown;
  current?(): string | null | undefined;
  /** `classes.kit(id)?.nameKey`. */
  nameKey?(id: string): string | null | undefined;
  /** `inventory.gold`, polled (no gold.changed event exists). */
  gold?(): number | null | undefined;
  t?: Translate;
}

export const GOLD_DISPLAY_MAX = 999_999_999;

/** Gold as shown: whole, never negative; huge values cap with a plus; non-finite is hidden (null). */
export function goldText(g: unknown): string | null {
  if (typeof g !== 'number' || !Number.isFinite(g)) return null;
  const n = Math.max(0, Math.floor(g));
  return n > GOLD_DISPLAY_MAX ? `${GOLD_DISPLAY_MAX}+` : String(n);
}

/** Class name label and gold readout (top-left, under the bars). Gold (coin) is not Ember, Burn or Embers. */
export class ClassLabel implements HudWidgetView {
  readonly id = 'class-label';
  readonly element;
  private readonly t: Translate;
  private readonly nameEl;
  private readonly goldRow;
  private readonly goldEl;
  private shownName = false;
  private shownGold = false;
  private shownAll = false;
  private lastName = '';
  private lastGold = -2;
  private lastClassId = '';
  private lastKey = '';
  private lastResolved = '';

  constructor(doc: DocumentLike, private readonly source: ClassLabelSource = {}) {
    this.t = source.t ?? defaultHudT;
    this.element = makeEl(doc, 'div', 'owg-classlabel');
    this.nameEl = makeEl(doc, 'div', 'owg-class-name', this.element);
    this.goldRow = makeEl(doc, 'div', 'owg-gold', this.element);
    makeEl(doc, 'span', 'owg-gold-icon', this.goldRow).setAttribute('aria-label', this.t('hud.gold.label'));
    this.goldEl = makeEl(doc, 'span', 'owg-gold-amount', this.goldRow);
    setShown(this.element, false);
    setShown(this.nameEl, false);
    setShown(this.goldRow, false);
  }

  private resolveName(): string | null {
    if (!safeRead(this.source.chosen)) return null;
    const id = safeRead(this.source.current);
    if (typeof id !== 'string' || !id) return null;
    let key: unknown;
    try {
      key = this.source.nameKey?.(id);
    } catch {
      key = undefined;
    }
    if (typeof key !== 'string' || !key) return id;
    if (id === this.lastClassId && key === this.lastKey) return this.lastResolved;
    const s = this.t(key);
    const resolved = typeof s === 'string' && s && s !== key && !s.startsWith('[[') ? s : id;
    this.lastClassId = id;
    this.lastKey = key;
    this.lastResolved = resolved;
    return resolved;
  }

  update(): void {
    const name = this.resolveName();
    const nameOn = name !== null;
    if (nameOn && name !== this.lastName) {
      this.lastName = name;
      this.nameEl.textContent = name;
    }
    if (nameOn !== this.shownName) {
      this.shownName = nameOn;
      setShown(this.nameEl, nameOn);
      if (!nameOn) this.lastName = '';
    }

    const rawGold = safeRead(this.source.gold);
    const goldOn = typeof rawGold === 'number' && Number.isFinite(rawGold);
    // Compare the clamped whole number; goldText formats only when it changed.
    const goldKey = goldOn ? Math.min(GOLD_DISPLAY_MAX + 1, Math.max(0, Math.floor(rawGold))) : -1;
    if (goldOn && goldKey !== this.lastGold) {
      this.lastGold = goldKey;
      this.goldEl.textContent = goldText(rawGold) ?? '';
    }
    if (goldOn !== this.shownGold) {
      this.shownGold = goldOn;
      setShown(this.goldRow, goldOn, 'flex');
      if (!goldOn) this.lastGold = -2;
    }

    const any = nameOn || goldOn;
    if (any !== this.shownAll) {
      this.shownAll = any;
      setShown(this.element, any);
    }
  }

  get visible(): boolean {
    return this.shownAll;
  }

  dispose(): void {
    this.element.remove();
  }
}
