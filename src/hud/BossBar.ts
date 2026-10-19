import type { DocumentLike, ElementLike } from './dom';
import { defaultHudT } from './strings.en';
import { barFraction } from './StatusBars';
import { makeEl, pct, setShown, type HudWidgetView, type Translate } from './widget';

/** The slice of core's `BossState` the bar reads. */
export interface BossView {
  bossId: string;
  nameKey: string;
  health: number;
  maxHealth: number;
  phase: number;
  phases: number;
  breaks: number;
  breaksPerPhase: number;
  shield: boolean;
  releaseOpen: boolean;
  outcome: string | null;
}

export interface BossBarSource {
  /** `ctx.bosses.active()`; absent: nothing is read at setup. */
  active?(): readonly string[];
  /** `ctx.bosses.state(id)`; absent or null: the boss is unknown (nothing shown for it). */
  state?(bossId: string): BossView | null | undefined;
  t?: Translate;
  /** Called when the bar goes from hidden to shown or back, so other widgets can make room. */
  onVisible?(visible: boolean): void;
}

export const BOSS_FADE_SECONDS = 1.5;

/** Left offsets (percent) of the phase boundaries on a full-to-empty bar: evenly spaced, `phases - 1` of them. */
export function phaseTickOffsets(phases: number): number[] {
  const n = Number.isFinite(phases) ? Math.max(1, Math.floor(phases)) : 1;
  const out: number[] = [];
  for (let k = 1; k < n; k++) out.push(Math.round((1 - k / n) * 10000) / 100);
  return out;
}

/**
 * Boss health bar (top-center). Shows the most recently started boss that has not finished; when it
 * finishes it fades out over 1.5 s and the bar falls back to a remaining active boss.
 */
export class BossBar implements HudWidgetView {
  readonly id = 'boss-bar';
  readonly element;
  private readonly t: Translate;
  private readonly name;
  private readonly fill;
  private readonly bar;
  private readonly pips;
  private readonly flag;
  /** Start order, oldest first. */
  private order: string[] = [];
  /** Finished bosses and the seconds left before they are dropped. */
  private readonly leaving = new Map<string, number>();
  private readonly cache = new Map<string, BossView>();
  private tickKey = '';
  private pipKey = '';
  private shownId: string | null = null;
  private visible = false;

  constructor(
    private readonly doc: DocumentLike,
    private readonly source: BossBarSource,
  ) {
    this.t = source.t ?? defaultHudT;
    this.element = makeEl(doc, 'div', 'owg-boss');
    this.name = makeEl(doc, 'div', 'owg-boss-name', this.element);
    this.bar = makeEl(doc, 'div', 'owg-boss-bar', this.element);
    this.fill = makeEl(doc, 'div', 'owg-boss-fill', this.bar);
    this.pips = makeEl(doc, 'div', 'owg-boss-pips', this.element);
    this.flag = makeEl(doc, 'div', 'owg-boss-flag', this.element);
    this.init();
    this.update();
  }

  private read(id: string): BossView | null {
    try {
      return this.source.state?.(id) ?? null;
    } catch {
      return null;
    }
  }

  /** Picks up bosses already registered (setup after a boss started, or a late service). */
  init(): void {
    let ids: readonly string[] = [];
    try {
      ids = this.source.active?.() ?? [];
    } catch {
      ids = [];
    }
    for (const id of ids) {
      const s = this.read(id);
      if (s && !s.outcome) this.started(id);
    }
  }

  started(bossId: string): void {
    this.leaving.delete(bossId);
    this.order = this.order.filter((i) => i !== bossId);
    this.order.push(bossId);
  }

  /** phase, break, shield and releaseWindow: state is read from the registry, so only registration matters. */
  touched(bossId: string): void {
    if (!this.order.includes(bossId) && !this.leaving.has(bossId) && this.read(bossId)) this.order.unshift(bossId);
  }

  finished(bossId: string): void {
    const snap = this.read(bossId);
    if (snap) this.cache.set(bossId, snap);
    if (this.leaving.has(bossId)) return;
    if (!this.order.includes(bossId) && !snap && !this.cache.has(bossId)) return; // ended while never shown
    this.leaving.set(bossId, BOSS_FADE_SECONDS);
  }

  private current(): string | null {
    for (let i = this.order.length - 1; i >= 0; i--) {
      const id = this.order[i]!;
      if (!this.leaving.has(id)) return id;
    }
    return this.order.length ? this.order[this.order.length - 1]! : null;
  }

  tick(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    for (const [id, left] of this.leaving) {
      if (left - dt <= 0) {
        this.leaving.delete(id);
        this.order = this.order.filter((i) => i !== id);
        this.cache.delete(id);
      } else this.leaving.set(id, left - dt);
    }
  }

  update(dt = 0): void {
    this.tick(dt);
    const id = this.current();
    this.shownId = id;
    const live = id ? this.read(id) : null;
    if (live && id) this.cache.set(id, live);
    const s = id ? (live ?? this.cache.get(id) ?? null) : null;
    if (!id || !s) {
      setShown(this.element, false);
      this.setVisible(false);
      return;
    }
    const left = this.leaving.get(id);
    setShown(this.element, true, 'flex');
    this.setVisible(true);
    this.element.style.opacity = left === undefined ? '1' : String(Math.round(barFraction(left, BOSS_FADE_SECONDS) * 100) / 100);
    this.element.className = `owg-boss${s.shield ? ' owg-boss-shielded' : ''}${s.releaseOpen ? ' owg-boss-release' : ''}`;
    this.name.textContent = this.t(s.nameKey);
    this.fill.style.width = pct(barFraction(s.health, s.maxHealth));

    const tickKey = String(s.phases);
    if (tickKey !== this.tickKey) {
      this.tickKey = tickKey;
      this.bar.replaceChildren(this.fill);
      for (const left of phaseTickOffsets(s.phases)) {
        const tick = makeEl(this.doc, 'div', 'owg-boss-tick', this.bar);
        tick.style.left = `${left}%`;
      }
    }
    const per = Number.isFinite(s.breaksPerPhase) ? Math.max(0, Math.min(12, Math.floor(s.breaksPerPhase))) : 0;
    const on = Number.isFinite(s.breaks) ? Math.max(0, Math.min(per, Math.floor(s.breaks))) : 0;
    const pipKey = `${per}:${on}`;
    if (pipKey !== this.pipKey) {
      this.pipKey = pipKey;
      this.pips.replaceChildren();
      for (let i = 0; i < per; i++) makeEl(this.doc, 'div', i < on ? 'owg-boss-pip owg-boss-pip-on' : 'owg-boss-pip', this.pips);
    }
    this.flag.textContent = s.releaseOpen ? this.t('hud.boss.release') : s.shield ? this.t('hud.boss.shield') : null;
  }

  private setVisible(v: boolean): void {
    if (v === this.visible) return;
    this.visible = v;
    try {
      this.source.onVisible?.(v);
    } catch {
      // a broken listener must not break the bar
    }
  }

  /** The boss id currently drawn (null when hidden). */
  get shown(): string | null {
    return this.shownId;
  }

  dispose(): void {
    this.setVisible(false);
    this.element.remove();
  }
}

export type { ElementLike };
