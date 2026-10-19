import { type ClockPort, type Logger, consoleLogger } from '../hud/ports';
import type { Action, PromptRow, PromptService } from './types';

export const MECHANICS: readonly string[] = [
  'move', 'look', 'attack1', 'attack2', 'attack3', 'attack4', 'interact', 'sprint', 'jump', 'block',
  'dodge', 'lockOn', 'inventory', 'journal', 'skills', 'ability', 'map', 'fastTravel', 'surge', 'rest', 'wardstone-strike', 'lockSwap',
];

export const FADE_MS = 400;
export const RECENT_USE_TICKS = 90 * 60;
export const MAX_ROWS = 3;

export interface PromptDeps {
  clock: ClockPort;
  bindings: { glyph(action: string): string; has(action: string): boolean };
  strings: { t(key: string, params?: Record<string, string | number>): string };
  flags: { setFlag(key: string, value: number): void };
  keyboardLock: () => { supported: boolean; locked: boolean } | undefined;
  storage: { get(): boolean | null; set(v: boolean): void };
  logger?: Logger;
}

export interface PromptSave {
  counts: Record<string, number>;
  rebindOfferShown: boolean;
}

interface Entry {
  mechanic: string;
  action: Action;
  textKey: string;
  force: boolean;
  offer: boolean;
  text: string;
  fadeMs: number;
  fading: boolean;
}

export class PromptManager implements PromptService {
  static readonly key = 'prompts';
  static readonly version = 1;

  private readonly counts = new Map<string, number>();
  private readonly lastUsed = new Map<string, number>();
  private readonly warnedActions = new Set<string>();
  private readonly faded = new Map<string, { action: Action; textKey: string; force: boolean }>();
  private entries: Entry[] = [];
  private hintsAlways = false;
  private rebindOfferShown = false;
  private visible = true;
  private readonly logger: Logger;

  constructor(private readonly deps: PromptDeps) {
    this.logger = deps.logger ?? consoleLogger;
    try {
      this.hintsAlways = deps.storage.get() === true;
    } catch {
      this.hintsAlways = false;
    }
  }

  get showHintsAlways(): boolean {
    return this.hintsAlways;
  }

  set showHintsAlways(v: boolean) {
    this.hintsAlways = v;
    try {
      this.deps.storage.set(v);
    } catch {
      // memory only
    }
    if (v) {
      for (const e of this.entries) {
        e.fading = false;
        e.fadeMs = 0;
      }
      for (const [mechanic, f] of [...this.faded]) {
        this.faded.delete(mechanic);
        this.add(mechanic, f.action, f.textKey, f.force);
      }
    } else {
      for (const e of this.entries) if (this.count(e.mechanic) >= 2) e.fading = true;
    }
  }

  count(mechanic: string): number {
    return this.counts.get(mechanic) ?? 0;
  }

  success(mechanic: string): void {
    if (!MECHANICS.includes(mechanic)) {
      this.logger.warn(`prompts: unknown mechanic '${mechanic}'`);
      return;
    }
    const n = this.count(mechanic) + 1;
    this.counts.set(mechanic, n);
    this.deps.flags.setFlag(`prompt.${mechanic}.count`, n);
    this.lastUsed.set(mechanic, this.deps.clock.tick);
    if (n >= 2 && !this.hintsAlways) {
      const e = this.entries.find((x) => x.mechanic === mechanic);
      if (e) e.fading = true;
    }
  }

  show(mechanic: string, action: Action, textKey: string, opts?: { force?: boolean }): void {
    if (!this.deps.bindings.has(action)) {
      if (!this.warnedActions.has(action)) {
        this.warnedActions.add(action);
        this.logger.warn(`prompts: unknown action '${action}' for '${mechanic}'`);
      }
      return;
    }
    const force = opts?.force === true;
    if (this.count(mechanic) >= 2 && !this.hintsAlways && !force) {
      const last = this.lastUsed.get(mechanic);
      if (last !== undefined && this.deps.clock.tick - last < RECENT_USE_TICKS) return;
    }
    this.faded.delete(mechanic);
    this.add(mechanic, action, textKey, force);
  }

  hide(mechanic?: string): void {
    if (mechanic === undefined) {
      this.entries = [];
      this.faded.clear();
    } else {
      this.entries = this.entries.filter((e) => e.mechanic !== mechanic);
      this.faded.delete(mechanic);
    }
  }

  /** Recomputes every row's text, e.g. after a rebind. */
  refresh(): void {
    for (const e of this.entries) this.compose(e);
  }

  setVisible(v: boolean): void {
    this.visible = v;
  }

  update(dt: number): void {
    if (!this.visible || !(dt > 0)) return;
    let removed = false;
    for (const e of this.entries) {
      if (!e.fading) continue;
      e.fadeMs += dt * 1000;
      if (e.fadeMs >= FADE_MS) {
        removed = true;
        this.faded.set(e.mechanic, { action: e.action, textKey: e.textKey, force: e.force });
      }
    }
    if (removed) this.entries = this.entries.filter((e) => e.fadeMs < FADE_MS);
  }

  rows(): PromptRow[] {
    if (!this.visible) return [];
    return this.entries.map((e) => ({
      mechanic: e.mechanic,
      text: e.text,
      opacity: e.fading ? Math.max(0, 1 - e.fadeMs / FADE_MS) : 1,
      state: e.fading ? 'fading' : 'shown',
    }));
  }

  serialize(): PromptSave {
    const counts: Record<string, number> = {};
    for (const [m, n] of this.counts) if (n > 0) counts[m] = n;
    return { counts, rebindOfferShown: this.rebindOfferShown };
  }

  load(data: unknown): void {
    this.counts.clear();
    this.rebindOfferShown = false;
    const d = data !== null && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
    const raw = d.counts;
    if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
      for (const [m, n] of Object.entries(raw as Record<string, unknown>)) {
        if (MECHANICS.includes(m) && typeof n === 'number' && Number.isFinite(n) && n >= 0) {
          this.counts.set(m, Math.floor(n));
        }
      }
    }
    if (d.rebindOfferShown === true) this.rebindOfferShown = true;
    for (const m of MECHANICS) this.deps.flags.setFlag(`prompt.${m}.count`, this.count(m));
  }

  private add(mechanic: string, action: Action, textKey: string, force: boolean): void {
    const prev = this.entries.find((e) => e.mechanic === mechanic);
    const offer = prev?.offer ?? this.takeRebindOffer(mechanic);
    this.entries = this.entries.filter((e) => e !== prev);
    if (this.entries.length >= MAX_ROWS) {
      const victim = this.entries.find((e) => !e.force) ?? this.entries[0];
      this.entries = this.entries.filter((e) => e !== victim);
    }
    const e: Entry = { mechanic, action, textKey, force, offer, text: '', fadeMs: 0, fading: false };
    this.compose(e);
    this.entries.push(e);
  }

  private takeRebindOffer(mechanic: string): boolean {
    if (mechanic !== 'dodge' || this.rebindOfferShown) return false;
    if (this.deps.keyboardLock()?.locked) return false;
    this.rebindOfferShown = true;
    return true;
  }

  private compose(e: Entry): void {
    const params = { key: this.deps.bindings.glyph(e.action) };
    let text = this.deps.strings.t(e.textKey, params);
    if (e.offer) text += `\n${this.deps.strings.t('prompt.dodge.rebindOffer', params)}`;
    e.text = text;
  }
}
