import type { GameContext } from './Game';

export const FIXED_PHASES = ['input', 'intent', 'animation', 'afterCombat', 'rules', 'late'] as const;
export const RENDER_PHASES = ['world', 'afterCamera', 'hud'] as const;
export type FixedPhase = (typeof FIXED_PHASES)[number];
export type RenderPhase = (typeof RENDER_PHASES)[number];

/** A unit of game logic (contracts/game-events-and-flags.md section 2). */
export interface GameSystem {
  id: string;
  fixedPhase?: FixedPhase;
  renderPhase?: RenderPhase;
  /** Ascending within a phase, from the contract's band table; ties by id. */
  order?: number;
  fixedUpdate?(dt: number, ctx: GameContext): void;
  render?(alpha: number, frameTime: number, ctx: GameContext): void;
  dispose?(): void;
}

/** A failing system is reported at most once per this many milliseconds. */
export const SYSTEM_ERROR_LOG_INTERVAL_MS = 5000;

function byOrder(a: Entry, b: Entry): number {
  return (a.system.order ?? 0) - (b.system.order ?? 0) || (a.system.id < b.system.id ? -1 : a.system.id > b.system.id ? 1 : 0);
}

interface Entry {
  system: GameSystem;
  live: boolean;
  lastErrorAt: number;
}

/**
 * Systems sorted per phase. Additions and removals made while a phase runs take effect from the next
 * tick; a removed system is never called again, also later in the same tick.
 */
export class SystemRegistry {
  private readonly entries = new Map<string, Entry>();
  private readonly addOrder: Entry[] = [];
  private fixedSorted = new Map<FixedPhase, Entry[]>();
  private renderSorted = new Map<RenderPhase, Entry[]>();
  private dirty = true;
  private running = 0;
  private disposed = false;

  constructor(
    private readonly report: (message: string, err?: unknown) => void = (m, e) => console.error(m, e),
    private readonly now: () => number = () => performance.now(),
  ) {}

  get size(): number {
    return this.entries.size;
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  add(system: GameSystem): () => void {
    if (this.disposed) throw new Error('SystemRegistry: disposed');
    if (this.entries.has(system.id)) throw new Error(`SystemRegistry: duplicate system id "${system.id}"`);
    if (system.fixedPhase && !FIXED_PHASES.includes(system.fixedPhase)) {
      throw new Error(`SystemRegistry: unknown fixed phase "${system.fixedPhase}" for "${system.id}"`);
    }
    if (system.renderPhase && !RENDER_PHASES.includes(system.renderPhase)) {
      throw new Error(`SystemRegistry: unknown render phase "${system.renderPhase}" for "${system.id}"`);
    }
    const entry: Entry = { system, live: true, lastErrorAt: -Infinity };
    this.entries.set(system.id, entry);
    this.addOrder.push(entry);
    this.markDirty();
    return () => this.remove(entry);
  }

  /** Runs one fixed phase. */
  runFixed(phase: FixedPhase, dt: number, ctx: GameContext): void {
    const list = this.fixedSorted.get(phase);
    if (!list) return;
    this.running++;
    try {
      for (const e of list) {
        if (!e.live || !e.system.fixedUpdate) continue;
        try {
          e.system.fixedUpdate(dt, ctx);
        } catch (err) {
          this.fail(e, 'fixedUpdate', err);
        }
      }
    } finally {
      this.running--;
    }
  }

  runRender(phase: RenderPhase, alpha: number, frameTime: number, ctx: GameContext): void {
    const list = this.renderSorted.get(phase);
    if (!list) return;
    this.running++;
    try {
      for (const e of list) {
        if (!e.live || !e.system.render) continue;
        try {
          e.system.render(alpha, frameTime, ctx);
        } catch (err) {
          this.fail(e, 'render', err);
        }
      }
    } finally {
      this.running--;
    }
  }

  /**
   * Applies additions and removals made since the last commit. The game calls it at the start of every
   * fixed tick and render frame, so a system added during a tick first runs on the next one.
   */
  commit(): void {
    this.resort();
  }

  /** Ids per phase in the order they would run after the next commit (debugging and tests). */
  order(phase: FixedPhase | RenderPhase): string[] {
    const isFixed = (FIXED_PHASES as readonly string[]).includes(phase);
    return this.addOrder
      .filter((e) => (isFixed ? e.system.fixedPhase : e.system.renderPhase) === phase)
      .sort(byOrder)
      .map((e) => e.system.id);
  }

  /** Disposes every system in reverse registration order. Idempotent. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const e of [...this.addOrder].reverse()) this.remove(e);
  }

  private remove(entry: Entry): void {
    if (!entry.live) return;
    entry.live = false;
    this.entries.delete(entry.system.id);
    this.addOrder.splice(this.addOrder.indexOf(entry), 1);
    this.markDirty();
    try {
      entry.system.dispose?.();
    } catch (err) {
      this.report(`SystemRegistry: dispose of "${entry.system.id}" failed`, err);
    }
  }

  private markDirty(): void {
    this.dirty = true;
  }

  /** Rebuilds the sorted lists; never while a phase is running. */
  private resort(): void {
    if (!this.dirty || this.running > 0) return;
    this.dirty = false;
    const fixed = new Map<FixedPhase, Entry[]>();
    const render = new Map<RenderPhase, Entry[]>();
    for (const e of this.addOrder) {
      const f = e.system.fixedPhase;
      if (f) (fixed.get(f) ?? fixed.set(f, []).get(f)!).push(e);
      const r = e.system.renderPhase;
      if (r) (render.get(r) ?? render.set(r, []).get(r)!).push(e);
    }
    for (const l of fixed.values()) l.sort(byOrder);
    for (const l of render.values()) l.sort(byOrder);
    this.fixedSorted = fixed;
    this.renderSorted = render;
  }

  private fail(e: Entry, where: string, err: unknown): void {
    const t = this.now();
    if (t - e.lastErrorAt < SYSTEM_ERROR_LOG_INTERVAL_MS) return;
    e.lastErrorAt = t;
    try {
      this.report(`System "${e.system.id}" ${where} failed`, err);
    } catch {
      /* never break the tick */
    }
  }
}
