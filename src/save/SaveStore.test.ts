import { describe, expect, it } from 'vitest';
import { domError, FakeIndexedDb } from './__fixtures__/fakeIndexedDb';
import { IndexedDbSaveStore, MemorySaveStore, defaultIndexedDbFactory } from './SaveStore';
import type { SaveFile } from './SaveSchema';

const file = (n = 1, extra: Record<string, unknown> = {}): SaveFile => ({
  format: 1,
  savedAt: n,
  reason: 'manual',
  playtimeSeconds: n,
  entries: { a: { version: 1, data: { n, ...extra } } },
});

describe('IndexedDbSaveStore (fake IDB)', () => {
  it('round-trips a write', async () => {
    const idb = new FakeIndexedDb();
    const s = new IndexedDbSaveStore(idb.factory);
    expect(await s.write('slot-0', file(5))).toEqual({ ok: true, value: undefined });
    expect(await s.read('slot-0')).toEqual({ ok: true, value: file(5) });
  });

  it('reads a missing slot as undefined', async () => {
    const s = new IndexedDbSaveStore(new FakeIndexedDb().factory);
    expect(await s.read('nope')).toEqual({ ok: true, value: undefined });
    expect(await s.has('nope')).toEqual({ ok: true, value: false });
  });

  it('overwrites, deletes and keeps two slots independent', async () => {
    const s = new IndexedDbSaveStore(new FakeIndexedDb().factory);
    await s.write('autosave', file(1));
    await s.write('slot-0', file(2));
    await s.write('autosave', file(3));
    expect(await s.read('autosave')).toEqual({ ok: true, value: file(3) });
    expect(await s.read('slot-0')).toEqual({ ok: true, value: file(2) });
    expect(await s.has('slot-0')).toEqual({ ok: true, value: true });
    await s.delete('autosave');
    expect(await s.read('autosave')).toEqual({ ok: true, value: undefined });
    expect(await s.read('slot-0')).toEqual({ ok: true, value: file(2) });
  });

  it('stores a clone, not the live object', async () => {
    const s = new IndexedDbSaveStore(new FakeIndexedDb().factory);
    const f = file(1);
    await s.write('a', f);
    f.entries.a.data = 'mutated';
    const r = await s.read('a');
    expect(r.ok && (r.value as SaveFile).entries.a.data).toEqual({ n: 1 });
  });

  it('writeMany uses exactly one readwrite transaction', async () => {
    const idb = new FakeIndexedDb();
    const s = new IndexedDbSaveStore(idb.factory);
    await s.read('warm'); // open
    const before = idb.txLog.length;
    const r = await s.writeMany([
      { slot: 'slot-0.backup', value: 'raw' },
      { slot: 'autosave', value: file(1) },
      { slot: 'slot-0', value: file(1) },
    ]);
    expect(r.ok).toBe(true);
    expect(idb.txLog.length - before).toBe(1);
    expect(idb.txLog.at(-1)!.mode).toBe('readwrite');
    expect(idb.txLog.at(-1)!.ops).toEqual(['put:slot-0.backup', 'put:autosave', 'put:slot-0']);
  });

  it('writeMany with no items is a no-op success', async () => {
    const idb = new FakeIndexedDb();
    const s = new IndexedDbSaveStore(idb.factory);
    expect(await s.writeMany([])).toEqual({ ok: true, value: undefined });
    expect(idb.opens).toBe(0);
  });

  it('writeMany is all-or-nothing when one put hits quota', async () => {
    const idb = new FakeIndexedDb();
    const s = new IndexedDbSaveStore(idb.factory);
    await s.write('autosave', file(1));
    // fail the SECOND put of the batch
    let n = 0;
    const orig = idb.takePutError.bind(idb);
    idb.takePutError = () => (++n === 2 ? domError('QuotaExceededError') : orig());
    const r = await s.writeMany([
      { slot: 'autosave', value: file(2) },
      { slot: 'slot-0', value: file(2) },
    ]);
    expect(r).toMatchObject({ ok: false, reason: 'quota' });
    expect(idb.peek('autosave')).toEqual(file(1)); // first put rolled back
    expect(idb.peek('slot-0')).toBeUndefined();
  });

  it('a failing open yields ok:false and available=false', async () => {
    const idb = new FakeIndexedDb();
    idb.failOpenWith = domError('UnknownError');
    const s = new IndexedDbSaveStore(idb.factory);
    expect(s.available).toBe(true);
    expect(await s.read('x')).toMatchObject({ ok: false, reason: 'unavailable' });
    expect(s.available).toBe(false);
    expect(await s.write('x', file())).toMatchObject({ ok: false, reason: 'unavailable' });
    expect(await s.delete('x')).toMatchObject({ ok: false, reason: 'unavailable' });
    expect(await s.has('x')).toMatchObject({ ok: false, reason: 'unavailable' });
  });

  it('a factory whose open() throws synchronously becomes unavailable', async () => {
    const s = new IndexedDbSaveStore({
      open() {
        throw domError('SecurityError');
      },
    } as unknown as IDBFactory);
    expect(await s.read('x')).toMatchObject({ ok: false, reason: 'unavailable' });
    expect(s.available).toBe(false);
  });

  it('undefined indexedDB (SSR / private mode) is unavailable without throwing', async () => {
    const s = new IndexedDbSaveStore(undefined);
    expect(s.available).toBe(false);
    expect(await s.read('x')).toMatchObject({ ok: false, reason: 'unavailable' });
    expect(await s.writeMany([{ slot: 'a', value: 1 }])).toMatchObject({ ok: false, reason: 'unavailable' });
  });

  it('accepts a factory function and the default factory resolves to undefined under node', () => {
    const idb = new FakeIndexedDb();
    expect(new IndexedDbSaveStore(() => idb.factory).available).toBe(true);
    expect(new IndexedDbSaveStore(() => undefined).available).toBe(false);
    expect(defaultIndexedDbFactory()).toBeUndefined();
    expect(new IndexedDbSaveStore().available).toBe(false);
  });

  it('transaction abort is reported as aborted and the old value survives', async () => {
    const idb = new FakeIndexedDb();
    const s = new IndexedDbSaveStore(idb.factory);
    await s.write('slot-0', file(1));
    idb.injectAbort();
    expect(await s.write('slot-0', file(2))).toMatchObject({ ok: false, reason: 'aborted' });
    expect(idb.peek('slot-0')).toEqual(file(1));
    // recovers afterwards
    expect((await s.write('slot-0', file(3))).ok).toBe(true);
  });

  it('QuotaExceededError on put is reported as quota and nothing is stored', async () => {
    const idb = new FakeIndexedDb();
    const s = new IndexedDbSaveStore(idb.factory);
    await s.write('slot-0', file(1));
    idb.injectPutError(domError('QuotaExceededError'));
    const r = await s.write('slot-0', file(2));
    expect(r).toMatchObject({ ok: false, reason: 'quota' });
    expect(idb.peek('slot-0')).toEqual(file(1));
  });

  it('other put errors are reported as error', async () => {
    const idb = new FakeIndexedDb();
    const s = new IndexedDbSaveStore(idb.factory);
    idb.injectPutError(domError('ConstraintError'));
    expect(await s.write('a', file())).toMatchObject({ ok: false, reason: 'error' });
  });

  it('a value that is not cloneable fails with error, never throws', async () => {
    const idb = new FakeIndexedDb();
    const s = new IndexedDbSaveStore(idb.factory);
    const bad = file();
    bad.entries.a.data = () => 1;
    expect(await s.write('a', bad)).toMatchObject({ ok: false, reason: 'error' });
    expect(idb.peek('a')).toBeUndefined();
  });

  it('a blocked upgrade yields reason blocked, and is not permanent', async () => {
    const idb = new FakeIndexedDb();
    idb.blockUpgrade = true;
    const s = new IndexedDbSaveStore(idb.factory);
    expect(await s.read('x')).toMatchObject({ ok: false, reason: 'blocked' });
    expect(s.available).toBe(true);
    idb.blockUpgrade = false;
    expect(await s.read('x')).toEqual({ ok: true, value: undefined });
  });

  it('reads back whatever raw value is stored (corrupt string)', async () => {
    const idb = new FakeIndexedDb();
    idb.seed('slot-0', '{not a save');
    const s = new IndexedDbSaveStore(idb.factory);
    expect(await s.read('slot-0')).toEqual({ ok: true, value: '{not a save' });
  });

  it('the upgrade creates the store exactly once', async () => {
    const idb = new FakeIndexedDb();
    const a = new IndexedDbSaveStore(idb.factory);
    await a.write('x', file());
    const b = new IndexedDbSaveStore(idb.factory);
    expect(await b.read('x')).toEqual({ ok: true, value: file() });
    expect(idb.upgrades).toBe(1);
    expect(idb.databases.get('owg')!.stores.has('saves')).toBe(true);
  });

  it('concurrent reads share one open and all succeed', async () => {
    const idb = new FakeIndexedDb();
    idb.seed('a', file(1));
    idb.seed('b', file(2));
    const s = new IndexedDbSaveStore(idb.factory);
    const rs = await Promise.all([s.read('a'), s.read('b'), s.read('a'), s.has('b')]);
    expect(rs.map((r) => r.ok)).toEqual([true, true, true, true]);
    expect(rs[0]).toEqual({ ok: true, value: file(1) });
    expect(rs[1]).toEqual({ ok: true, value: file(2) });
    expect(idb.opens).toBe(1);
  });

  it('a version change closes the db and the next call reopens it', async () => {
    const idb = new FakeIndexedDb();
    const s = new IndexedDbSaveStore(idb.factory);
    await s.write('x', file(1));
    // simulate another tab upgrading: the store's db fires versionchange
    const db = (s as unknown as { db: { onversionchange: (() => void) | null } }).db;
    db.onversionchange?.();
    expect(await s.read('x')).toEqual({ ok: true, value: file(1) });
    expect(idb.opens).toBe(2);
  });

  it('a stale (closed) db handle is reopened transparently', async () => {
    const idb = new FakeIndexedDb();
    const s = new IndexedDbSaveStore(idb.factory);
    await s.write('x', file(1));
    (s as unknown as { db: { close(): void } }).db.close(); // closed without versionchange
    expect(await s.read('x')).toEqual({ ok: true, value: file(1) });
  });

  it('a write in flight when the page hides leaves the old save valid', async () => {
    const idb = new FakeIndexedDb();
    const s = new IndexedDbSaveStore(idb.factory);
    await s.write('slot-0', file(1));
    const hold = idb.hold();
    const pending = s.write('slot-0', file(2));
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(idb.peek('slot-0')).toEqual(file(1)); // not visible until commit
    hold.abort(); // page killed mid-transaction
    expect(await pending).toMatchObject({ ok: false, reason: 'aborted' });
    expect(idb.peek('slot-0')).toEqual(file(1));
    expect(parseOk(idb.peek('slot-0'))).toBe(true);
  });

  it('a held write commits atomically on release', async () => {
    const idb = new FakeIndexedDb();
    const s = new IndexedDbSaveStore(idb.factory);
    const hold = idb.hold();
    const p = s.writeMany([
      { slot: 'a', value: file(1) },
      { slot: 'b', value: file(1) },
    ]);
    await new Promise((r) => setTimeout(r, 0));
    expect(idb.keys()).toEqual([]);
    hold.release();
    expect((await p).ok).toBe(true);
    expect(idb.keys().sort()).toEqual(['a', 'b']);
  });
});

function parseOk(v: unknown): boolean {
  return typeof v === 'object' && v !== null && (v as SaveFile).format === 1;
}

describe('MemorySaveStore', () => {
  it('round-trips, overwrites, deletes and isolates values', async () => {
    const s = new MemorySaveStore();
    expect(s.available).toBe(true);
    const f = file(1);
    await s.write('a', f);
    f.savedAt = 99;
    const r = await s.read('a');
    expect(r.ok && (r.value as SaveFile).savedAt).toBe(1);
    expect(await s.has('a')).toEqual({ ok: true, value: true });
    await s.delete('a');
    expect(await s.read('a')).toEqual({ ok: true, value: undefined });
  });

  it('writeMany is all-or-nothing', async () => {
    const s = new MemorySaveStore();
    const r = await s.writeMany([
      { slot: 'a', value: 1 },
      { slot: 'b', value: () => 1 },
    ]);
    expect(r).toMatchObject({ ok: false, reason: 'error' });
    expect(s.keys()).toEqual([]);
  });
});
