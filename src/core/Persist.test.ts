import { describe, expect, it, vi } from 'vitest';
import { GameEvents } from './events';
import { PersistRegistry, type Persistable, type SaveEntry } from './Persist';

function item(key: string, over: Partial<Persistable> = {}): Persistable & { loaded: unknown[] } {
  const loaded: unknown[] = [];
  return {
    key,
    version: 2,
    serialize: () => ({ k: key }),
    load: (d, v) => loaded.push([d, v]),
    loaded,
    ...over,
  };
}

function make() {
  const warn = vi.fn();
  return { reg: new PersistRegistry(warn), warn, events: new GameEvents(() => {}) };
}

describe('PersistRegistry.register', () => {
  it('registers, gets and lists persistables', () => {
    const { reg } = make();
    const a = item('a');
    const b = item('b');
    reg.register(a);
    reg.register(b);
    expect(reg.get('a')).toBe(a);
    expect(reg.get('zzz')).toBeUndefined();
    expect(reg.all()).toEqual([a, b]);
  });

  it('a duplicate key throws', () => {
    const { reg } = make();
    reg.register(item('a'));
    expect(() => reg.register(item('a'))).toThrow(/already registered/);
  });

  it('rejects versions that are not integers >= 1', () => {
    const { reg } = make();
    for (const version of [0, -1, 1.5, NaN, Infinity]) {
      expect(() => reg.register(item('v', { version }))).toThrow(/integer version/);
    }
    expect(reg.get('v')).toBeUndefined();
  });

  it('unregister frees the key; stale unregister does not remove a newer owner', () => {
    const { reg } = make();
    const off = reg.register(item('a'));
    off();
    expect(reg.get('a')).toBeUndefined();
    const n = item('a');
    reg.register(n);
    off();
    expect(reg.get('a')).toBe(n);
  });
});

describe('PersistRegistry.saveAll', () => {
  it('serialises every persistable with its version', () => {
    const { reg } = make();
    reg.register(item('a', { version: 3 }));
    reg.register(item('b'));
    expect(reg.saveAll()).toEqual([
      { key: 'a', version: 3, data: { k: 'a' } },
      { key: 'b', version: 2, data: { k: 'b' } },
    ]);
  });

  it('a throwing serializer keeps the previous entry and warns', () => {
    const { reg, warn } = make();
    reg.register(
      item('a', {
        serialize: () => {
          throw new Error('x');
        },
      }),
    );
    reg.register(item('b'));
    const prev: SaveEntry[] = [{ key: 'a', version: 1, data: 'old' }];
    const out = reg.saveAll(prev);
    expect(out).toContainEqual({ key: 'a', version: 1, data: 'old' });
    expect(out).toContainEqual({ key: 'b', version: 2, data: { k: 'b' } });
    expect(out).toHaveLength(2);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('a throwing serializer with no previous entry writes nothing for that key', () => {
    const { reg } = make();
    reg.register(
      item('a', {
        serialize: () => {
          throw new Error('x');
        },
      }),
    );
    expect(reg.saveAll()).toEqual([]);
  });

  it('keeps previous entries with no registered owner verbatim', () => {
    const { reg } = make();
    reg.register(item('a'));
    const stray: SaveEntry = { key: 'ghost', version: 9, data: { z: 1 } };
    const out = reg.saveAll([stray]);
    expect(out).toContain(stray);
    expect(out.filter((e) => e.key === 'a')).toHaveLength(1);
  });

  it('does not duplicate a key that is registered and also in previous', () => {
    const { reg } = make();
    reg.register(item('a'));
    const out = reg.saveAll([{ key: 'a', version: 1, data: 'old' }]);
    expect(out).toEqual([{ key: 'a', version: 2, data: { k: 'a' } }]);
  });
});

describe('PersistRegistry.loadAll', () => {
  it('loads data and version into the owner and emits save.loaded once at the end', () => {
    const { reg, events } = make();
    const order: string[] = [];
    const a = item('a', { load: () => order.push('load-a') });
    reg.register(a);
    events.on('save.loaded', (p) => order.push(`loaded:${p.slot}`));
    const unknown = reg.loadAll([{ key: 'a', version: 1, data: 5 }], events, 'slot1');
    expect(unknown).toEqual([]);
    expect(order).toEqual(['load-a', 'loaded:slot1']);
  });

  it('passes the entry version to load', () => {
    const { reg, events } = make();
    const a = item('a');
    reg.register(a);
    reg.loadAll([{ key: 'a', version: 1, data: 'd' }], events, 's');
    expect(a.loaded).toEqual([['d', 1]]);
  });

  it('returns entries with no owner verbatim and does not load them', () => {
    const { reg, events } = make();
    reg.register(item('a'));
    const stray: SaveEntry = { key: 'ghost', version: 1, data: 1 };
    expect(reg.loadAll([stray], events, 's')).toEqual([stray]);
  });

  it('a key missing from the entries leaves its owner untouched (defaults)', () => {
    const { reg, events } = make();
    const a = item('a');
    reg.register(a);
    reg.loadAll([], events, 's');
    expect(a.loaded).toEqual([]);
  });

  it('refuses newer versions and warns', () => {
    const { reg, events, warn } = make();
    const a = item('a'); // version 2
    reg.register(a);
    reg.loadAll([{ key: 'a', version: 3, data: 1 }], events, 's');
    expect(a.loaded).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('refuses non-integer versions', () => {
    const { reg, events, warn } = make();
    const a = item('a');
    reg.register(a);
    reg.loadAll([{ key: 'a', version: 1.5, data: 1 }], events, 's');
    reg.loadAll([{ key: 'a', version: NaN, data: 1 }], events, 's');
    expect(a.loaded).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('loads the same version as the owner', () => {
    const { reg, events } = make();
    const a = item('a');
    reg.register(a);
    reg.loadAll([{ key: 'a', version: 2, data: 1 }], events, 's');
    expect(a.loaded).toHaveLength(1);
  });

  it('a throwing load is isolated: later entries still load and save.loaded still fires', () => {
    const { reg, events, warn } = make();
    const b = item('b');
    reg.register(
      item('a', {
        load: () => {
          throw new Error('x');
        },
      }),
    );
    reg.register(b);
    const loaded = vi.fn();
    events.on('save.loaded', loaded);
    reg.loadAll(
      [
        { key: 'a', version: 1, data: 1 },
        { key: 'b', version: 1, data: 2 },
      ],
      events,
      's',
    );
    expect(b.loaded).toHaveLength(1);
    expect(loaded).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
