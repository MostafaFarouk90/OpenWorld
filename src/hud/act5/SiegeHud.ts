import type { DocumentLike, ElementLike } from '../dom';
import { makeEl, pct, setShown, type HudWidgetView, type Translate } from '../widget';
import type { SiegeModel, SiegeView } from './siegeModel';

export interface SiegeHudSource {
  model: SiegeModel;
  t: Translate;
  /** Called each update before the view is read (polls N4's `siege` service for ram stalls). */
  poll?(): void;
}

/** The siege HUD (plans/act5-N9.md section 1): gate bar, ram bars, wave counter, ally chips, order and line-broken flashes. */
export class SiegeHud implements HudWidgetView {
  readonly id = 'siege-hud';
  readonly element: ElementLike;
  private readonly wave: ElementLike;
  private readonly gateFill: ElementLike;
  private readonly gateRow: ElementLike;
  private readonly gateText: ElementLike;
  private readonly rams: ElementLike;
  private readonly chips: ElementLike;
  private readonly flash: ElementLike;
  private readonly line: ElementLike;
  last: SiegeView | null = null;

  constructor(
    private readonly doc: DocumentLike,
    private readonly src: SiegeHudSource,
  ) {
    this.element = makeEl(doc, 'div', 'owg-siege');
    this.wave = makeEl(doc, 'div', 'owg-siege-wave', this.element);
    this.gateRow = makeEl(doc, 'div', 'owg-siege-gate', this.element);
    this.gateText = makeEl(doc, 'div', 'owg-siege-gate-text', this.gateRow);
    const bar = makeEl(doc, 'div', 'owg-bar owg-siege-bar', this.gateRow);
    this.gateFill = makeEl(doc, 'div', 'owg-bar-fill owg-siege-fill', bar);
    this.rams = makeEl(doc, 'div', 'owg-siege-rams', this.element);
    this.chips = makeEl(doc, 'div', 'owg-siege-chips', this.element);
    this.flash = makeEl(doc, 'div', 'owg-siege-flash', this.element);
    this.line = makeEl(doc, 'div', 'owg-siege-line', this.element);
    setShown(this.element, false);
  }

  update(frameTime = 0): void {
    try {
      this.src.poll?.();
    } catch {
      /* a soft reader: a failing service shows no stall */
    }
    this.src.model.tick(frameTime);
    const v = this.src.model.view();
    this.last = v;
    setShown(this.element, v !== null);
    if (!v) return;
    const t = this.src.t;
    this.wave.textContent = v.between
      ? t('hud.siege.waveCleared', { n: v.wave })
      : v.waves
        ? t('hud.siege.wave', { n: v.wave, total: v.waves })
        : t('hud.siege.waveOnly', { n: v.wave });
    this.gateText.textContent = v.breached ? t('hud.siege.breached') : t('hud.siege.gate', { pct: Math.round(v.gatePct) });
    this.gateFill.style.width = pct(v.gatePct / 100);
    this.gateRow.className = `owg-siege-gate ${v.breached ? 'owg-siege-breached' : v.gatePct < 25 ? 'owg-siege-low' : v.gatePct < 50 ? 'owg-siege-warn' : ''}`;
    this.rams.replaceChildren(
      ...v.rams.map((r) => {
        const row = makeEl(this.doc, 'div', 'owg-siege-ram');
        makeEl(this.doc, 'span', 'owg-siege-ram-name', row).textContent = r.stalled > 0 ? t('hud.siege.ramStalled', { s: Math.ceil(r.stalled) }) : t('hud.siege.ram');
        const bar = makeEl(this.doc, 'div', 'owg-bar owg-siege-ram-bar', row);
        makeEl(this.doc, 'div', 'owg-bar-fill', bar).style.width = pct(r.fill);
        return row;
      }),
    );
    const chips = v.chips.map((id) => {
      const c = makeEl(this.doc, 'span', 'owg-siege-chip');
      c.textContent = t(`hud.siege.ally.${id}`);
      return c;
    });
    if (v.chipsMore > 0) {
      const more = makeEl(this.doc, 'span', 'owg-siege-chip owg-siege-more');
      more.textContent = t('hud.siege.more', { n: v.chipsMore });
      chips.push(more);
    }
    this.chips.replaceChildren(...chips);
    this.flash.textContent = v.flash ? t(v.flash.textKey, v.flash.params) : '';
    this.line.textContent = v.lineBroken ? t('hud.siege.lineBroken') : '';
  }

  dispose(): void {
    this.element.remove();
  }
}
