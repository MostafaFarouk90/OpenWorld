// Act 5 N9 (plans/act5-N9.md section 1): the siege HUD's state, pure. Events in, a view out; nothing is cached across a load.
import { DEFAULT_SIEGE_IDS } from './ports';

export const ORDER_FLASH_S = 2.5;
export const LINE_BROKEN_FLASH_S = 3;
export const MAX_CHIPS = 8;

export interface RamView {
  id: string;
  /** 0..1 */
  fill: number;
  /** Seconds of stall left (0 when moving). */
  stalled: number;
}

export interface SiegeView {
  siegeId: string;
  wave: number;
  waves: number | null;
  /** 0..100 */
  gatePct: number;
  breached: boolean;
  /** The wave between is cleared and orders may be given. */
  between: boolean;
  rams: RamView[];
  chips: string[];
  chipsMore: number;
  flash: { textKey: string; params?: Record<string, string | number> } | null;
  lineBroken: boolean;
}

export interface SiegeModelPorts {
  /** Siege ids the HUD draws (N4 adds R27's). */
  siegeIds?(): readonly string[];
  /** The siege's wave total, from N4's def (null when unknown: "Wave 2"). */
  waveTotal?(siegeId: string): number | null;
  /** Whether the siege is over (the quest's complete flag). */
  over?(siegeId: string): boolean;
}

/** Events to the view. All methods are safe with junk input. */
export class SiegeModel {
  private id: string | null = null;
  private wave = 0;
  private gate = 100;
  private breached = false;
  private between = false;
  private readonly rams = new Map<string, RamView>();
  private chips: string[] = [];
  private flashKey: { textKey: string; params?: Record<string, string | number> } | null = null;
  private flashLeft = 0;
  private lineLeft = 0;

  constructor(private readonly ports: SiegeModelPorts = {}) {}

  private known(siegeId: unknown): siegeId is string {
    if (typeof siegeId !== 'string' || siegeId === '') return false;
    return (this.ports.siegeIds?.() ?? DEFAULT_SIEGE_IDS).includes(siegeId);
  }

  private take(siegeId: unknown): boolean {
    if (!this.known(siegeId)) return false;
    if (this.id !== null && this.id !== siegeId) this.reset();
    this.id = siegeId;
    return true;
  }

  reset(): void {
    this.id = null;
    this.wave = 0;
    this.gate = 100;
    this.breached = false;
    this.between = false;
    this.rams.clear();
    this.chips = [];
    this.flashKey = null;
    this.flashLeft = 0;
    this.lineLeft = 0;
  }

  waveStarted(e: { siegeId?: unknown; n?: unknown }): void {
    if (!this.take(e?.siegeId)) return;
    this.wave = typeof e.n === 'number' && e.n > 0 ? Math.floor(e.n) : this.wave;
    this.between = false;
  }

  waveCleared(e: { siegeId?: unknown; n?: unknown }): void {
    if (!this.take(e?.siegeId)) return;
    if (typeof e.n === 'number' && e.n > 0) this.wave = Math.floor(e.n);
    this.between = true;
    this.rams.clear();
  }

  gateDamaged(e: { siegeId?: unknown; pct?: unknown }): void {
    if (typeof e?.pct !== 'number' || !Number.isFinite(e.pct) || !this.take(e.siegeId)) return;
    this.gate = Math.max(0, Math.min(100, e.pct));
    if (this.gate > 0) this.breached = false;
  }

  gateBreached(e: { siegeId?: unknown }): void {
    if (!this.take(e?.siegeId)) return;
    this.breached = true;
    this.gate = 0;
  }

  order(e: { siegeId?: unknown; id?: unknown }): void {
    if (typeof e?.id !== 'string' || !this.take(e.siegeId)) return;
    this.flashKey = { textKey: `hud.siege.order.${e.id}` };
    this.flashLeft = ORDER_FLASH_S;
  }

  allyArrived(e: { siegeId?: unknown; id?: unknown }): void {
    if (typeof e?.id !== 'string' || !this.take(e.siegeId)) return;
    if (!this.chips.includes(e.id)) this.chips.push(e.id);
  }

  /** N5's one-shot `enemies.shieldLine.broken`: only while a siege is live (a line broken elsewhere is not the siege's news). */
  lineBroken(): void {
    if (this.id === null) return;
    this.lineLeft = LINE_BROKEN_FLASH_S;
  }

  /** A ram or cart's health (`structure.damaged`); `ram` says whether it is a ram. */
  ram(id: string, fill: number, stalled: number): void {
    if (this.id === null) return;
    this.rams.set(id, { id, fill: Math.max(0, Math.min(1, fill)), stalled: Math.max(0, stalled) });
  }

  /** N4's `siege.rams()` stall readout for a ram the bar already shows. */
  setStall(id: string, stalled: number): void {
    const r = this.rams.get(id);
    if (r) r.stalled = Math.max(0, Number.isFinite(stalled) ? stalled : 0);
  }

  ramGone(id: string): void {
    this.rams.delete(id);
  }

  tick(dt: number): void {
    if (!(dt > 0)) return;
    this.flashLeft = Math.max(0, this.flashLeft - dt);
    this.lineLeft = Math.max(0, this.lineLeft - dt);
    if (this.flashLeft === 0) this.flashKey = null;
  }

  /** null: hidden. */
  view(): SiegeView | null {
    if (this.id === null || !this.known(this.id)) return null;
    if (this.ports.over?.(this.id)) return null;
    const total = this.ports.waveTotal?.(this.id) ?? null;
    return {
      siegeId: this.id,
      wave: this.wave,
      waves: typeof total === 'number' && total > 0 ? total : null,
      gatePct: this.gate,
      breached: this.breached,
      between: this.between,
      rams: [...this.rams.values()].sort((a, b) => a.id.localeCompare(b.id)).slice(0, 2),
      chips: this.chips.slice(0, MAX_CHIPS),
      chipsMore: Math.max(0, this.chips.length - MAX_CHIPS),
      flash: this.flashLeft > 0 ? this.flashKey : null,
      lineBroken: this.lineLeft > 0,
    };
  }
}
