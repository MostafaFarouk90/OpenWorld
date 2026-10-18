import type { DocumentLike, ElementLike } from './dom';
import { defaultHudT } from './strings.en';
import { barFraction } from './StatusBars';
import { makeEl, type HudWidgetView, type Translate } from './widget';

export interface AbilitySlotInfo {
  skillId: string;
  nameKey: string;
  cooldown: { remaining: number; total: number };
  emberCost?: number;
  affordable: boolean;
}

export interface AbilityBarSource {
  /** Index 0..5; shorter arrays are padded with empty slots. */
  slots(): readonly (AbilitySlotInfo | null)[];
  /** Key or button label currently bound to an action such as 'ability1'. */
  glyph(action: string): string;
  t?: Translate;
}

export const ABILITY_SLOTS = 6;
export const SHAKE_MS = 300;

export function cooldownAngle(remaining: number, total: number): number {
  return Math.round(barFraction(remaining, total) * 360 * 100) / 100;
}

export function cooldownRing(remaining: number, total: number): string {
  const a = cooldownAngle(remaining, total);
  return `conic-gradient(rgba(0, 0, 0, 0.7) ${a}deg, transparent ${a}deg)`;
}

export class AbilityBar implements HudWidgetView {
  readonly id = 'ability-bar';
  readonly element;
  private readonly t: Translate;
  private readonly slotEls: { root: ElementLike; ring: ElementLike; glyph: ElementLike; cost: ElementLike }[] = [];
  private readonly shaking = new Set<number>();
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();

  constructor(
    doc: DocumentLike,
    private readonly source: AbilityBarSource,
  ) {
    this.t = source.t ?? defaultHudT;
    this.element = makeEl(doc, 'div', 'owg-abilities');
    for (let i = 0; i < ABILITY_SLOTS; i++) {
      const root = makeEl(doc, 'div', 'owg-slot owg-slot-empty', this.element);
      const ring = makeEl(doc, 'div', 'owg-slot-ring', root);
      const glyph = makeEl(doc, 'div', 'owg-slot-glyph', root);
      const cost = makeEl(doc, 'div', 'owg-slot-cost', root);
      this.slotEls.push({ root, ring, glyph, cost });
    }
    this.update();
  }

  /** Brief shake for a press on an empty slot. */
  shake(slot: number): void {
    if (!Number.isInteger(slot) || slot < 0 || slot >= ABILITY_SLOTS) return;
    this.shaking.add(slot);
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      this.shaking.delete(slot);
      this.update();
    }, SHAKE_MS);
    this.timers.add(timer);
    this.update();
  }

  update(): void {
    const slots = this.source.slots();
    this.slotEls.forEach((el, i) => {
      const s = slots[i] ?? null;
      const classes = ['owg-slot'];
      if (!s) classes.push('owg-slot-empty');
      else if (!s.affordable) classes.push('owg-slot-dim');
      if (this.shaking.has(i)) classes.push('owg-shake');
      el.root.className = classes.join(' ');
      el.root.setAttribute('title', s ? this.t(s.nameKey) : this.t('hud.slot.empty'));
      el.glyph.textContent = this.source.glyph(`ability${i + 1}`);
      el.ring.style.background = s ? cooldownRing(s.cooldown.remaining, s.cooldown.total) : 'none';
      el.cost.textContent = s?.emberCost ? this.t('hud.slot.cost', { cost: s.emberCost }) : null;
    });
  }

  dispose(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.shaking.clear();
    this.element.remove();
  }
}
