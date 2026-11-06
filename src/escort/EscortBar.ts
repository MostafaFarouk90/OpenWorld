// Act 4 L4 (plans/act4-L4.md section 1.5): the escort bar, top-centre under the boss bar: the escort's name, one pip per
// member (hollow while it kneels) and, for R24, the cart's health. Polls the `escorts` view each update; hidden when no
// escort runs (so a load needs nothing special).
import type { DocumentLike, ElementLike } from '../hud/dom';
import { makeEl, pct, setShown, type HudWidgetView } from '../hud/widget';
import type { EscortView } from './EscortEngine';

export const ESCORT_BAR_CSS = `
.owg-escort-bar { margin-top: 6px; text-align: center; font: 12px/1.3 serif; color: #efe6d2; text-shadow: 0 1px 2px #000; }
.owg-escort-pips { display: flex; gap: 4px; justify-content: center; margin-top: 3px; }
.owg-escort-pip { width: 9px; height: 9px; border-radius: 50%; background: #d9b23a; border: 1px solid #2a2016; }
.owg-escort-pip.down { background: transparent; border-color: #d9b23a; }
.owg-escort-cart { width: 180px; height: 6px; margin: 4px auto 0; background: #2a2016; border: 1px solid #000; }
.owg-escort-cart-fill { height: 100%; background: #b88a4a; }
`;

export class EscortBar implements HudWidgetView {
  readonly id = 'escort-bar';
  readonly element: ElementLike;
  private readonly title: ElementLike;
  private readonly pips: ElementLike;
  private readonly cartRow: ElementLike;
  private readonly cartFill: ElementLike;
  private shownKey = '';

  constructor(
    private readonly doc: DocumentLike,
    private readonly read: () => EscortView | null,
    private readonly t: (key: string) => string,
  ) {
    this.element = makeEl(doc, 'div', 'owg-escort-bar');
    this.title = makeEl(doc, 'div', 'owg-escort-title', this.element);
    this.pips = makeEl(doc, 'div', 'owg-escort-pips', this.element);
    this.cartRow = makeEl(doc, 'div', 'owg-escort-cart', this.element);
    this.cartFill = makeEl(doc, 'div', 'owg-escort-cart-fill', this.cartRow);
    setShown(this.element, false);
  }

  /** What it shows now, for tests: null when hidden. */
  snapshot(): { title: string; pips: boolean[]; cart: number | null } | null {
    let v: EscortView | null = null;
    try {
      v = this.read();
    } catch {
      v = null;
    }
    if (!v) return null;
    return { title: this.t(v.nameKey ?? 'hud.escort.title'), pips: v.members.map((m) => !m.kneeling), cart: v.cart ? v.cart.health / v.cart.max : null };
  }

  update(): void {
    const s = this.snapshot();
    setShown(this.element, !!s);
    if (!s) {
      this.shownKey = '';
      return;
    }
    const key = `${s.title}|${s.pips.join(',')}`;
    if (key !== this.shownKey) {
      this.shownKey = key;
      this.title.textContent = s.title;
      this.pips.replaceChildren(...s.pips.map((up) => makeEl(this.doc, 'span', up ? 'owg-escort-pip' : 'owg-escort-pip down')));
    }
    setShown(this.cartRow, s.cart !== null);
    if (s.cart !== null) this.cartFill.style.width = pct(Math.max(0, Math.min(1, s.cart)));
  }

  dispose(): void {
    this.element.remove();
  }
}
