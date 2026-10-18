import type { DocumentLike } from './dom';
import { defaultHudT } from './strings.en';
import { barFraction } from './StatusBars';
import { makeEl, type HudWidgetView, type Translate } from './widget';

export interface BuffInfo {
  id: string;
  nameKey: string;
  remaining: number;
  total: number;
}

export interface BuffBarSource {
  buffs(): readonly BuffInfo[];
  t?: Translate;
}

/** Buffs still running (remaining is a positive finite number). */
export function activeBuffs(buffs: readonly BuffInfo[]): BuffInfo[] {
  return buffs.filter((b) => Number.isFinite(b.remaining) && b.remaining > 0);
}

export function buffFraction(b: Pick<BuffInfo, 'remaining' | 'total'>): number {
  return barFraction(b.remaining, b.total);
}

export function buffRing(fraction: number): string {
  const deg = Math.round(fraction * 360 * 100) / 100;
  return `conic-gradient(var(--owg-ring, #e8b04a) ${deg}deg, transparent ${deg}deg)`;
}

export class BuffBar implements HudWidgetView {
  readonly id = 'buff-bar';
  readonly element;
  private readonly t: Translate;

  constructor(
    private readonly doc: DocumentLike,
    private readonly source: BuffBarSource,
  ) {
    this.t = source.t ?? defaultHudT;
    this.element = makeEl(doc, 'div', 'owg-buffs');
    this.element.setAttribute('aria-label', this.t('hud.buffs.label'));
    this.update();
  }

  update(): void {
    const nodes = activeBuffs(this.source.buffs()).map((b) => {
      const el = makeEl(this.doc, 'div', 'owg-buff');
      el.setAttribute('data-buff', b.id);
      el.setAttribute('title', this.t(b.nameKey));
      const ring = makeEl(this.doc, 'div', 'owg-buff-ring', el);
      ring.style.background = buffRing(buffFraction(b));
      const secs = makeEl(this.doc, 'div', 'owg-buff-time', el);
      secs.textContent = `${Math.ceil(b.remaining)}s`;
      return el;
    });
    this.element.replaceChildren(...nodes);
  }

  dispose(): void {
    this.element.remove();
  }
}
