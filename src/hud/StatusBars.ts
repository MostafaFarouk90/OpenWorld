import type { DocumentLike } from './dom';
import { defaultHudT, } from './strings.en';
import { makeEl, pct, setShown, type HudWidgetView, type Translate } from './widget';

export type BurnZone = 'warm' | 'blaze' | 'cinder';

export interface StatusBarsSource {
  health(): number;
  maxHealth(): number;
  stamina(): number;
  maxStamina(): number;
  /** Max health before reductions (Burn, Scars); draws the lost part of the bar when above maxHealth. */
  baseMaxHealth?(): number;
  /** Absent or null: no Ember rules, so the Burn and Ember bars are hidden. */
  spells?(): { burn: number; ember: number; maxEmber: number } | null | undefined;
  /** Scars taken (polled: a load emits no `scar.added`). Absent or 0: the scar count is hidden. */
  scars?(): number | null | undefined;
  progress?(): { level: number; xp: number; xpToNext: number; maxed: boolean } | null | undefined;
  t?: Translate;
}

export const BURN_MAX = 100;

/** value/max clamped to 0..1; a non-positive, NaN or infinite max or a NaN value gives 0. */
export function barFraction(value: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0;
  return Math.min(1, Math.max(0, value / max));
}

export function burnZone(burn: number): BurnZone {
  const b = Number.isFinite(burn) ? burn : 0;
  if (b >= 75) return 'cinder';
  if (b >= 40) return 'blaze';
  return 'warm';
}

function shownNumber(n: number): number {
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

export class StatusBars implements HudWidgetView {
  readonly id = 'status-bars';
  readonly element;
  /** Max health as last drawn, so a reduced max is visible to tests and plugins. */
  maxHealthShown = 0;
  private readonly t: Translate;
  private readonly healthFill;
  private readonly healthLost;
  private readonly healthText;
  private readonly staminaFill;
  private readonly burnRow;
  private readonly burnFill;
  private readonly emberRow;
  private readonly emberFill;
  private readonly scarRow;
  private readonly scarText;
  private pulseTimer: ReturnType<typeof setTimeout> | null = null;
  private pulsing = false;
  private readonly xpRow;
  private readonly xpFill;
  private readonly xpLabel;

  constructor(
    doc: DocumentLike,
    private readonly source: StatusBarsSource,
  ) {
    this.t = source.t ?? defaultHudT;
    const root = (this.element = makeEl(doc, 'div', 'owg-status'));
    const bar = (cls: string, labelKey: string) => {
      const row = makeEl(doc, 'div', `owg-bar ${cls}`, root);
      row.setAttribute('title', this.t(labelKey));
      const fill = makeEl(doc, 'div', 'owg-bar-fill', row);
      return { row, fill };
    };
    const h = bar('owg-bar-health', 'hud.bar.health');
    this.healthFill = h.fill;
    this.healthLost = makeEl(doc, 'div', 'owg-bar-lost', h.row);
    this.healthText = makeEl(doc, 'div', 'owg-bar-text', h.row);
    this.staminaFill = bar('owg-bar-stamina', 'hud.bar.stamina').fill;
    const b = bar('owg-bar-burn owg-burn-warm', 'hud.bar.burn');
    this.burnRow = b.row;
    this.burnFill = b.fill;
    this.scarRow = makeEl(doc, 'div', 'owg-scar', root);
    this.scarRow.setAttribute('title', this.t('hud.scar.tip'));
    makeEl(doc, 'span', 'owg-scar-glyph', this.scarRow).textContent = '\u2726';
    this.scarText = makeEl(doc, 'span', 'owg-scar-count', this.scarRow);
    const e = bar('owg-bar-ember', 'hud.bar.ember');
    this.emberRow = e.row;
    this.emberFill = e.fill;
    const x = bar('owg-bar-xp', 'hud.bar.xp');
    this.xpRow = x.row;
    this.xpFill = x.fill;
    this.xpLabel = makeEl(doc, 'div', 'owg-bar-text', x.row);
    this.update();
  }

  update(): void {
    const s = this.source;
    const max = shownNumber(s.maxHealth());
    this.maxHealthShown = max;
    this.healthFill.style.width = pct(barFraction(s.health(), s.maxHealth()));
    this.healthText.textContent = `${Math.min(shownNumber(s.health()), max)}/${max}`;
    const base = s.baseMaxHealth?.() ?? max;
    this.healthLost.style.width = Number.isFinite(base) && base > max && base > 0 ? pct(1 - max / base) : '0%';
    this.staminaFill.style.width = pct(barFraction(s.stamina(), s.maxStamina()));

    const sp = s.spells?.() ?? null;
    setShown(this.burnRow, !!sp);
    setShown(this.emberRow, !!sp);
    if (sp) {
      this.burnFill.style.width = pct(barFraction(sp.burn, BURN_MAX));
      this.burnRow.className = `owg-bar owg-bar-burn owg-burn-${burnZone(sp.burn)}`;
      this.emberFill.style.width = pct(barFraction(sp.ember, sp.maxEmber));
    }

    const scars = shownNumber(s.scars?.() ?? 0);
    setShown(this.scarRow, scars > 0, 'flex');
    this.scarText.textContent = String(scars);
    this.scarRow.className = this.pulsing ? 'owg-scar owg-scar-pulse' : 'owg-scar';

    const pr = s.progress?.() ?? null;
    setShown(this.xpRow, !!pr);
    if (pr) {
      this.xpFill.style.width = pct(pr.maxed ? 1 : barFraction(pr.xp, pr.xpToNext));
      this.xpLabel.textContent = pr.maxed ? this.t('hud.max') : this.t('hud.level', { level: pr.level });
    }
  }

  /** One pulse of the scar count (on `scar.added`). */
  pulse(): void {
    if (this.pulseTimer) clearTimeout(this.pulseTimer);
    this.pulsing = true;
    this.scarRow.className = 'owg-scar owg-scar-pulse';
    this.pulseTimer = setTimeout(() => {
      this.pulseTimer = null;
      this.pulsing = false;
      this.scarRow.className = 'owg-scar';
    }, 600);
  }

  dispose(): void {
    if (this.pulseTimer) clearTimeout(this.pulseTimer);
    this.pulseTimer = null;
    this.element.remove();
  }
}
