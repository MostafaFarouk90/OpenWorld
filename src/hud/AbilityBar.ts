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

/** The Surge Leap key cap. Null or absent: not learned, hidden. Burn never blocks it; `warn` is the amber Scar warning (Burn 75+). */
export interface LeapInfo {
  cooldown: { remaining: number; total: number };
  warn: boolean;
}

export interface AbilityBarSource {
  leap?(): LeapInfo | null | undefined;
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
  private readonly leapEl: { root: ElementLike; ring: ElementLike; glyph: ElementLike };
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
    const leapRoot = makeEl(doc, 'div', 'owg-leap', this.element);
    leapRoot.style.display = 'none';
    this.leapEl = {
      root: leapRoot,
      ring: makeEl(doc, 'div', 'owg-leap-ring', leapRoot),
      glyph: makeEl(doc, 'div', 'owg-leap-glyph', leapRoot),
    };
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
    this.updateLeap();
  }

  private updateLeap(): void {
    const leap = this.source.leap?.() ?? null;
    const el = this.leapEl;
    el.root.style.display = leap ? 'block' : 'none';
    if (!leap) return;
    el.root.className = leap.warn ? 'owg-leap owg-leap-warn' : 'owg-leap';
    el.root.setAttribute('title', this.t('hud.leap.name'));
    el.glyph.textContent = this.source.glyph('surgeLeap');
    el.ring.style.background = cooldownRing(leap.cooldown.remaining, leap.cooldown.total);
  }

  dispose(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.shaking.clear();
    this.element.remove();
  }
}

export const LEAP_FALLBACK_SECONDS = 4;
export const LEAP_WARN_BURN = 75;

export interface LeapStateDeps {
  /** `ctx.gates.flag('ability.surge-leap.learned')`, kept by the caller so it survives a load. */
  learned(): boolean;
  /** `spells.leap.cooldown()`; absent or throwing: the local timer is used. */
  cooldown?(): { remaining: number; total: number } | null | undefined;
  /** `spells.burn`; absent counts as 0. Burn never blocks the Leap, it only tints the key cap amber. */
  burn?(): number | undefined;
}

/** What the Leap key cap shows: the service's cooldown, else a 4 s local timer started on `player.leap` start. */
export class LeapState {
  private left = 0;

  constructor(private readonly deps: LeapStateDeps) {}

  onLeap(phase: string): void {
    if (phase === 'start') this.left = LEAP_FALLBACK_SECONDS;
    else if (phase === 'cancel') this.left = 0;
  }

  tick(dt: number): void {
    if (this.left > 0 && Number.isFinite(dt) && dt > 0) this.left = Math.max(0, this.left - dt);
  }

  info(): LeapInfo | null {
    if (!this.deps.learned()) return null;
    let cooldown = { remaining: this.left, total: LEAP_FALLBACK_SECONDS };
    try {
      const c = this.deps.cooldown?.();
      if (c && Number.isFinite(c.remaining) && Number.isFinite(c.total)) cooldown = c;
    } catch {
      /* local timer */
    }
    const burn = this.deps.burn?.();
    return { cooldown, warn: typeof burn === 'number' && burn >= LEAP_WARN_BURN };
  }
}
