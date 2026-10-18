import { describe, expect, it, vi } from 'vitest';
import type { GameContext } from './Game';
import { CORE_PLUGIN_ID, PluginLoader, disabledFromQuery, type GamePlugin, type PluginHost, type PluginModule } from './plugins';
import { Scope } from './scope';

/** Registrations made through the fake context, so teardown can be asserted. */
interface Reg {
  live: Set<string>;
  everAdded: string[];
}

function makeHost() {
  const reg: Reg = { live: new Set(), everAdded: [] };
  const host: PluginHost = {
    scopedContext(scope: Scope) {
      return {
        register: (name: string) => {
          reg.live.add(name);
          reg.everAdded.push(name);
          return scope.track(() => reg.live.delete(name));
        },
      } as unknown as GameContext;
    },
  };
  return { host, reg };
}

type Ctx = { register(name: string): () => void };
const registerOn = (ctx: GameContext, name: string) => (ctx as unknown as Ctx).register(name);

function plugin(id: string, over: Partial<GamePlugin> & { setupLog?: string[] } = {}): GamePlugin {
  const { setupLog, ...rest } = over;
  return {
    id,
    setup: (ctx) => {
      setupLog?.push(id);
      registerOn(ctx, id);
    },
    ...rest,
  };
}

function mods(...ps: unknown[]): Record<string, PluginModule> {
  const out: Record<string, PluginModule> = {};
  ps.forEach((p, i) => (out[`/src/p${String(i).padStart(2, '0')}.plugin.ts`] = { default: p }));
  return out;
}

function make(opts: { disabled?: Set<string>; timeoutMs?: number } = {}) {
  const { host, reg } = makeHost();
  const report = vi.fn();
  const loader = new PluginLoader(host, { ...opts, report });
  return { loader, reg, report };
}

const states = (loader: PluginLoader) => Object.fromEntries(loader.status().map((s) => [s.id, s.state]));

describe('disabledFromQuery', () => {
  it('parses a comma list, trims and drops empties', () => {
    expect([...disabledFromQuery('?disable=a, b,,c')]).toEqual(['a', 'b', 'c']);
  });
  it('is empty without the parameter or with an empty value', () => {
    expect(disabledFromQuery('').size).toBe(0);
    expect(disabledFromQuery('?x=1').size).toBe(0);
    expect(disabledFromQuery('?disable=').size).toBe(0);
  });
  it('works without the leading ?', () => {
    expect([...disabledFromQuery('disable=ai')]).toEqual(['ai']);
  });
});

describe('PluginLoader ordering', () => {
  it('sets up in topological order', async () => {
    const { loader } = make();
    const log: string[] = [];
    await loader.load(
      mods(
        plugin('c', { dependsOn: ['b'], setupLog: log }),
        plugin('b', { dependsOn: ['a'], setupLog: log }),
        plugin('a', { setupLog: log }),
      ),
    );
    expect(log).toEqual(['a', 'b', 'c']);
    expect(states(loader)).toEqual({ a: 'ok', b: 'ok', c: 'ok' });
  });

  it('ties are broken by id', async () => {
    const { loader } = make();
    const log: string[] = [];
    await loader.load(mods(plugin('zeta', { setupLog: log }), plugin('alpha', { setupLog: log }), plugin('mid', { setupLog: log })));
    expect(log).toEqual(['alpha', 'mid', 'zeta']);
  });

  it('core comes first even when others sort earlier and without declared dependency', async () => {
    const { loader } = make();
    const log: string[] = [];
    await loader.load(mods(plugin('aaa', { setupLog: log }), plugin(CORE_PLUGIN_ID, { setupLog: log }), plugin('abc', { setupLog: log })));
    expect(log).toEqual(['core', 'aaa', 'abc']);
  });

  it('a dependency is set up before its dependant even if the dependency has a later id', async () => {
    const { loader } = make();
    const log: string[] = [];
    await loader.load(mods(plugin('a', { dependsOn: ['z'], setupLog: log }), plugin('z', { setupLog: log })));
    expect(log).toEqual(['z', 'a']);
  });

  it('the result is invariant under the order of the module record', async () => {
    const ps = () => [
      plugin('core'),
      plugin('d', { dependsOn: ['b', 'c'] }),
      plugin('c', { dependsOn: ['a'] }),
      plugin('b'),
      plugin('a'),
      plugin('e', { dependsOn: ['missing'] }),
    ];
    const orderFor = async (shuffle: (k: string[]) => string[]) => {
      const log: string[] = [];
      const list = ps().map((p) => ({ ...p, setup: () => void log.push(p.id) }));
      const rec: Record<string, PluginModule> = {};
      shuffle(list.map((_, i) => `/src/${String.fromCharCode(97 + i)}.plugin.ts`)).forEach((path) => {
        rec[path] = { default: list[path.charCodeAt(5) - 97] };
      });
      const { loader } = make();
      await loader.load(rec);
      return { log, status: loader.status().map((s) => `${s.id}:${s.state}`).sort() };
    };
    const base = await orderFor((k) => k);
    const rev = await orderFor((k) => [...k].reverse());
    const odd = await orderFor((k) => [...k.filter((_, i) => i % 2), ...k.filter((_, i) => !(i % 2))]);
    expect(rev).toEqual(base);
    expect(odd).toEqual(base);
    expect(base.log).toEqual(['core', 'a', 'b', 'c', 'd']);
  });
});

describe('PluginLoader validation', () => {
  it('skips modules without a default export or with an invalid shape', async () => {
    const { loader, report } = make();
    const log: string[] = [];
    const record: Record<string, PluginModule> = {
      '/src/a.plugin.ts': {},
      '/src/b.plugin.ts': { default: null },
      '/src/c.plugin.ts': { default: 'string' },
      '/src/d.plugin.ts': { default: { id: 'Bad_Id', setup() {} } },
      '/src/e.plugin.ts': { default: { id: 'noSetup' } },
      '/src/f.plugin.ts': { default: { id: 'nosetup', setup: 1 } },
      '/src/g.plugin.ts': { default: { id: 'deps', dependsOn: 'x', setup() {} } },
      '/src/h.plugin.ts': { default: { id: 'deps2', dependsOn: [1], setup() {} } },
      '/src/i.plugin.ts': { default: { id: 'disp', dispose: 'x', setup() {} } },
      '/src/j.plugin.ts': { default: { id: '1num', setup() {} } },
      '/src/k.plugin.ts': { default: plugin('good', { setupLog: log }) },
    };
    await loader.load(record);
    expect(log).toEqual(['good']);
    expect(loader.status().map((s) => s.id)).toEqual(['good']);
    expect(report.mock.calls.filter((c) => String(c[0]).includes('no valid default export'))).toHaveLength(10);
  });

  it('a duplicate id keeps the first by sorted path, whatever the record order', async () => {
    const mk = async (paths: string[]) => {
      const { loader } = make();
      const winner: string[] = [];
      const rec: Record<string, PluginModule> = {};
      for (const p of paths) rec[p] = { default: { id: 'dup', setup: () => void winner.push(p) } };
      await loader.load(rec);
      return { winner, status: loader.status() };
    };
    const r1 = await mk(['/src/z.plugin.ts', '/src/a.plugin.ts']);
    const r2 = await mk(['/src/a.plugin.ts', '/src/z.plugin.ts']);
    expect(r1.winner).toEqual(['/src/a.plugin.ts']);
    expect(r2.winner).toEqual(['/src/a.plugin.ts']);
    expect(r1.status).toEqual([{ id: 'dup', state: 'ok' }]);
  });

  it('reports the duplicate', async () => {
    const { loader, report } = make();
    await loader.load({ '/a': { default: plugin('x') }, '/b': { default: plugin('x') } });
    expect(report.mock.calls.some((c) => String(c[0]).includes('duplicate plugin id "x" in /b'))).toBe(true);
  });

  it('an empty record loads nothing', async () => {
    const { loader } = make();
    expect(await loader.load({})).toEqual([]);
  });
});

describe('PluginLoader dependencies', () => {
  it('skips a plugin with a missing dependency and its dependants', async () => {
    const { loader, report } = make();
    const log: string[] = [];
    await loader.load(
      mods(
        plugin('a', { dependsOn: ['ghost'], setupLog: log }),
        plugin('b', { dependsOn: ['a'], setupLog: log }),
        plugin('c', { setupLog: log }),
      ),
    );
    expect(log).toEqual(['c']);
    expect(states(loader)).toEqual({ a: 'skipped', b: 'skipped', c: 'ok' });
    expect(loader.status().find((s) => s.id === 'a')?.reason).toMatch(/missing dependency "ghost"/);
    expect(report).toHaveBeenCalled();
  });

  it('skips every member of a cycle, and plugins depending on it, but not bystanders', async () => {
    const { loader } = make();
    const log: string[] = [];
    await loader.load(
      mods(
        plugin('a', { dependsOn: ['b'], setupLog: log }),
        plugin('b', { dependsOn: ['c'], setupLog: log }),
        plugin('c', { dependsOn: ['a'], setupLog: log }),
        plugin('d', { dependsOn: ['a'], setupLog: log }),
        plugin('e', { setupLog: log }),
      ),
    );
    expect(log).toEqual(['e']);
    expect(states(loader)).toEqual({ a: 'skipped', b: 'skipped', c: 'skipped', d: 'skipped', e: 'ok' });
    expect(loader.status().find((s) => s.id === 'a')?.reason).toMatch(/cycle/);
  });

  it('a self-dependency is a cycle', async () => {
    const { loader } = make();
    await loader.load(mods(plugin('a', { dependsOn: ['a'] })));
    expect(states(loader)).toEqual({ a: 'skipped' });
  });

  it('a disabled plugin is skipped and so are its dependants', async () => {
    const { loader, reg } = make({ disabled: new Set(['b']) });
    await loader.load(mods(plugin('a'), plugin('b'), plugin('c', { dependsOn: ['b'] }), plugin('d', { dependsOn: ['a'] })));
    expect(states(loader)).toEqual({ a: 'ok', b: 'skipped', c: 'skipped', d: 'ok' });
    expect(loader.status().find((s) => s.id === 'b')?.reason).toMatch(/disabled/);
    expect([...reg.live].sort()).toEqual(['a', 'd']);
  });

  it('disabling an id that does not exist is harmless', async () => {
    const { loader } = make({ disabled: new Set(['nothing']) });
    await loader.load(mods(plugin('a')));
    expect(states(loader)).toEqual({ a: 'ok' });
  });

  it('dependants of a plugin whose setup failed are skipped', async () => {
    const { loader } = make();
    const log: string[] = [];
    await loader.load(
      mods(
        plugin('a', {
          setup: () => {
            throw new Error('nope');
          },
        }),
        plugin('b', { dependsOn: ['a'], setupLog: log }),
        plugin('c', { dependsOn: ['b'], setupLog: log }),
        plugin('d', { setupLog: log }),
      ),
    );
    expect(log).toEqual(['d']);
    expect(states(loader)).toEqual({ a: 'failed', b: 'skipped', c: 'skipped', d: 'ok' });
    expect(loader.failures().map((f) => f.id).sort()).toEqual(['a', 'b', 'c']);
  });
});

describe('PluginLoader setup failures', () => {
  it('a throwing sync setup is torn down, dispose called, and recorded', async () => {
    const { loader, reg, report } = make();
    const dispose = vi.fn();
    await loader.load(
      mods(
        plugin('a', {
          dispose,
          setup: (ctx) => {
            registerOn(ctx, 'first');
            registerOn(ctx, 'second');
            throw new Error('sync boom');
          },
        }),
        plugin('b'),
      ),
    );
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(reg.live.has('first') || reg.live.has('second')).toBe(false);
    expect(reg.live.has('b')).toBe(true);
    expect(loader.status().find((s) => s.id === 'a')).toEqual({ id: 'a', state: 'failed', reason: 'sync boom' });
    expect(report.mock.calls.some((c) => String(c[0]).includes('"a" failed to set up'))).toBe(true);
  });

  it('a rejecting async setup is torn down with dispose called', async () => {
    const { loader, reg } = make();
    const dispose = vi.fn();
    await loader.load(
      mods(
        plugin('a', {
          dispose,
          setup: async (ctx) => {
            registerOn(ctx, 'x');
            await Promise.resolve();
            registerOn(ctx, 'y');
            throw new Error('async boom');
          },
        }),
      ),
    );
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(reg.live.size).toBe(0);
    expect(loader.status()[0]).toMatchObject({ state: 'failed', reason: 'async boom' });
  });

  it('a non-Error throw becomes the reason string', async () => {
    const { loader } = make();
    await loader.load(
      mods(
        plugin('a', {
          setup: () => {
            throw 'plain string';
          },
        }),
      ),
    );
    expect(loader.status()[0].reason).toBe('plain string');
  });

  it('a throwing dispose during teardown is reported and the scope still closes', async () => {
    const { loader, reg, report } = make();
    await loader.load(
      mods(
        plugin('a', {
          dispose: () => {
            throw new Error('d');
          },
          setup: (ctx) => {
            registerOn(ctx, 'x');
            throw new Error('s');
          },
        }),
      ),
    );
    expect(reg.live.size).toBe(0);
    expect(report.mock.calls.some((c) => String(c[0]).includes('dispose failed'))).toBe(true);
  });

  it('a failing plugin does not stop later independent plugins', async () => {
    const { loader } = make();
    await loader.load(
      mods(
        plugin('a', {
          setup: () => {
            throw new Error('x');
          },
        }),
        plugin('b'),
      ),
    );
    expect(states(loader)).toEqual({ a: 'failed', b: 'ok' });
  });

  it('a setup that throws a context lookup error (host throws) is a failure, not a crash', async () => {
    const report = vi.fn();
    const loader = new PluginLoader({ scopedContext: () => { throw new Error('no ctx'); } }, { report });
    await loader.load(mods(plugin('a')));
    expect(loader.status()[0]).toMatchObject({ state: 'failed', reason: 'no ctx' });
  });
});

describe('PluginLoader timeout', () => {
  it('times out a setup that never settles and tears it down', async () => {
    const { loader, reg } = make({ timeoutMs: 20 });
    const dispose = vi.fn();
    await loader.load(
      mods(
        plugin('slow', {
          dispose,
          setup: (ctx) => {
            registerOn(ctx, 'early');
            return new Promise<void>(() => {});
          },
        }),
        plugin('dep', { dependsOn: ['slow'] }),
        plugin('other'),
      ),
    );
    expect(loader.status().find((s) => s.id === 'slow')).toMatchObject({ state: 'failed' });
    expect(loader.status().find((s) => s.id === 'slow')?.reason).toMatch(/timed out after 20 ms/);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(reg.live.has('early')).toBe(false);
    expect(states(loader).dep).toBe('skipped');
    expect(states(loader).other).toBe('ok');
  });

  it('a late resolve after the timeout has its late registrations undone', async () => {
    const { loader, reg } = make({ timeoutMs: 20 });
    let release: () => void = () => {};
    let lateCtx: GameContext | undefined;
    await loader.load(
      mods(
        plugin('slow', {
          setup: async (ctx) => {
            lateCtx = ctx;
            await new Promise<void>((r) => (release = r));
            registerOn(ctx, 'late'); // runs after the scope closed
          },
        }),
      ),
    );
    expect(states(loader).slow).toBe('failed');
    release();
    await new Promise((r) => setTimeout(r, 5));
    expect(reg.everAdded).toContain('late');
    expect(reg.live.has('late')).toBe(false);
    expect(lateCtx).toBeDefined();
    expect(states(loader).slow).toBe('failed'); // never flips back to ok
  });

  it('a setup that finishes in time clears its timer (no late failure)', async () => {
    vi.useFakeTimers();
    try {
      const { loader } = make({ timeoutMs: 1000 });
      const p = loader.load(mods(plugin('a')));
      await vi.advanceTimersByTimeAsync(0);
      await p;
      expect(vi.getTimerCount()).toBe(0);
      expect(states(loader).a).toBe('ok');
    } finally {
      vi.useRealTimers();
    }
  });

  it('uses fake timers to fail exactly at timeoutMs', async () => {
    vi.useFakeTimers();
    try {
      const { loader } = make({ timeoutMs: 500 });
      const p = loader.load(mods(plugin('a', { setup: () => new Promise<void>(() => {}) })));
      await vi.advanceTimersByTimeAsync(499);
      expect(loader.status()).toEqual([]);
      await vi.advanceTimersByTimeAsync(1);
      await p;
      expect(states(loader).a).toBe('failed');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('PluginLoader dispose', () => {
  it('disposes plugins in reverse setup order, dispose before registrations', async () => {
    const { loader, reg } = make();
    const log: string[] = [];
    const mk = (id: string, deps?: string[]) =>
      plugin(id, {
        dependsOn: deps,
        dispose: () => log.push(`dispose:${id}:live=${reg.live.has(id)}`),
      });
    await loader.load(mods(mk('c', ['b']), mk('b', ['a']), mk('a')));
    expect([...reg.live].sort()).toEqual(['a', 'b', 'c']);
    loader.dispose();
    expect(log).toEqual(['dispose:c:live=true', 'dispose:b:live=true', 'dispose:a:live=true']);
    expect(reg.live.size).toBe(0);
  });

  it('is idempotent and only disposes successfully set up plugins', async () => {
    const { loader } = make();
    const ok = vi.fn();
    const bad = vi.fn();
    await loader.load(
      mods(
        plugin('ok', { dispose: ok }),
        plugin('zbad', {
          dispose: bad,
          setup: () => {
            throw new Error('x');
          },
        }),
      ),
    );
    expect(bad).toHaveBeenCalledTimes(1); // from teardown of the failed setup
    loader.dispose();
    loader.dispose();
    expect(ok).toHaveBeenCalledTimes(1);
    expect(bad).toHaveBeenCalledTimes(1);
  });

  it('a throwing dispose does not stop the others', async () => {
    const { loader, reg, report } = make();
    const other = vi.fn();
    await loader.load(
      mods(
        plugin('a', { dispose: other }),
        plugin('b', {
          dependsOn: ['a'],
          dispose: () => {
            throw new Error('d');
          },
        }),
      ),
    );
    loader.dispose();
    expect(other).toHaveBeenCalledTimes(1);
    expect(reg.live.size).toBe(0);
    expect(report.mock.calls.some((c) => String(c[0]).includes('"b" dispose failed'))).toBe(true);
  });

  it('dispose during an async setup tears the plugin down when it finishes and stops loading', async () => {
    const { loader, reg } = make();
    let release: () => void = () => {};
    const dispose = vi.fn();
    const later = vi.fn();
    const p = loader.load(
      mods(
        plugin('a', {
          dispose,
          setup: async (ctx) => {
            registerOn(ctx, 'a');
            await new Promise<void>((r) => (release = r));
          },
        }),
        plugin('b', { dependsOn: ['a'], setup: later }),
      ),
    );
    await new Promise((r) => setTimeout(r, 0));
    loader.dispose();
    release();
    await p;
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(reg.live.size).toBe(0);
    expect(later).not.toHaveBeenCalled();
  });
});
