/**
 * Minimal in-repo IndexedDB fake for the save-store tests. Covers open/upgradeneeded, transactions,
 * objectStore get/put/delete, and the success/error/abort/complete callbacks, with atomic
 * transactions (writes are staged and only committed on complete) and failure injection.
 * Events are delivered on microtasks, so fake timers do not stall it.
 */

type Handler = ((ev: FakeEvent) => void) | null;

export interface FakeEvent {
  target: unknown;
  preventDefault(): void;
}

function mkEvent(target: unknown): FakeEvent & { prevented: boolean } {
  const ev = {
    target,
    prevented: false,
    preventDefault() {
      ev.prevented = true;
    },
  };
  return ev;
}

export function domError(name: string, message = name): DOMException {
  return new DOMException(message, name);
}

interface DbRecord {
  version: number;
  stores: Map<string, Map<string, unknown>>;
}

export interface FakeTxLog {
  mode: string;
  stores: string[];
  ops: string[];
  outcome: 'complete' | 'abort' | 'pending';
}

export interface Hold {
  release(): void;
  /** Abort every transaction currently waiting at the commit gate. */
  abort(err?: DOMException | null): void;
}

export class FakeIndexedDb {
  readonly databases = new Map<string, DbRecord>();
  readonly txLog: FakeTxLog[] = [];
  opens = 0;
  upgrades = 0;

  // failure injection
  failOpenWith: DOMException | null = null;
  blockUpgrade = false;
  private putErrors: DOMException[] = [];
  private abortNext: { err: DOMException | null }[] = [];
  private gate: { promise: Promise<void>; release: () => void; held: FakeTx[] } | null = null;

  /** Fail the next `count` put requests with this error (the transaction then aborts). */
  injectPutError(err: DOMException, count = 1): void {
    for (let i = 0; i < count; i++) this.putErrors.push(err);
  }
  /** Abort the next transaction right before it commits (tx.error = err). */
  injectAbort(err: DOMException | null = null): void {
    this.abortNext.push({ err });
  }
  /** Hold commits until released; lets a test observe an in-flight transaction. */
  hold(): Hold {
    let release!: () => void;
    const promise = new Promise<void>((r) => (release = r));
    const gate = { promise, release, held: [] as FakeTx[] };
    this.gate = gate;
    return {
      release: () => {
        if (this.gate === gate) this.gate = null;
        release();
      },
      abort: (err = domError('AbortError')) => {
        for (const tx of gate.held) tx.doAbort(err);
        if (this.gate === gate) this.gate = null;
        release();
      },
    };
  }

  /** Direct access to committed data (bypasses transactions). */
  peek(key: string, db = 'owg', store = 'saves'): unknown {
    return this.databases.get(db)?.stores.get(store)?.get(key);
  }
  seed(key: string, value: unknown, db = 'owg', store = 'saves'): void {
    let rec = this.databases.get(db);
    if (!rec) this.databases.set(db, (rec = { version: 1, stores: new Map() }));
    let s = rec.stores.get(store);
    if (!s) rec.stores.set(store, (s = new Map()));
    s.set(key, value);
  }
  keys(db = 'owg', store = 'saves'): string[] {
    return [...(this.databases.get(db)?.stores.get(store)?.keys() ?? [])];
  }

  takePutError(): DOMException | undefined {
    return this.putErrors.shift();
  }
  takeAbort(): { err: DOMException | null } | undefined {
    return this.abortNext.shift();
  }
  currentGate() {
    return this.gate;
  }

  readonly factory = {
    open: (name: string, version = 1): FakeOpenRequest => new FakeOpenRequest(this, name, version),
  } as unknown as IDBFactory;
}

class FakeOpenRequest {
  onsuccess: Handler = null;
  onerror: Handler = null;
  onblocked: Handler = null;
  onupgradeneeded: Handler = null;
  result: FakeDb | undefined;
  error: DOMException | null = null;
  constructor(owner: FakeIndexedDb, name: string, version: number) {
    queueMicrotask(() => {
      owner.opens++;
      if (owner.failOpenWith) {
        this.error = owner.failOpenWith;
        const ev = mkEvent(this);
        this.onerror?.(ev);
        return;
      }
      let rec = owner.databases.get(name);
      const needUpgrade = !rec || rec.version < version;
      if (needUpgrade && owner.blockUpgrade) {
        this.onblocked?.(mkEvent(this));
        return;
      }
      if (!rec) owner.databases.set(name, (rec = { version: 0, stores: new Map() }));
      const db = new FakeDb(owner, rec);
      this.result = db;
      if (needUpgrade) {
        db.upgrading = true;
        owner.upgrades++;
        this.onupgradeneeded?.(mkEvent(this));
        db.upgrading = false;
        rec.version = version;
      }
      this.onsuccess?.(mkEvent(this));
    });
  }
}

class FakeDb {
  closed = false;
  upgrading = false;
  onversionchange: Handler = null;
  onclose: Handler = null;
  readonly objectStoreNames = {
    contains: (n: string) => this.rec.stores.has(n),
  };
  constructor(
    readonly owner: FakeIndexedDb,
    readonly rec: DbRecord,
  ) {}
  createObjectStore(name: string): void {
    if (!this.upgrading) throw domError('InvalidStateError');
    if (this.rec.stores.has(name)) throw domError('ConstraintError');
    this.rec.stores.set(name, new Map());
  }
  close(): void {
    this.closed = true;
  }
  transaction(names: string | string[], mode: 'readonly' | 'readwrite' = 'readonly'): FakeTx {
    if (this.closed) throw domError('InvalidStateError', 'database closed');
    const list = Array.isArray(names) ? names : [names];
    for (const n of list) if (!this.rec.stores.has(n)) throw domError('NotFoundError', `no store ${n}`);
    return new FakeTx(this, list, mode);
  }
}

class FakeTx {
  oncomplete: Handler = null;
  onabort: Handler = null;
  onerror: Handler = null;
  error: DOMException | null = null;
  finished = false;
  pending = 0;
  staging = new Map<string, { del: boolean; value?: unknown }>();
  private log: FakeTxLog;
  private abortPlan: { err: DOMException | null } | undefined;
  constructor(
    readonly db: FakeDb,
    readonly storeNames: string[],
    readonly mode: string,
  ) {
    this.log = { mode, stores: storeNames, ops: [], outcome: 'pending' };
    db.owner.txLog.push(this.log);
    this.abortPlan = db.owner.takeAbort();
    // a transaction with no requests still completes
    this.maybeComplete();
  }
  objectStore(name: string): FakeStore {
    if (this.finished) throw domError('TransactionInactiveError');
    if (!this.storeNames.includes(name)) throw domError('NotFoundError');
    return new FakeStore(this, name);
  }
  abort(): void {
    if (this.finished) throw domError('InvalidStateError');
    this.doAbort(null);
  }
  doAbort(err: DOMException | null): void {
    if (this.finished) return;
    this.finished = true;
    this.staging.clear();
    this.error = err;
    this.log.outcome = 'abort';
    queueMicrotask(() => this.onabort?.(mkEvent(this)));
  }
  logOp(s: string): void {
    this.log.ops.push(s);
  }
  request<T>(run: () => T, putError?: DOMException): FakeRequest<T> {
    const req = new FakeRequest<T>(this);
    this.pending++;
    queueMicrotask(() => {
      if (this.finished) return;
      if (putError) {
        req.error = putError;
        const ev = mkEvent(req);
        req.onerror?.(ev);
        this.onerror?.(ev);
        this.pending--;
        if (!ev.prevented) this.doAbort(putError);
        return;
      }
      try {
        req.result = run();
      } catch (e) {
        req.error = e as DOMException;
        const ev = mkEvent(req);
        req.onerror?.(ev);
        this.pending--;
        if (!ev.prevented) this.doAbort(e as DOMException);
        return;
      }
      req.onsuccess?.(mkEvent(req));
      this.pending--;
      this.maybeComplete();
    });
    return req;
  }
  maybeComplete(): void {
    queueMicrotask(() => {
      if (this.finished || this.pending > 0) return;
      void this.commit();
    });
  }
  private async commit(): Promise<void> {
    const owner = this.db.owner;
    if (this.abortPlan) {
      this.doAbort(this.abortPlan.err);
      return;
    }
    const gate = owner.currentGate();
    if (gate && this.mode === 'readwrite') {
      gate.held.push(this);
      await gate.promise;
      if (this.finished) return;
    }
    if (this.finished || this.pending > 0) return;
    this.finished = true;
    for (const [name, ops] of this.stagingByStore()) {
      const store = this.db.rec.stores.get(name)!;
      for (const [k, op] of ops) {
        if (op.del) store.delete(k);
        else store.set(k, op.value);
      }
    }
    this.log.outcome = 'complete';
    this.oncomplete?.(mkEvent(this));
  }
  private stagingByStore(): Map<string, Map<string, { del: boolean; value?: unknown }>> {
    const out = new Map<string, Map<string, { del: boolean; value?: unknown }>>();
    for (const [full, op] of this.staging) {
      const i = full.indexOf('\u0000');
      const name = full.slice(0, i);
      const key = full.slice(i + 1);
      if (!out.has(name)) out.set(name, new Map());
      out.get(name)!.set(key, op);
    }
    return out;
  }
}

class FakeRequest<T> {
  onsuccess: Handler = null;
  onerror: Handler = null;
  result: T | undefined;
  error: DOMException | null = null;
  constructor(readonly transaction: FakeTx) {}
}

class FakeStore {
  constructor(
    private readonly tx: FakeTx,
    private readonly name: string,
  ) {}
  private k(key: string): string {
    return `${this.name}\u0000${key}`;
  }
  get(key: string): FakeRequest<unknown> {
    this.tx.logOp(`get:${key}`);
    return this.tx.request(() => {
      const staged = this.tx.staging.get(this.k(key));
      if (staged) return staged.del ? undefined : structuredClone(staged.value);
      const v = this.tx.db.rec.stores.get(this.name)!.get(key);
      return v === undefined ? undefined : structuredClone(v);
    });
  }
  put(value: unknown, key: string): FakeRequest<string> {
    if (this.tx.mode !== 'readwrite') throw domError('ReadOnlyError');
    const cloned = structuredClone(value); // throws DataCloneError like the real thing
    this.tx.logOp(`put:${key}`);
    const injected = this.tx.db.owner.takePutError();
    return this.tx.request(() => {
      this.tx.staging.set(this.k(key), { del: false, value: cloned });
      return key;
    }, injected);
  }
  delete(key: string): FakeRequest<undefined> {
    if (this.tx.mode !== 'readwrite') throw domError('ReadOnlyError');
    this.tx.logOp(`delete:${key}`);
    return this.tx.request(() => {
      this.tx.staging.set(this.k(key), { del: true });
      return undefined;
    });
  }
}
