import type { GameContext } from './Game';
import { Scope } from './scope';

export interface GamePlugin {
  id: string;
  dependsOn?: string[];
  setup(ctx: GameContext): void | Promise<void>;
  dispose?(): void;
}

export interface PluginModule {
  default?: unknown;
}

export type PluginState = 'ok' | 'failed' | 'skipped';
export interface PluginStatus {
  id: string;
  state: PluginState;
  reason?: string;
}

export const CORE_PLUGIN_ID = 'core';
export const PLUGIN_SETUP_TIMEOUT_MS = 10_000;
const PLUGIN_ID = /^[a-z][a-z0-9-]*$/;

/** What the loader needs from the game: a scoped context per plugin. */
export interface PluginHost {
  scopedContext(scope: Scope): GameContext;
}

export interface LoadOptions {
  disabled?: ReadonlySet<string>;
  timeoutMs?: number;
  report?: (message: string, err?: unknown) => void;
}

function isPlugin(v: unknown): v is GamePlugin {
  const p = v as GamePlugin | null;
  return (
    !!p &&
    typeof p === 'object' &&
    typeof p.id === 'string' &&
    PLUGIN_ID.test(p.id) &&
    typeof p.setup === 'function' &&
    (p.dependsOn === undefined || (Array.isArray(p.dependsOn) && p.dependsOn.every((d) => typeof d === 'string'))) &&
    (p.dispose === undefined || typeof p.dispose === 'function')
  );
}

/** Plugin ids from `?disable=a,b`. */
export function disabledFromQuery(search: string): Set<string> {
  const raw = new URLSearchParams(search).get('disable') ?? '';
  return new Set(raw.split(',').map((s) => s.trim()).filter(Boolean));
}

/**
 * Validates, orders and sets up plugins one at a time (contracts/game-events-and-flags.md section 1).
 * The result does not depend on the order of `modules`.
 */
export class PluginLoader {
  private readonly statuses = new Map<string, PluginStatus>();
  private readonly active: { plugin: GamePlugin; scope: Scope }[] = [];
  private readonly report: (message: string, err?: unknown) => void;
  private disposed = false;

  constructor(
    private readonly host: PluginHost,
    private readonly opts: LoadOptions = {},
  ) {
    this.report = opts.report ?? ((m, e) => console.error(m, e ?? ''));
  }

  status(): PluginStatus[] {
    return [...this.statuses.values()];
  }

  failures(): PluginStatus[] {
    return this.status().filter((s) => s.state !== 'ok');
  }

  async load(modules: Readonly<Record<string, PluginModule>>): Promise<PluginStatus[]> {
    const plugins = new Map<string, GamePlugin>();
    // Sorted paths keep "first of a duplicate pair wins" independent of glob order.
    for (const path of Object.keys(modules).sort()) {
      const candidate = modules[path]?.default;
      if (!isPlugin(candidate)) {
        this.report(`Plugins: ${path} has no valid default export (id, setup); skipped`);
        continue;
      }
      if (plugins.has(candidate.id)) {
        this.report(`Plugins: duplicate plugin id "${candidate.id}" in ${path}; skipped`);
        continue;
      }
      plugins.set(candidate.id, candidate);
    }

    for (const id of this.opts.disabled ?? []) {
      if (plugins.delete(id)) this.skip(id, 'disabled by ?disable');
    }

    for (const plugin of this.order(plugins)) {
      if (this.disposed) break;
      const blocked = (plugin.dependsOn ?? []).find((d) => this.statuses.get(d)?.state !== 'ok');
      if (blocked !== undefined) {
        this.skip(plugin.id, `dependency "${blocked}" is ${this.statuses.get(blocked)?.state ?? 'missing'}`);
        continue;
      }
      await this.setupOne(plugin);
    }
    return this.status();
  }

  /** Disposes plugins in reverse setup order: their dispose, then their scoped registrations. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const { plugin, scope } of this.active.reverse()) this.teardown(plugin, scope);
    this.active.length = 0;
  }

  private async setupOne(plugin: GamePlugin): Promise<void> {
    const scope = new Scope(this.report);
    const timeoutMs = this.opts.timeoutMs ?? PLUGIN_SETUP_TIMEOUT_MS;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const ctx = this.host.scopedContext(scope);
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`setup timed out after ${timeoutMs} ms`)), timeoutMs);
      });
      await Promise.race([Promise.resolve().then(() => plugin.setup(ctx)), timeout]);
      if (this.disposed) {
        this.teardown(plugin, scope);
        return;
      }
      this.active.push({ plugin, scope });
      this.statuses.set(plugin.id, { id: plugin.id, state: 'ok' });
    } catch (err) {
      this.teardown(plugin, scope);
      const reason = err instanceof Error ? err.message : String(err);
      this.statuses.set(plugin.id, { id: plugin.id, state: 'failed', reason });
      this.report(`Plugin "${plugin.id}" failed to set up: ${reason}`, err);
    } finally {
      clearTimeout(timer);
    }
  }

  private teardown(plugin: GamePlugin, scope: Scope): void {
    try {
      plugin.dispose?.();
    } catch (err) {
      this.report(`Plugin "${plugin.id}" dispose failed`, err);
    }
    scope.close();
  }

  private skip(id: string, reason: string): void {
    this.statuses.set(id, { id, state: 'skipped', reason });
    this.report(`Plugin "${id}" skipped: ${reason}`);
  }

  /** Core first, then a topological order with ties by id; unknown dependencies and cycles are skipped. */
  private order(plugins: Map<string, GamePlugin>): GamePlugin[] {
    const out: GamePlugin[] = [];
    const state = new Map<string, 'visiting' | 'done' | 'bad'>();
    const visit = (id: string, chain: string[]): boolean => {
      const s = state.get(id);
      if (s === 'done') return true;
      if (s === 'bad') return false;
      const p = plugins.get(id);
      if (!p) return false;
      if (s === 'visiting') {
        const cycle = [...chain.slice(chain.indexOf(id)), id];
        for (const c of cycle) {
          state.set(c, 'bad');
          if (!this.statuses.has(c)) this.skip(c, `dependency cycle ${cycle.join(' -> ')}`);
        }
        return false;
      }
      state.set(id, 'visiting');
      const deps = [...(p.dependsOn ?? [])].sort();
      for (const d of deps) {
        if (!plugins.has(d)) {
          state.set(id, 'bad');
          const why = this.statuses.has(d) ? `dependency "${d}" is ${this.statuses.get(d)!.state}` : `missing dependency "${d}"`;
          if (!this.statuses.has(id)) this.skip(id, why);
          return false;
        }
        if (!visit(d, [...chain, id])) {
          if (state.get(id) !== 'bad') {
            state.set(id, 'bad');
            if (!this.statuses.has(id)) this.skip(id, `dependency "${d}" cannot set up`);
          }
          return false;
        }
      }
      if (state.get(id) === 'bad') return false;
      state.set(id, 'done');
      out.push(p);
      return true;
    };
    const ids = [...plugins.keys()].sort((a, b) => (a === CORE_PLUGIN_ID ? -1 : b === CORE_PLUGIN_ID ? 1 : a < b ? -1 : 1));
    for (const id of ids) visit(id, []);
    return out;
  }
}
