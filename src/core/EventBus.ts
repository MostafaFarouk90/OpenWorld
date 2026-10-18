/** Logged when a listener throws; injectable so tests can assert on it. */
export type ErrorReporter = (message: string, err?: unknown) => void;

export const MAX_EVENTS_PER_FLUSH = 1000;

type Listener<P> = (payload: P) => void;
type AnyListener<M> = <K extends keyof M>(type: K, payload: M[K]) => void;

interface Entry {
  fn: (payload: unknown) => void;
  once: boolean;
  live: boolean;
}

/**
 * Typed synchronous event bus. Dispatch is never re-entrant: an event emitted while another is being
 * delivered is queued and delivered after every listener has seen the current one (FIFO).
 * Listener failures are isolated; a flush of more than MAX_EVENTS_PER_FLUSH events is cut off as a loop.
 */
export class EventBus<M extends object> {
  private readonly listeners = new Map<keyof M, Entry[]>();
  private readonly anyListeners: { fn: AnyListener<M>; live: boolean }[] = [];
  private readonly queue: [keyof M, unknown][] = [];
  private dispatching = false;
  private batchDepth = 0;
  private batched: [keyof M, unknown][] = [];

  constructor(private readonly report: ErrorReporter = (m, e) => console.error(m, e)) {}

  on<K extends keyof M>(type: K, listener: Listener<M[K]>): () => void {
    return this.add(type, listener as (p: unknown) => void, false);
  }

  once<K extends keyof M>(type: K, listener: Listener<M[K]>): () => void {
    return this.add(type, listener as (p: unknown) => void, true);
  }

  /** Every event, after the typed listeners of that event. */
  onAny(listener: AnyListener<M>): () => void {
    const entry = { fn: listener, live: true };
    this.anyListeners.push(entry);
    return () => {
      if (!entry.live) return;
      entry.live = false;
      this.anyListeners.splice(this.anyListeners.indexOf(entry), 1);
    };
  }

  listenerCount(type: keyof M): number {
    return this.listeners.get(type)?.length ?? 0;
  }

  emit<K extends keyof M>(type: K, payload: M[K]): void {
    if (this.batchDepth > 0) {
      this.batched.push([type, payload]);
      return;
    }
    this.queue.push([type, payload]);
    this.flush();
  }

  /**
   * Holds every event emitted inside `fn` and delivers them together when it returns (also when it
   * throws), before any event their listeners emit. Nested batches join the outermost one.
   */
  batch<T>(fn: () => T): T {
    this.batchDepth++;
    try {
      return fn();
    } finally {
      this.batchDepth--;
      if (this.batchDepth === 0) {
        const events = this.batched;
        this.batched = [];
        this.queue.push(...events);
        this.flush();
      }
    }
  }

  private add(type: keyof M, fn: (p: unknown) => void, once: boolean): () => void {
    const entry: Entry = { fn, once, live: true };
    let list = this.listeners.get(type);
    if (!list) this.listeners.set(type, (list = []));
    list.push(entry);
    return () => this.remove(type, entry);
  }

  private remove(type: keyof M, entry: Entry): void {
    if (!entry.live) return;
    entry.live = false;
    const list = this.listeners.get(type);
    if (!list) return;
    const i = list.indexOf(entry);
    if (i >= 0) list.splice(i, 1);
  }

  private flush(): void {
    if (this.dispatching) return;
    this.dispatching = true;
    let delivered = 0;
    try {
      while (this.queue.length > 0) {
        if (delivered >= MAX_EVENTS_PER_FLUSH) {
          const dropped = this.queue.length;
          this.queue.length = 0;
          this.report(`EventBus: more than ${MAX_EVENTS_PER_FLUSH} events in one flush; dropped ${dropped} (event loop?)`);
          break;
        }
        const [type, payload] = this.queue.shift()!;
        delivered++;
        this.deliver(type, payload);
      }
    } finally {
      this.dispatching = false;
    }
  }

  private deliver(type: keyof M, payload: unknown): void {
    // Snapshot: listeners added now wait for the next event; removed ones are skipped via `live`.
    const list = this.listeners.get(type);
    if (list) {
      for (const entry of list.slice()) {
        if (!entry.live) continue;
        if (entry.once) this.remove(type, entry);
        try {
          entry.fn(payload);
        } catch (err) {
          this.safeReport(`EventBus: listener for "${String(type)}" failed`, err);
        }
      }
    }
    for (const entry of this.anyListeners.slice()) {
      if (!entry.live) continue;
      try {
        entry.fn(type, payload as M[keyof M]);
      } catch (err) {
        this.safeReport(`EventBus: onAny listener failed on "${String(type)}"`, err);
      }
    }
  }

  private safeReport(message: string, err: unknown): void {
    try {
      this.report(message, err);
    } catch {
      /* the reporter must never break delivery */
    }
  }
}
