import type { GameEvents } from '../core/events';
import type { WorldState } from './WorldState';

export type GateCause = 'init' | 'flag' | 'load' | 'recheck';
export type GateListener = (open: boolean, cause: GateCause) => void;

export interface GateOptions {
  /**
   * Flags the test reads. A key ending in `.*` matches every key under that prefix (`shrine.*`).
   * Omitted: every `flag.changed` re-evaluates the test.
   */
  keys?: readonly string[];
}

interface Watcher {
  test: (state: WorldState) => boolean;
  listener: GateListener;
  exact: Set<string> | null;
  prefixes: string[];
  open: boolean;
  removed: boolean;
  warned: boolean;
}

/**
 * Flag-derived state that survives a load (contracts/game-events-and-flags.md section 3, `ctx.gates`).
 * `WorldState.load` emits no `flag.changed`, so a gate that only listened to changes would miss the
 * loaded state; a watcher here is re-evaluated on every `save.loaded` as well.
 */
export class FlagGates {
  private readonly watchers = new Set<Watcher>();
  private readonly offs: (() => void)[];

  constructor(
    private readonly state: WorldState,
    events: GameEvents,
    private readonly report: (message: string, err?: unknown) => void = (m, e) => console.warn(m, e),
  ) {
    this.offs = [
      events.on('flag.changed', ({ key }) => this.evaluateAll('flag', key)),
      events.on('save.loaded', () => this.evaluateAll('load')),
    ];
  }

  /**
   * Calls `listener(open, 'init')` at once, then again only when the test's result changes: on a
   * matching `flag.changed`, on `save.loaded` and on `recheck()`. A throwing test counts as false.
   */
  watch(test: (state: WorldState) => boolean, listener: GateListener, opts: GateOptions = {}): () => void {
    const exact = opts.keys ? new Set(opts.keys.filter((k) => !k.endsWith('.*'))) : null;
    const prefixes = opts.keys ? opts.keys.filter((k) => k.endsWith('.*')).map((k) => k.slice(0, -1)) : [];
    const w: Watcher = { test, listener, exact, prefixes, open: false, removed: false, warned: false };
    w.open = this.run(w);
    this.watchers.add(w);
    this.call(w, 'init');
    return () => {
      w.removed = true;
      this.watchers.delete(w);
    };
  }

  /** Shorthand: open while flag `key` is truthy (`'scorched'` and `1` are open, `0`, `''` and unset are not). */
  flag(key: string, listener: GateListener): () => void {
    return this.watch((s) => Boolean(s.getFlag(key)), listener, { keys: [key] });
  }

  /** Re-evaluates every watcher (state a test reads that is not a flag changed). */
  recheck(): void {
    this.evaluateAll('recheck');
  }

  get size(): number {
    return this.watchers.size;
  }

  dispose(): void {
    for (const off of this.offs) off();
    this.watchers.clear();
  }

  private evaluateAll(cause: GateCause, key?: string): void {
    for (const w of [...this.watchers]) {
      if (w.removed) continue;
      if (key !== undefined && !this.matches(w, key)) continue;
      const open = this.run(w);
      if (open === w.open) continue;
      w.open = open;
      this.call(w, cause);
    }
  }

  private matches(w: Watcher, key: string): boolean {
    if (!w.exact) return true;
    return w.exact.has(key) || w.prefixes.some((p) => key.startsWith(p));
  }

  private run(w: Watcher): boolean {
    try {
      return Boolean(w.test(this.state));
    } catch (err) {
      if (!w.warned) {
        w.warned = true;
        this.report('gates: a gate test threw; it counts as closed', err);
      }
      return false;
    }
  }

  private call(w: Watcher, cause: GateCause): void {
    try {
      w.listener(w.open, cause);
    } catch (err) {
      this.report('gates: a gate listener threw', err);
    }
  }
}
