import { describe, expect, it, vi } from 'vitest';
import { domError, FakeIndexedDb } from './__fixtures__/fakeIndexedDb';
import type { LogLevel, Persistable, SavePorts } from './ports';
import {
  SaveManager,
  SLOT_AUTOSAVE,
  SLOT_BACKUP,
  SLOT_MANUAL,
  type SaveOutcome,
} from './SaveManager';
import { SAVE_FORMAT_VERSION, type SaveFile } from './SaveSchema';
import { IndexedDbSaveStore, MemorySaveStore, type SaveStore, type StoreResult } from './SaveStore';

// ------------------------------------------------------------------ harness

function persistable(key: string, version = 1, state: { v: unknown } = { v: key + '-default' }) {
  const loads: [unknown, number][] = [];
  const p: Persistable & { state: { v: unknown }; loads: [unknown, number][]; throwSerialize: boolean; throwLoad: boolean } = {
    key,
    version,
    state,
    loads,
    throwSerialize: false,
    throwLoad: false,
    serialize() {
      if (p.throwSerialize) throw new Error('boom ' + key);
      return p.state.v;
    },
    load(data, v) {
      loads.push([data, v]);
      if (p.throwLoad) throw new Error('load boom ' + key);
      p.state.v = data;
    },
  };
  return p;
}
type P = ReturnType<typeof persistable>;

function makePorts(initial: P[] = []) {
  const state = {
    list: initial as Persistable[],
    safe: { safe: true } as { safe: boolean; reason?: string },
    clock: 1000,
    player: { x: 1, y: 2, z: 3, yaw: 0 } as unknown,
  };
  const logs: { level: LogLevel; msg: string }[] = [];
  const toasts: string[] = [];
  const emitLoaded = vi.fn();
  const ports: SavePorts = {
    persistables: () => state.list,
    emitLoaded,
    now: () => state.clock++,
    log: (level, msg) => logs.push({ level, msg }),
    gameplaySafe: () => state.safe,
    groundedPlayerState: () => state.player,
    toast: (k) => toasts.push(k),
  };
  return { ports, state, logs, toasts, emitLoaded };
}

/** Wraps a store: records calls, can fail the next write(s), throw synchronously, or hold writes. */
class SpyStore implements SaveStore {
  calls: string[] = [];
  writeLog: { slots: string[] }[] = [];
  failNext: StoreResult<void>[] = [];
  throwSync = false;
  holds: (() => void)[] = [];
  holdWrites = false;
  constructor(readonly inner: SaveStore = new MemorySaveStore()) {}
  get available() {
    return this.inner.available;
  }
  read(slot: string) {
    this.calls.push('read:' + slot);
    return this.inner.read(slot);
  }
  write(slot: string, file: SaveFile) {
    return this.writeMany([{ slot, value: file }]);
  }
  async writeMany(items: { slot: string; value: unknown }[]): Promise<StoreResult<void>> {
    if (this.throwSync) throw new Error('sync boom');
    this.calls.push('writeMany:' + items.map((i) => i.slot).join(','));
    this.writeLog.push({ slots: items.map((i) => i.slot) });
    if (this.holdWrites) await new Promise<void>((r) => this.holds.push(r));
    const f = this.failNext.shift();
    if (f) return f;
    return this.inner.writeMany(items);
  }
  delete(slot: string) {
    this.calls.push('delete:' + slot);
    return this.inner.delete(slot);
  }
  has(slot: string) {
    return this.inner.has(slot);
  }
  releaseOne() {
    this.holds.shift()?.();
  }
}

const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

function setup(opts: { persist?: P[]; store?: SaveStore } = {}) {
  const h = makePorts(opts.persist ?? []);
  const store = opts.store ?? new SpyStore();
  const mgr = new SaveManager({ ports: h.ports, store });
  return { ...h, store, mgr };
}

const entry = (version: number, data: unknown) => ({ version, data });
const mkFile = (savedAt: number, entries: SaveFile['entries'] = {}, extra: Partial<SaveFile> = {}): SaveFile => ({
  format: SAVE_FORMAT_VERSION,
  savedAt,
  reason: 'timer',
  playtimeSeconds: 10,
  entries,
  ...extra,
});
const raw = async (s: SaveStore, slot: string) => {
  const r = await s.read(slot);
  return r.ok ? r.value : 'READ-FAILED';
};
const okOutcome = (o: SaveOutcome) => {
  if (!o.ok) throw new Error('expected ok, got ' + o.reason);
  return o;
};

// ------------------------------------------------------------------ serialize

describe('serializeAll', () => {
  it('collects every persistable with its version plus the player position', () => {
    const a = persistable('a', 2);
    const b = persistable('b', 5);
    const { mgr, state } = setup({ persist: [a, b] });
    a.state.v = { n: 1 };
    expect(mgr.serializeAll()).toEqual({
      a: { version: 2, data: { n: 1 } },
      b: { version: 5, data: 'b-default' },
      'player-position': { version: 1, data: state.player },
    });
  });

  it('a throwing serializer keeps its previous value and the others still save', () => {
    const a = persistable('a');
    const b = persistable('b');
    const { mgr, logs } = setup({ persist: [a, b] });
    a.state.v = 'first';
    mgr.serializeAll();
    a.throwSerialize = true;
    a.state.v = 'second';
    b.state.v = 'b2';
    const out = mgr.serializeAll();
    expect(out.a).toEqual({ version: 1, data: 'first' });
    expect(out.b).toEqual({ version: 1, data: 'b2' });
    expect(logs.some((l) => l.level === 'error' && l.msg.includes('"a"'))).toBe(true);
  });

  it('a serializer that has never succeeded is simply omitted', () => {
    const a = persistable('a');
    a.throwSerialize = true;
    const { mgr } = setup({ persist: [a] });
    expect('a' in mgr.serializeAll()).toBe(false);
  });

  it('a throwing serializer falls back to the loaded value for that key', () => {
    const a = persistable('a');
    const { mgr } = setup({ persist: [a] });
    mgr.applyLoad(mkFile(1, { a: entry(1, 'from-disk') }));
    a.throwSerialize = true;
    expect(mgr.serializeAll().a).toEqual({ version: 1, data: 'from-disk' });
  });

  it('keeps the previous player position when the port yields nothing', () => {
    const { mgr, state } = setup();
    mgr.serializeAll();
    state.player = undefined;
    expect(mgr.serializeAll()['player-position']).toEqual({ version: 1, data: { x: 1, y: 2, z: 3, yaw: 0 } });
  });

  it('omits the position entirely if it was never available', () => {
    const { mgr, state } = setup();
    state.player = undefined;
    expect('player-position' in mgr.serializeAll()).toBe(false);
  });

  it('a persistable claiming the player-position key does not override the port', () => {
    const rogue = persistable('player-position', 1, { v: 'rogue' });
    const { mgr, state } = setup({ persist: [rogue] });
    expect(mgr.serializeAll()['player-position'].data).toBe(state.player);
  });
});

// ------------------------------------------------------------------ applyLoad

describe('applyLoad (contract section 7)', () => {
  it('loads registered entries with their stored versions and does not emit save.loaded', () => {
    const a = persistable('a', 3);
    const { mgr, emitLoaded } = setup({ persist: [a] });
    const rep = mgr.applyLoad(mkFile(1, { a: entry(2, 'old') }));
    expect(a.loads).toEqual([['old', 2]]); // older passes through with the STORED version
    expect(rep.applied).toEqual(['a']);
    expect(emitLoaded).not.toHaveBeenCalled();
  });

  it('refuses a newer entry version, keeps defaults and retains it verbatim', () => {
    const a = persistable('a', 1);
    const { mgr } = setup({ persist: [a] });
    const rep = mgr.applyLoad(mkFile(1, { a: entry(7, { future: true }) }));
    expect(a.loads).toEqual([]);
    expect(a.state.v).toBe('a-default');
    expect(rep.refusedNewer).toEqual(['a']);
    expect(mgr.retainedKeys()).toEqual(['a']);
  });

  it('a retained newer entry wins over the owner serialize on the next write', () => {
    const a = persistable('a', 1);
    const { mgr } = setup({ persist: [a] });
    mgr.applyLoad(mkFile(1, { a: entry(7, { future: true }) }));
    a.state.v = 'player-progress-in-defaults';
    expect(mgr.serializeAll().a).toEqual({ version: 7, data: { future: true } });
  });

  it('missing keys keep defaults and are reported', () => {
    const a = persistable('a');
    const b = persistable('b');
    const { mgr } = setup({ persist: [a, b] });
    const rep = mgr.applyLoad(mkFile(1, { a: entry(1, 'x') }));
    expect(b.loads).toEqual([]);
    expect(rep.missing).toEqual(['b']);
  });

  it('isolates a throwing load: others still load, the owner keeps defaults', () => {
    const a = persistable('a');
    const b = persistable('b');
    a.throwLoad = true;
    const { mgr, logs } = setup({ persist: [a, b] });
    const rep = mgr.applyLoad(mkFile(1, { a: entry(1, 'x'), b: entry(1, 'y') }));
    expect(rep.failed).toEqual(['a']);
    expect(rep.applied).toEqual(['b']);
    expect(b.state.v).toBe('y');
    expect(logs.some((l) => l.level === 'error')).toBe(true);
    expect(mgr.serializeAll().a.data).toBe('a-default'); // owner's (default) state is what it serializes next
  });

  it('keeps unregistered keys verbatim and writes them back; a late registrant can load them', async () => {
    const a = persistable('a');
    const { mgr, state, store } = setup({ persist: [a] });
    const rep = mgr.applyLoad(mkFile(1, { a: entry(1, 'x'), ghost: entry(4, { spooky: 1 }) }));
    expect(rep.unregistered).toEqual(['ghost']);
    expect(mgr.serializeAll().ghost).toEqual({ version: 4, data: { spooky: 1 } });
    okOutcome(await mgr.save('timer'));
    const saved = (await raw(store, SLOT_AUTOSAVE)) as SaveFile;
    expect(saved.entries.ghost).toEqual({ version: 4, data: { spooky: 1 } });

    const ghost = persistable('ghost', 4);
    state.list = [a, ghost];
    const again = mgr.reapplyRetained();
    expect(again.applied).toEqual(['ghost']);
    expect(ghost.loads).toEqual([[{ spooky: 1 }, 4]]);
    expect(mgr.retainedKeys()).toEqual([]);
    ghost.state.v = 'changed';
    expect(mgr.serializeAll().ghost.data).toBe('changed');
  });

  it('restores playtime and returns the player-position entry without retaining it', () => {
    const { mgr } = setup();
    const rep = mgr.applyLoad(
      mkFile(1, { 'player-position': entry(1, { x: 9 }) }, { playtimeSeconds: 321 }),
    );
    expect(rep.playerPosition).toEqual({ version: 1, data: { x: 9 } });
    expect(mgr.playtimeSeconds).toBe(321);
    expect(mgr.retainedKeys()).toEqual([]);
  });

  it('the caller emits save.loaded exactly once, after the last load', () => {
    const order: string[] = [];
    const a = persistable('a');
    const b = persistable('b');
    const origA = a.load;
    a.load = (d, v) => (order.push('load a'), origA(d, v));
    const origB = b.load;
    b.load = (d, v) => (order.push('load b'), origB(d, v));
    const { mgr, emitLoaded } = setup({ persist: [a, b] });
    emitLoaded.mockImplementation(() => order.push('loaded'));
    mgr.beginLoad();
    mgr.applyLoad(mkFile(1, { a: entry(1, 1), b: entry(1, 2) }));
    emitLoaded('slot');
    mgr.endLoad();
    expect(order).toEqual(['load a', 'load b', 'loaded']);
    expect(emitLoaded).toHaveBeenCalledTimes(1);
  });
});

// ------------------------------------------------------------------ save / queue

describe('save', () => {
  it('writes autosave only for timer and both slots for waystone, with all entries', async () => {
    const a = persistable('a');
    const { mgr, store } = setup({ persist: [a] });
    const spy = store as SpyStore;
    okOutcome(await mgr.save('timer'));
    expect(spy.writeLog.at(-1)!.slots).toEqual([SLOT_AUTOSAVE]);
    okOutcome(await mgr.save('waystone'));
    expect(spy.writeLog.at(-1)!.slots).toEqual([SLOT_AUTOSAVE, SLOT_MANUAL]);
    const f = (await raw(store, SLOT_MANUAL)) as SaveFile;
    expect(f.reason).toBe('waystone');
    expect(f.entries.a).toEqual({ version: 1, data: 'a-default' });
  });

  it('records playtime in the file', async () => {
    const { mgr, store } = setup();
    mgr.addPlaytime(5);
    mgr.addPlaytime(2.5);
    mgr.addPlaytime(-3);
    mgr.addPlaytime(NaN);
    await mgr.save('timer');
    expect(((await raw(store, SLOT_AUTOSAVE)) as SaveFile).playtimeSeconds).toBe(7.5);
  });

  it('two racing autosaves coalesce into exactly one follow-up and the latest state wins', async () => {
    const a = persistable('a');
    const spy = new SpyStore();
    spy.holdWrites = true;
    const { mgr } = setup({ persist: [a], store: spy });
    a.state.v = 'one';
    const p1 = mgr.save('timer'); // starts immediately: serialized NOW as "one"
    a.state.v = 'two';
    const p2 = mgr.save('timer');
    a.state.v = 'three';
    const p3 = mgr.save('zone'); // coalesces with p2
    await flush();
    expect(spy.writeLog.length).toBe(1); // only the first is in flight
    spy.releaseOne();
    await flush();
    expect(spy.writeLog.length).toBe(2); // exactly one follow-up
    a.state.v = 'four'; // changed after the follow-up started: must not appear
    spy.releaseOne();
    const [o1, o2, o3] = await Promise.all([p1, p2, p3]);
    expect(spy.writeLog.length).toBe(2);
    expect(okOutcome(o1).file.entries.a.data).toBe('one');
    expect(okOutcome(o2).file.entries.a.data).toBe('three');
    expect(o3).toBe(o2);
    expect(okOutcome(o2).file.reason).toBe('zone'); // latest reason wins
    const stored = (await raw(spy.inner, SLOT_AUTOSAVE)) as SaveFile;
    expect(stored.entries.a.data).toBe('three');
  });

  it('serialization happens synchronously when the write starts', async () => {
    const a = persistable('a');
    const { mgr } = setup({ persist: [a] });
    a.state.v = 'at-call';
    const p = mgr.save('timer');
    a.state.v = 'after-call';
    expect(okOutcome(await p).file.entries.a.data).toBe('at-call');
  });

  it('writes strictly in order: no interleaving between in-flight and follow-up writes', async () => {
    const spy = new SpyStore();
    spy.holdWrites = true;
    const { mgr } = setup({ store: spy });
    void mgr.save('timer');
    void mgr.save('timer');
    await flush();
    expect(spy.writeLog.length).toBe(1);
    spy.releaseOne();
    await flush();
    spy.releaseOne();
    await flush();
    expect(spy.writeLog.length).toBe(2);
  });

  it('a save during a pending write that fails, then a later one succeeds', async () => {
    const a = persistable('a');
    const spy = new SpyStore();
    spy.holdWrites = true;
    spy.failNext.push({ ok: false, reason: 'aborted' });
    const { mgr } = setup({ persist: [a], store: spy });
    a.state.v = 1;
    const p1 = mgr.save('timer');
    a.state.v = 2;
    const p2 = mgr.save('timer');
    await flush();
    spy.releaseOne(); // first write fails
    expect(await p1).toEqual({ ok: false, reason: 'aborted' });
    await flush();
    spy.releaseOne(); // follow-up succeeds
    expect(okOutcome(await p2).file.entries.a.data).toBe(2);
    expect(((await raw(spy.inner, SLOT_AUTOSAVE)) as SaveFile).entries.a.data).toBe(2);
  });

  it('a store that throws synchronously inside writeMany never throws into the caller', async () => {
    const spy = new SpyStore();
    spy.throwSync = true;
    const { mgr, logs } = setup({ store: spy });
    expect(await mgr.save('timer')).toEqual({ ok: false, reason: 'error' });
    expect(logs.some((l) => l.level === 'error')).toBe(true);
    spy.throwSync = false;
    okOutcome(await mgr.save('timer')); // queue is not wedged
  });

  it('a throwing serializer plus a throwing ports.now never wedge the queue', async () => {
    const h = setup();
    const spy = h.store as SpyStore;
    h.ports.now = () => {
      throw new Error('clock');
    };
    expect(await h.mgr.save('timer')).toEqual({ ok: false, reason: 'error' });
    expect(spy.writeLog.length).toBe(0);
  });
});

describe('save gating', () => {
  it('drops saves between beginLoad and endLoad (with a log) and allows them after', async () => {
    const { mgr, logs, store } = setup();
    const spy = store as SpyStore;
    mgr.beginLoad();
    expect(await mgr.save('waystone')).toEqual({ ok: false, reason: 'loading' });
    expect(await mgr.snapshotForExit()).toEqual({ ok: false, reason: 'loading' });
    expect(await mgr.autosave('timer')).toEqual({ ok: false, reason: 'loading' });
    expect(spy.writeLog.length).toBe(0);
    expect(logs.some((l) => l.msg.includes('load is in progress'))).toBe(true);
    mgr.endLoad();
    okOutcome(await mgr.save('waystone'));
    expect(spy.writeLog.length).toBe(1);
  });

  it('a load beginning while a write is queued drops the queued follow-up', async () => {
    const spy = new SpyStore();
    spy.holdWrites = true;
    const { mgr } = setup({ store: spy });
    const p1 = mgr.save('timer');
    const p2 = mgr.save('timer');
    await flush();
    mgr.beginLoad();
    spy.releaseOne();
    await p1;
    expect(await p2).toEqual({ ok: false, reason: 'loading' });
    expect(spy.writeLog.length).toBe(1);
  });

  it('an unsafe (airborne/dead/cutscene/travelling) save is deferred, then runs on notifySafe', async () => {
    const a = persistable('a');
    const { mgr, state, store } = setup({ persist: [a] });
    const spy = store as SpyStore;
    state.safe = { safe: false, reason: 'travelling' };
    expect(await mgr.save('waystone')).toEqual({ ok: false, reason: 'deferred' });
    expect(mgr.hasDeferredSave).toBe(true);
    expect(spy.writeLog.length).toBe(0);
    expect(mgr.notifySafe()).toBeUndefined(); // still unsafe: stays deferred
    expect(mgr.hasDeferredSave).toBe(true);
    state.safe = { safe: true };
    a.state.v = 'state-at-retry';
    const o = await mgr.notifySafe()!;
    expect(okOutcome(o).file.reason).toBe('waystone');
    expect(okOutcome(o).file.entries.a.data).toBe('state-at-retry'); // fresh state, not stale
    expect(mgr.hasDeferredSave).toBe(false);
    expect(mgr.notifySafe()).toBeUndefined();
  });

  it('never serializes the player position while unsafe (travelling)', async () => {
    const { mgr, state, store } = setup();
    const portSpy = vi.spyOn(state, 'player', 'get');
    state.safe = { safe: false, reason: 'travelling' };
    await mgr.save('timer');
    await mgr.save('exit');
    await mgr.snapshotForExit();
    expect(portSpy).not.toHaveBeenCalled();
    expect((store as SpyStore).writeLog.length).toBe(0);
  });

  it('a queued follow-up that became unsafe is deferred instead of written', async () => {
    const spy = new SpyStore();
    spy.holdWrites = true;
    const { mgr, state } = setup({ store: spy });
    const p1 = mgr.save('timer');
    const p2 = mgr.save('waystone');
    await flush();
    state.safe = { safe: false, reason: 'dead' };
    spy.releaseOne();
    await p1;
    expect(await p2).toEqual({ ok: false, reason: 'deferred' });
    expect(spy.writeLog.length).toBe(1);
    expect(mgr.hasDeferredSave).toBe(true);
  });

  it('a timer save is skipped during hostile aggro; waystone saves never are', async () => {
    const { mgr } = setup();
    expect(mgr.shouldSkipTimerSave(true)).toBe(true);
    expect(mgr.shouldSkipTimerSave(false)).toBe(false);
    expect(await mgr.autosave('timer', true)).toEqual({ ok: false, reason: 'skipped' });
    okOutcome(await mgr.autosave('waystone', true));
    okOutcome(await mgr.autosave('rest', true));
    okOutcome(await mgr.autosave('timer', false));
  });
});

describe('snapshotForExit', () => {
  it('writes a fresh snapshot when safe', async () => {
    const a = persistable('a');
    const { mgr, store } = setup({ persist: [a] });
    a.state.v = 'now';
    okOutcome(await mgr.snapshotForExit());
    expect(((await raw(store, SLOT_AUTOSAVE)) as SaveFile).entries.a.data).toBe('now');
  });

  it('writes the last safe in-memory snapshot when currently unsafe', async () => {
    const a = persistable('a');
    const { mgr, state, store } = setup({ persist: [a] });
    a.state.v = 'safe-moment';
    expect(mgr.captureSnapshot()).toBe(true);
    state.safe = { safe: false, reason: 'dead' };
    a.state.v = 'mid-death-garbage';
    okOutcome(await mgr.snapshotForExit());
    expect(((await raw(store, SLOT_AUTOSAVE)) as SaveFile).entries.a.data).toBe('safe-moment');
  });

  it('writes nothing when unsafe and no safe snapshot exists', async () => {
    const { mgr, state, store } = setup();
    state.safe = { safe: false };
    expect(await mgr.snapshotForExit()).toEqual({ ok: false, reason: 'deferred' });
    expect((store as SpyStore).writeLog.length).toBe(0);
  });

  it('a snapshot from before a load is never written afterwards', async () => {
    const { mgr, state, store } = setup();
    mgr.captureSnapshot();
    mgr.beginLoad();
    mgr.endLoad();
    state.safe = { safe: false };
    expect(await mgr.snapshotForExit()).toEqual({ ok: false, reason: 'deferred' });
    expect((store as SpyStore).writeLog.length).toBe(0);
  });

  it('hide during an in-flight write leaves the old save valid (atomic single transaction)', async () => {
    const idb = new FakeIndexedDb();
    const store = new IndexedDbSaveStore(idb.factory);
    const a = persistable('a');
    const { mgr } = setup({ persist: [a], store });
    a.state.v = 'old';
    okOutcome(await mgr.save('waystone'));
    const before = idb.peek(SLOT_AUTOSAVE);
    const hold = idb.hold();
    a.state.v = 'new';
    const inflight = mgr.save('timer');
    await new Promise((r) => setTimeout(r, 0));
    const exit = mgr.snapshotForExit(); // pagehide while the put is in flight (coalesced)
    hold.abort(); // the browser kills the transaction
    expect((await inflight).ok).toBe(false);
    await exit;
    // whatever happened afterwards, the stored slot was never half-written
    const now = idb.peek(SLOT_AUTOSAVE) as SaveFile;
    expect(now.format).toBe(1);
    expect(before).toBeDefined();
    expect(typeof now.entries.a.data).toBe('string');
  });

  it('an aborted in-flight write leaves exactly the old value', async () => {
    const idb = new FakeIndexedDb();
    const a = persistable('a');
    const { mgr } = setup({ persist: [a], store: new IndexedDbSaveStore(idb.factory) });
    a.state.v = 'old';
    okOutcome(await mgr.save('timer'));
    idb.injectAbort();
    a.state.v = 'new';
    expect(await mgr.save('timer')).toEqual({ ok: false, reason: 'aborted' });
    expect(((idb.peek(SLOT_AUTOSAVE) as SaveFile).entries.a.data)).toBe('old');
  });
});

// ------------------------------------------------------------------ continue

describe('continue', () => {
  it('returns no-save when both slots are empty', async () => {
    const { mgr } = setup();
    expect(await mgr.continue()).toEqual({ ok: false, reason: 'no-save' });
  });

  it('prefers the newer savedAt of the two slots (either way round)', async () => {
    for (const [autoAt, manualAt, expected] of [
      [100, 200, SLOT_MANUAL],
      [300, 200, SLOT_AUTOSAVE],
    ] as const) {
      const spy = new SpyStore();
      await spy.inner.write(SLOT_AUTOSAVE, mkFile(autoAt));
      await spy.inner.write(SLOT_MANUAL, mkFile(manualAt));
      const { mgr } = setup({ store: spy });
      const r = await mgr.continue();
      expect(r.ok && r.slot).toBe(expected);
      expect(r.ok && r.file.savedAt).toBe(Math.max(autoAt, manualAt));
    }
  });

  it('works with only one slot present', async () => {
    const spy = new SpyStore();
    await spy.inner.write(SLOT_MANUAL, mkFile(5));
    const { mgr } = setup({ store: spy });
    const r = await mgr.continue();
    expect(r.ok && r.slot).toBe(SLOT_MANUAL);
  });

  it('does not emit save.loaded and does not apply anything', async () => {
    const spy = new SpyStore();
    const a = persistable('a');
    await spy.inner.write(SLOT_AUTOSAVE, mkFile(5, { a: entry(1, 'x') }));
    const { mgr, emitLoaded } = setup({ store: spy, persist: [a] });
    await mgr.continue();
    expect(emitLoaded).not.toHaveBeenCalled();
    expect(a.loads).toEqual([]);
  });

  it('continue then applyLoad exposes the saved coordinates once for a single teleport', async () => {
    const spy = new SpyStore();
    const pos = { x: 10, y: 5, z: -4, yaw: 1 };
    await spy.inner.write(SLOT_AUTOSAVE, mkFile(5, { 'player-position': entry(1, pos) }));
    const { mgr } = setup({ store: spy });
    const teleport = vi.fn();
    const r = await mgr.continue();
    if (!r.ok) throw new Error('no');
    mgr.beginLoad();
    const rep = mgr.applyLoad(r.file);
    if (rep.playerPosition) teleport(rep.playerPosition.data);
    mgr.endLoad();
    expect(teleport).toHaveBeenCalledTimes(1);
    expect(teleport).toHaveBeenCalledWith(pos);
  });

  it('a corrupt blob: continue reports corrupt, the store is untouched, backup lands with the first overwrite in ONE transaction', async () => {
    const idb = new FakeIndexedDb();
    idb.seed(SLOT_AUTOSAVE, '{garbage');
    const store = new IndexedDbSaveStore(idb.factory);
    const { mgr } = setup({ store });
    expect(await mgr.continue()).toEqual({ ok: false, reason: 'corrupt' });
    expect(idb.txLog.filter((t) => t.mode === 'readwrite').length).toBe(0);
    expect(idb.peek(SLOT_BACKUP)).toBeUndefined();
    okOutcome(await mgr.save('waystone'));
    const writes = idb.txLog.filter((t) => t.mode === 'readwrite');
    expect(writes.length).toBe(1); // backup + both slots together
    expect(writes[0].ops.sort()).toEqual(['put:autosave', 'put:slot-0', 'put:slot-0.backup']);
    expect(idb.peek(SLOT_BACKUP)).toBe('{garbage');
    expect((idb.peek(SLOT_AUTOSAVE) as SaveFile).format).toBe(1);
  });

  it('a corrupt slot next to a good one still loads the good one and backs up the bad one later', async () => {
    const spy = new SpyStore();
    await spy.inner.write(SLOT_AUTOSAVE, mkFile(5) as SaveFile);
    await spy.inner.writeMany([{ slot: SLOT_MANUAL, value: { nonsense: 1 } }]);
    const { mgr } = setup({ store: spy });
    const r = await mgr.continue();
    expect(r.ok && r.slot).toBe(SLOT_AUTOSAVE);
    await mgr.save('waystone');
    expect(await raw(spy.inner, SLOT_BACKUP)).toEqual({ nonsense: 1 });
  });

  it('a newer-format save is refused, backed up, and not overwritten by saves until newGame', async () => {
    const spy = new SpyStore();
    const future = { format: 2, savedAt: 9, whatever: [1, 2, 3] };
    await spy.inner.writeMany([{ slot: SLOT_AUTOSAVE, value: future }]);
    const { mgr, logs } = setup({ store: spy });
    expect(await mgr.continue()).toEqual({ ok: false, reason: 'newer' });
    expect(await raw(spy.inner, SLOT_BACKUP)).toEqual(future);
    expect(mgr.isProtected).toBe(true);

    expect(await mgr.save('waystone')).toEqual({ ok: false, reason: 'protected' });
    expect(await mgr.autosave('timer')).toEqual({ ok: false, reason: 'protected' });
    expect(await mgr.snapshotForExit()).toEqual({ ok: false, reason: 'protected' });
    expect(await raw(spy.inner, SLOT_AUTOSAVE)).toEqual(future);
    expect(logs.some((l) => l.msg.includes('protected'))).toBe(true);

    expect((await mgr.newGame()).ok).toBe(true);
    expect(mgr.isProtected).toBe(false);
    expect(await raw(spy.inner, SLOT_AUTOSAVE)).toBeUndefined();
    expect(await raw(spy.inner, SLOT_BACKUP)).toEqual(future); // still recoverable
    okOutcome(await mgr.save('waystone'));
    expect(((await raw(spy.inner, SLOT_AUTOSAVE)) as SaveFile).format).toBe(1);
  });

  it('a newer-format slot makes continue refuse even when the other slot is fine', async () => {
    const spy = new SpyStore();
    await spy.inner.write(SLOT_AUTOSAVE, mkFile(5));
    await spy.inner.writeMany([{ slot: SLOT_MANUAL, value: { format: 3 } }]);
    const { mgr } = setup({ store: spy });
    expect(await mgr.continue()).toEqual({ ok: false, reason: 'newer' });
  });

  it('reports unavailable when every read fails, and falls back with one toast', async () => {
    const idb = new FakeIndexedDb();
    idb.failOpenWith = domError('UnknownError');
    const { mgr, toasts } = setup({ store: new IndexedDbSaveStore(idb.factory) });
    expect(await mgr.continue()).toEqual({ ok: false, reason: 'unavailable' });
    expect(toasts).toEqual(['save.unavailable']);
    expect(mgr.isUsingFallback).toBe(true);
    expect(await mgr.continue()).toEqual({ ok: false, reason: 'no-save' }); // memory store now
    expect(toasts).toEqual(['save.unavailable']);
  });

  it('reports unavailable for an undefined indexedDB (private mode)', async () => {
    const { mgr, toasts } = setup({ store: new IndexedDbSaveStore(undefined) });
    expect(await mgr.continue()).toEqual({ ok: false, reason: 'unavailable' });
    expect(toasts).toEqual(['save.unavailable']);
  });

  it('a store that throws from read is reported as unavailable, not thrown', async () => {
    const bad: SaveStore = {
      available: true,
      read: () => {
        throw new Error('sync read boom');
      },
      write: () => Promise.reject(new Error('x')),
      writeMany: () => Promise.reject(new Error('x')),
      delete: () => Promise.reject(new Error('x')),
      has: () => Promise.reject(new Error('x')),
    };
    const { mgr } = setup({ store: bad });
    expect(await mgr.continue()).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('round trip: save, then a new manager continues and restores state', async () => {
    const shared = new MemorySaveStore();
    const a1 = persistable('a');
    const m1 = setup({ persist: [a1], store: shared });
    a1.state.v = { gold: 12 };
    m1.mgr.addPlaytime(99);
    okOutcome(await m1.mgr.save('waystone'));

    const a2 = persistable('a');
    const m2 = setup({ persist: [a2], store: shared });
    const r = await m2.mgr.continue();
    if (!r.ok) throw new Error('no');
    m2.mgr.beginLoad();
    m2.mgr.applyLoad(r.file);
    m2.ports.emitLoaded('autosave');
    m2.mgr.endLoad();
    expect(a2.state.v).toEqual({ gold: 12 });
    expect(m2.mgr.playtimeSeconds).toBe(99);
    expect(m2.emitLoaded).toHaveBeenCalledTimes(1);
  });
});

// ------------------------------------------------------------------ failure paths

describe('fallback and quota', () => {
  it('falls back to memory with exactly one toast when the store is unavailable', async () => {
    const { mgr, toasts } = setup({ store: new IndexedDbSaveStore(undefined) });
    const o = okOutcome(await mgr.save('timer'));
    expect(o.ok).toBe(true);
    okOutcome(await mgr.save('timer'));
    expect(toasts).toEqual(['save.unavailable']);
    expect(mgr.isUsingFallback).toBe(true);
  });

  it('falls back and retries when a write reports unavailable (open error mid-session)', async () => {
    const idb = new FakeIndexedDb();
    idb.failOpenWith = domError('InvalidStateError');
    const { mgr, toasts } = setup({ store: new IndexedDbSaveStore(idb.factory) });
    okOutcome(await mgr.save('timer'));
    expect(toasts).toEqual(['save.unavailable']);
  });

  it('on quota drops a disposable backup, retries once, and succeeds', async () => {
    const idb = new FakeIndexedDb();
    idb.seed(SLOT_BACKUP, mkFile(1)); // a normal-format backup
    const { mgr, toasts } = setup({ store: new IndexedDbSaveStore(idb.factory) });
    idb.injectPutError(domError('QuotaExceededError'));
    okOutcome(await mgr.save('waystone'));
    expect(idb.peek(SLOT_BACKUP)).toBeUndefined();
    expect((idb.peek(SLOT_AUTOSAVE) as SaveFile).format).toBe(1);
    expect(toasts).toEqual([]);
  });

  it('on repeated quota toasts save.quota once and keeps playing', async () => {
    const idb = new FakeIndexedDb();
    idb.seed(SLOT_BACKUP, mkFile(1));
    const { mgr, toasts } = setup({ store: new IndexedDbSaveStore(idb.factory) });
    idb.injectPutError(domError('QuotaExceededError'), 2);
    expect(await mgr.save('timer')).toEqual({ ok: false, reason: 'quota' });
    expect(toasts).toEqual(['save.quota']);
    idb.injectPutError(domError('QuotaExceededError'), 1);
    await mgr.save('timer'); // no backup left to drop, no second toast within the same episode
    expect(toasts).toEqual(['save.quota']);
    okOutcome(await mgr.save('timer')); // recovers
    expect(mgr.isUsingFallback).toBe(false);
  });

  it('quota path keeps a newer-format backup and does not retry', async () => {
    const idb = new FakeIndexedDb();
    const future = { format: 2, precious: true };
    idb.seed(SLOT_BACKUP, future);
    const { mgr, toasts } = setup({ store: new IndexedDbSaveStore(idb.factory) });
    idb.injectPutError(domError('QuotaExceededError'), 5);
    expect(await mgr.save('waystone')).toEqual({ ok: false, reason: 'quota' });
    expect(idb.peek(SLOT_BACKUP)).toEqual(future);
    expect(toasts).toEqual(['save.quota']);
    expect(idb.txLog.filter((t) => t.mode === 'readwrite').length).toBe(1); // no retry
  });

  it('quota path keeps an unparseable backup too', async () => {
    const idb = new FakeIndexedDb();
    idb.seed(SLOT_BACKUP, '{corrupt');
    const { mgr } = setup({ store: new IndexedDbSaveStore(idb.factory) });
    idb.injectPutError(domError('QuotaExceededError'), 5);
    await mgr.save('timer');
    expect(idb.peek(SLOT_BACKUP)).toBe('{corrupt');
  });

  it('a corrupt blob never replaces an existing newer-format backup', async () => {
    const idb = new FakeIndexedDb();
    const future = { format: 2, precious: true };
    idb.seed(SLOT_BACKUP, future);
    idb.seed(SLOT_AUTOSAVE, 'garbage');
    const { mgr } = setup({ store: new IndexedDbSaveStore(idb.factory) });
    await mgr.continue();
    okOutcome(await mgr.save('timer'));
    expect(idb.peek(SLOT_BACKUP)).toEqual(future);
  });

  it('a quota failure while writing the backup transaction leaves the old slots intact (atomic)', async () => {
    const idb = new FakeIndexedDb();
    const old = mkFile(1, { z: entry(1, 'old') });
    idb.seed(SLOT_AUTOSAVE, old);
    idb.seed(SLOT_MANUAL, 'garbage');
    const { mgr } = setup({ store: new IndexedDbSaveStore(idb.factory) });
    await mgr.continue();
    idb.injectPutError(domError('QuotaExceededError'), 9);
    await mgr.save('waystone');
    expect(idb.peek(SLOT_AUTOSAVE)).toEqual(old);
    expect(idb.peek(SLOT_MANUAL)).toBe('garbage');
  });
});

// ------------------------------------------------------------------ newGame

describe('newGame', () => {
  it('backs up the current save then clears both slots and resets in-memory state', async () => {
    const spy = new SpyStore();
    const a = persistable('a');
    const { mgr } = setup({ store: spy, persist: [a] });
    mgr.applyLoad(mkFile(1, { ghost: entry(1, 1) }));
    mgr.addPlaytime(50);
    a.state.v = 'progress';
    await mgr.save('waystone');
    expect((await mgr.newGame()).ok).toBe(true);
    expect(await raw(spy.inner, SLOT_AUTOSAVE)).toBeUndefined();
    expect(await raw(spy.inner, SLOT_MANUAL)).toBeUndefined();
    const backup = (await raw(spy.inner, SLOT_BACKUP)) as SaveFile;
    expect(backup.entries.a.data).toBe('progress');
    expect(mgr.retainedKeys()).toEqual([]);
    expect(mgr.playtimeSeconds).toBe(0);
    expect((await mgr.continue()).ok).toBe(false);
  });

  it('with nothing saved it clears without writing a backup', async () => {
    const spy = new SpyStore();
    const { mgr } = setup({ store: spy });
    expect((await mgr.newGame()).ok).toBe(true);
    expect(await raw(spy.inner, SLOT_BACKUP)).toBeUndefined();
  });

  it('backs up the corrupt blob it found rather than a stale slot', async () => {
    const spy = new SpyStore();
    await spy.inner.writeMany([{ slot: SLOT_AUTOSAVE, value: '{bad' }]);
    const { mgr } = setup({ store: spy });
    await mgr.continue();
    await mgr.newGame();
    expect(await raw(spy.inner, SLOT_BACKUP)).toBe('{bad');
  });

  it('reports a failed delete without throwing', async () => {
    const bad = new SpyStore();
    bad.delete = async () => ({ ok: false, reason: 'error' });
    const { mgr } = setup({ store: bad });
    expect((await mgr.newGame()).ok).toBe(false);
  });
});

// ------------------------------------------------------------------ performance

describe('performance', () => {
  it('loads a 200 KB, 40-persistable save in under 100 ms', () => {
    const ps = Array.from({ length: 40 }, (_, i) => persistable('p' + i, 1));
    const { mgr } = setup({ persist: ps });
    const entries: SaveFile['entries'] = {};
    ps.forEach((p, i) => {
      entries[p.key] = entry(1, { i, blob: 'x'.repeat(5000), arr: Array.from({ length: 50 }, (_, k) => k) });
    });
    const file = mkFile(1, entries);
    expect(JSON.stringify(file).length).toBeGreaterThan(200_000);
    const t0 = performance.now();
    mgr.beginLoad();
    const rep = mgr.applyLoad(file);
    mgr.endLoad();
    const dt = performance.now() - t0;
    expect(rep.applied.length).toBe(40);
    expect(dt).toBeLessThan(100);
  });
});
