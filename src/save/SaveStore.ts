import type { SaveFile } from './SaveSchema';

export type StoreFailureReason = 'unavailable' | 'quota' | 'blocked' | 'aborted' | 'error';
export type StoreResult<T> = { ok: true; value: T } | { ok: false; reason: StoreFailureReason; error?: unknown };

export interface SaveStore {
  /** Resolves with the raw stored value, or undefined when the slot is empty. Never rejects. */
  read(slot: string): Promise<StoreResult<unknown | undefined>>;
  write(slot: string, file: SaveFile): Promise<StoreResult<void>>;
  /** All items are written in ONE transaction: either every item lands or none does. */
  writeMany(items: { slot: string; value: unknown }[]): Promise<StoreResult<void>>;
  delete(slot: string): Promise<StoreResult<void>>;
  has(slot: string): Promise<StoreResult<boolean>>;
  /** False when the backing storage cannot be used at all (callers should fall back). */
  readonly available: boolean;
}

export const DB_NAME = 'owg';
export const STORE_NAME = 'saves';
export const DB_VERSION = 1;

const errName = (e: unknown): string =>
  typeof e === 'object' && e !== null && 'name' in e ? String((e as { name: unknown }).name) : '';

function isQuota(e: unknown): boolean {
  const n = errName(e);
  return n === 'QuotaExceededError' || n === 'NS_ERROR_DOM_QUOTA_REACHED' || (e as { code?: unknown })?.code === 22;
}

function fail(e: unknown, fallback: StoreFailureReason): { ok: false; reason: StoreFailureReason; error?: unknown } {
  if (isQuota(e)) return { ok: false, reason: 'quota', error: e };
  const n = errName(e);
  if (fallback === 'aborted' && n && n !== 'AbortError') return { ok: false, reason: 'error', error: e };
  return { ok: false, reason: fallback, error: e };
}

export function defaultIndexedDbFactory(): IDBFactory | undefined {
  try {
    return typeof indexedDB === 'undefined' ? undefined : indexedDB;
  } catch {
    return undefined; // SecurityError (blocked storage)
  }
}

export class IndexedDbSaveStore implements SaveStore {
  private db: IDBDatabase | null = null;
  private opening: Promise<StoreResult<IDBDatabase>> | null = null;
  private broken = false;
  private readonly factory: IDBFactory | undefined;

  constructor(factory: IDBFactory | undefined | (() => IDBFactory | undefined) = defaultIndexedDbFactory) {
    this.factory = typeof factory === 'function' ? factory() : factory;
  }

  get available(): boolean {
    return this.factory !== undefined && !this.broken;
  }

  private open(): Promise<StoreResult<IDBDatabase>> {
    if (this.db) return Promise.resolve({ ok: true, value: this.db });
    const factory = this.factory;
    if (!factory || this.broken) return Promise.resolve({ ok: false, reason: 'unavailable' });
    if (this.opening) return this.opening;
    const p = new Promise<StoreResult<IDBDatabase>>((resolve) => {
      let req: IDBOpenDBRequest;
      try {
        req = factory.open(DB_NAME, DB_VERSION);
      } catch (e) {
        this.broken = true;
        resolve({ ok: false, reason: 'unavailable', error: e });
        return;
      }
      req.onupgradeneeded = () => {
        try {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
        } catch (e) {
          this.broken = true;
          resolve({ ok: false, reason: 'unavailable', error: e });
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => {
          db.close();
          if (this.db === db) this.db = null;
        };
        this.db = db;
        resolve({ ok: true, value: db });
      };
      req.onerror = () => {
        this.broken = true;
        resolve(fail(req.error, 'unavailable'));
      };
      req.onblocked = () => resolve({ ok: false, reason: 'blocked' });
    });
    this.opening = p;
    void p.then(() => {
      if (this.opening === p) this.opening = null;
    });
    return p;
  }

  private async transact<T>(
    mode: IDBTransactionMode,
    body: (os: IDBObjectStore, track: (r: IDBRequest) => void) => () => T,
  ): Promise<StoreResult<T>> {
    try {
      for (let attempt = 0; ; attempt++) {
        const opened = await this.open();
        if (!opened.ok) return opened;
        const db = opened.value;
        const res = await new Promise<StoreResult<T> | 'stale'>((resolve) => {
          let tx: IDBTransaction | undefined;
          let reqError: unknown;
          try {
            tx = db.transaction(STORE_NAME, mode);
            const t = tx;
            let result: () => T = () => undefined as T;
            t.oncomplete = () => {
              try {
                resolve({ ok: true, value: result() });
              } catch (e) {
                resolve(fail(e, 'error'));
              }
            };
            t.onabort = () => resolve(fail(t.error ?? reqError, 'aborted'));
            t.onerror = () => undefined; // an abort follows unless prevented
            result = body(t.objectStore(STORE_NAME), (r) => {
              r.onerror = () => {
                reqError = r.error;
              };
            });
          } catch (e) {
            if (errName(e) === 'InvalidStateError' && !tx) {
              resolve('stale');
              return;
            }
            try {
              tx?.abort();
            } catch {
              /* already finished */
            }
            resolve(fail(e, 'error'));
          }
        });
        if (res === 'stale') {
          if (this.db === db) this.db = null;
          if (attempt === 0) continue;
          return { ok: false, reason: 'error' };
        }
        return res;
      }
    } catch (e) {
      return fail(e, 'error');
    }
  }

  read(slot: string): Promise<StoreResult<unknown | undefined>> {
    return this.transact('readonly', (os, track) => {
      const r = os.get(slot);
      track(r);
      return () => r.result as unknown;
    });
  }

  write(slot: string, file: SaveFile): Promise<StoreResult<void>> {
    return this.writeMany([{ slot, value: file }]);
  }

  writeMany(items: { slot: string; value: unknown }[]): Promise<StoreResult<void>> {
    if (items.length === 0) return Promise.resolve({ ok: true, value: undefined });
    return this.transact('readwrite', (os, track) => {
      for (const it of items) track(os.put(it.value, it.slot));
      return () => undefined;
    });
  }

  delete(slot: string): Promise<StoreResult<void>> {
    return this.transact('readwrite', (os, track) => {
      track(os.delete(slot));
      return () => undefined;
    });
  }

  async has(slot: string): Promise<StoreResult<boolean>> {
    const r = await this.read(slot);
    return r.ok ? { ok: true, value: r.value !== undefined } : r;
  }
}

/** In-memory fallback; also used by tests. Values are structured-cloned like IndexedDB does. */
export class MemorySaveStore implements SaveStore {
  readonly available = true;
  private readonly data = new Map<string, unknown>();

  async read(slot: string): Promise<StoreResult<unknown | undefined>> {
    try {
      const v = this.data.get(slot);
      return { ok: true, value: v === undefined ? undefined : structuredClone(v) };
    } catch (e) {
      return fail(e, 'error');
    }
  }
  write(slot: string, file: SaveFile): Promise<StoreResult<void>> {
    return this.writeMany([{ slot, value: file }]);
  }
  async writeMany(items: { slot: string; value: unknown }[]): Promise<StoreResult<void>> {
    try {
      const cloned = items.map((i) => [i.slot, structuredClone(i.value)] as const); // all-or-nothing
      for (const [k, v] of cloned) this.data.set(k, v);
      return { ok: true, value: undefined };
    } catch (e) {
      return fail(e, 'error');
    }
  }
  async delete(slot: string): Promise<StoreResult<void>> {
    this.data.delete(slot);
    return { ok: true, value: undefined };
  }
  async has(slot: string): Promise<StoreResult<boolean>> {
    return { ok: true, value: this.data.has(slot) };
  }
  /** Test helper. */
  keys(): string[] {
    return [...this.data.keys()];
  }
}
