import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { chunkVertexCount, type ChunkData, type ChunkRequest } from './chunkGeometry';
import type { ChunkJobMessage } from './workerProtocol';
import { MAX_ATTEMPTS, WorkerPool, resolveWorkerCount, type WorkerLike } from './WorkerPool';

class FakeWorker implements WorkerLike {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  posted: ChunkJobMessage[] = [];
  terminated = false;
  postMessage(message: unknown): void {
    this.posted.push(message as ChunkJobMessage);
  }
  terminate(): void {
    this.terminated = true;
  }
  /** Delivers a reply through the handler the pool installed. */
  reply(data: unknown): void {
    this.onmessage?.({ data } as MessageEvent);
  }
  get last(): ChunkJobMessage {
    return this.posted[this.posted.length - 1];
  }
}

function chunk(segments: number): ChunkData {
  const n = chunkVertexCount(segments) * 3;
  return { positions: new Float32Array(n), normals: new Float32Array(n), colors: new Float32Array(n), minY: 0, maxY: 1 };
}

function req(centerX: number, segments = 2): ChunkRequest {
  return { centerX, centerZ: 0, size: 100, segments, skirtDepth: 2 };
}

const ok = (id: number, segments = 2) => ({ id, ok: true, data: chunk(segments) });

function makePool(count: number, cores = 16) {
  const workers: FakeWorker[] = [];
  const factory = vi.fn((_index: number) => {
    const w = new FakeWorker();
    workers.push(w);
    return w;
  });
  const pool = new WorkerPool(count, factory, cores);
  return { pool, workers, factory };
}

let warn: MockInstance;
beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('resolveWorkerCount', () => {
  it('clamps to 1-4 and to cores - 1', () => {
    expect(resolveWorkerCount(2, 8)).toBe(2);
    expect(resolveWorkerCount(8, 16)).toBe(4);
    expect(resolveWorkerCount(4, 2)).toBe(1);
    expect(resolveWorkerCount(0, 8)).toBe(1);
    expect(resolveWorkerCount(-3, 8)).toBe(1);
    expect(resolveWorkerCount(NaN, 8)).toBe(1);
    expect(resolveWorkerCount(2.9, 8)).toBe(2);
    expect(resolveWorkerCount(4, 1)).toBe(1);
    expect(resolveWorkerCount(4, 0)).toBe(1);
  });

  it('spawns that many workers', () => {
    expect(makePool(2, 8).workers).toHaveLength(2);
    expect(makePool(9, 16).workers).toHaveLength(4);
    expect(makePool(4, 2).workers).toHaveLength(1);
    expect(makePool(2, 8).pool.size).toBe(2);
  });
});

describe('dispatch', () => {
  it('posts at most one job per worker and queues the rest', () => {
    const { pool, workers } = makePool(2);
    for (let i = 0; i < 5; i++) pool.request(req(i), { onDone: () => {} });
    expect(workers[0].posted).toHaveLength(1);
    expect(workers[1].posted).toHaveLength(1);
    expect(pool.pending).toBe(5);
  });

  it('dispatches the lowest priority score first when a worker frees up', () => {
    const { pool, workers } = makePool(1);
    pool.setPriority((r) => r.centerX);
    const done: number[] = [];
    for (const x of [9, 5, 1, 3]) pool.request(req(x), { onDone: () => done.push(x) });
    // 9 went out immediately (nothing else was queued); then 1, 3, 5 in score order.
    const w = workers[0];
    for (let i = 0; i < 4; i++) w.reply(ok(w.last.id));
    expect(w.posted.map((m) => m.request.centerX)).toEqual([9, 1, 3, 5]);
    expect(done).toEqual([9, 1, 3, 5]);
    expect(pool.pending).toBe(0);
  });

  it('delivers data to the right job callback', () => {
    const { pool, workers } = makePool(2);
    const got: Record<string, ChunkData> = {};
    pool.request(req(1), { onDone: (d) => (got.a = d) });
    pool.request(req(2), { onDone: (d) => (got.b = d) });
    const dataB = chunk(2);
    workers[1].reply({ id: workers[1].last.id, ok: true, data: dataB });
    expect(got.b).toBe(dataB);
    expect(got.a).toBeUndefined();
  });
});

describe('cancel', () => {
  it('never posts a cancelled queued job or calls its callbacks', () => {
    const { pool, workers } = makePool(1);
    const onDone = vi.fn();
    const onError = vi.fn();
    pool.request(req(1), { onDone: () => {} });
    const id = pool.request(req(2), { onDone, onError });
    pool.cancel(id);
    workers[0].reply(ok(workers[0].last.id));
    expect(workers[0].posted).toHaveLength(1);
    expect(onDone).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(pool.pending).toBe(0);
  });

  it('ignores the late reply of a running cancelled job and frees the slot for the next job', () => {
    const { pool, workers } = makePool(1);
    const aDone = vi.fn();
    const bDone = vi.fn();
    const a = pool.request(req(1), { onDone: aDone });
    pool.request(req(2), { onDone: bDone });
    pool.cancel(a);
    const w = workers[0];
    expect(w.posted).toHaveLength(2);
    expect(w.last.request.centerX).toBe(2);

    // Late reply for the cancelled job: ignored, B untouched and still running.
    w.reply(ok(a));
    expect(aDone).not.toHaveBeenCalled();
    expect(bDone).not.toHaveBeenCalled();
    expect(pool.pending).toBe(1);

    w.reply(ok(w.last.id));
    expect(bDone).toHaveBeenCalledOnce();
  });

  it('is a no-op for unknown ids and for jobs that already finished', () => {
    const { pool, workers } = makePool(1);
    const id = pool.request(req(1), { onDone: () => {} });
    workers[0].reply(ok(id));
    expect(() => {
      pool.cancel(id);
      pool.cancel(12345);
    }).not.toThrow();
  });
});

describe('bad replies', () => {
  it('malformed reply: no throw, warns once, job retried then failed', () => {
    const { pool, workers } = makePool(1);
    const onError = vi.fn();
    const onDone = vi.fn();
    pool.request(req(1), { onDone, onError });
    const w = workers[0];
    expect(() => w.reply({ nonsense: true })).not.toThrow();
    expect(w.posted).toHaveLength(2); // retried
    expect(onError).not.toHaveBeenCalled();
    expect(() => w.reply('garbage')).not.toThrow();
    expect(onError).toHaveBeenCalledOnce();
    expect(onDone).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(pool.pending).toBe(0);
  });

  it('malformed replies on an idle slot are harmless', () => {
    const { pool, workers } = makePool(1);
    expect(() => {
      workers[0].reply(null);
      workers[0].reply(undefined);
      workers[0].reply({ id: 'x' });
    }).not.toThrow();
    expect(warn.mock.calls.length).toBeLessThanOrEqual(1);
    // The pool still works afterwards.
    const onDone = vi.fn();
    pool.request(req(1), { onDone });
    workers[0].reply(ok(workers[0].last.id));
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('unknown id: ignored without disturbing the running job', () => {
    const { pool, workers } = makePool(1);
    const onDone = vi.fn();
    const onError = vi.fn();
    pool.request(req(1), { onDone, onError });
    const w = workers[0];
    expect(() => w.reply(ok(9999))).not.toThrow();
    expect(() => w.reply({ id: 9999, ok: false, error: 'x' })).not.toThrow();
    expect(onDone).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(pool.pending).toBe(1);
    // The real reply still completes it, so the pool does not hang.
    w.reply(ok(w.last.id));
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('duplicate reply: second delivery is ignored and does not complete the next job', () => {
    const { pool, workers } = makePool(1);
    const aDone = vi.fn();
    const bDone = vi.fn();
    pool.request(req(1), { onDone: aDone });
    pool.request(req(2), { onDone: bDone });
    const w = workers[0];
    const firstId = w.last.id;
    w.reply(ok(firstId));
    expect(aDone).toHaveBeenCalledOnce();
    expect(w.posted).toHaveLength(2);
    expect(() => w.reply(ok(firstId))).not.toThrow();
    expect(aDone).toHaveBeenCalledOnce();
    expect(bDone).not.toHaveBeenCalled();
    w.reply(ok(w.last.id));
    expect(bDone).toHaveBeenCalledOnce();
  });

  it('wrong-length buffers: no throw, warns once, job retried then failed', () => {
    const { pool, workers } = makePool(1);
    const onError = vi.fn();
    const onDone = vi.fn();
    pool.request(req(1, 4), { onDone, onError });
    const w = workers[0];
    // Valid shape but for 2 segments, while 4 were requested.
    expect(() => w.reply(ok(w.last.id, 2))).not.toThrow();
    expect(w.posted).toHaveLength(2);
    expect(() => w.reply(ok(w.last.id, 2))).not.toThrow();
    expect(onDone).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('a retried job can succeed on the second attempt', () => {
    const { pool, workers } = makePool(1);
    const onDone = vi.fn();
    const onError = vi.fn();
    pool.request(req(1), { onDone, onError });
    const w = workers[0];
    w.reply({ id: 'bad' });
    w.reply(ok(w.last.id));
    expect(onDone).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
  });

  it('ok:false is retried once, then onError receives the message', () => {
    const { pool, workers } = makePool(1);
    const onError = vi.fn();
    pool.request(req(1), { onDone: () => {}, onError });
    const w = workers[0];
    w.reply({ id: w.last.id, ok: false, error: 'boom' });
    expect(w.posted).toHaveLength(MAX_ATTEMPTS);
    expect(w.posted[0].id).toBe(w.posted[1].id);
    expect(onError).not.toHaveBeenCalled();
    w.reply({ id: w.last.id, ok: false, error: 'boom again' });
    expect(w.posted).toHaveLength(MAX_ATTEMPTS);
    expect(onError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith('boom again');
    expect(pool.pending).toBe(0);
  });

  it('a failing job without onError does not throw and the queue keeps draining', () => {
    const { pool, workers } = makePool(1);
    pool.setPriority((r) => r.centerX); // the retried job (centerX 0) goes ahead of the queued one
    const next = vi.fn();
    pool.request(req(0), { onDone: () => {} });
    pool.request(req(2), { onDone: next });
    const w = workers[0];
    w.reply({ id: w.last.id, ok: false, error: 'e' });
    expect(w.last.request.centerX).toBe(0);
    expect(() => w.reply({ id: w.last.id, ok: false, error: 'e' })).not.toThrow();
    expect(w.last.request.centerX).toBe(2);
    w.reply(ok(w.last.id));
    expect(next).toHaveBeenCalledOnce();
    expect(pool.pending).toBe(0);
  });
});

describe('worker crash', () => {
  const crash = (w: FakeWorker, message = 'crash') => {
    const preventDefault = vi.fn();
    w.onerror?.({ message, preventDefault } as unknown as ErrorEvent);
    return preventDefault;
  };

  it('terminates the crashed worker, spawns a replacement and retries the in-flight job', () => {
    const { pool, workers, factory } = makePool(1);
    const onDone = vi.fn();
    pool.setPriority((r) => r.centerX); // retried job (centerX 1) goes ahead of the queued one
    pool.request(req(1), { onDone });
    pool.request(req(2), { onDone: () => {} });
    const old = workers[0];
    const prevented = crash(old);
    expect(prevented).toHaveBeenCalled();
    expect(old.terminated).toBe(true);
    expect(old.onmessage).toBeNull();
    expect(old.onerror).toBeNull();
    expect(factory).toHaveBeenCalledTimes(2);
    const fresh = workers[1];
    expect(fresh.posted).toHaveLength(1);
    expect(fresh.last.request.centerX).toBe(1);
    expect(fresh.posted[0].id).toBe(old.posted[0].id);

    fresh.reply(ok(fresh.last.id));
    expect(onDone).toHaveBeenCalledOnce();
    // The queue keeps draining on the new worker.
    expect(fresh.last.request.centerX).toBe(2);
  });

  it('reports the crash message after the retry also crashes, and uses a default message', () => {
    const { pool, workers } = makePool(1);
    const onError = vi.fn();
    pool.request(req(1), { onDone: () => {}, onError });
    crash(workers[0], '');
    expect(onError).not.toHaveBeenCalled();
    crash(workers[1], '');
    expect(onError).toHaveBeenCalledWith('terrain worker crashed');
    expect(workers).toHaveLength(3);
    // Still alive: a new job runs on the third worker.
    const onDone = vi.fn();
    pool.request(req(3), { onDone });
    workers[2].reply(ok(workers[2].last.id));
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('crash of an idle worker just replaces it', () => {
    const { pool, workers, factory } = makePool(2);
    expect(() => crash(workers[1])).not.toThrow();
    expect(workers[1].terminated).toBe(true);
    expect(factory).toHaveBeenCalledTimes(3);
    const onDone = vi.fn();
    pool.request(req(1), { onDone });
    pool.request(req(2), { onDone });
    expect(workers[2].posted).toHaveLength(1);
  });
});

describe('callbacks that throw', () => {
  it('onDone throwing does not stop later jobs from being dispatched', () => {
    const { pool, workers } = makePool(1);
    pool.request(req(1), {
      onDone: () => {
        throw new Error('consumer bug');
      },
    });
    const next = vi.fn();
    pool.request(req(2), { onDone: next });
    const w = workers[0];
    expect(() => w.reply(ok(w.last.id))).toThrow('consumer bug');
    expect(w.posted).toHaveLength(2);
    w.reply(ok(w.last.id));
    expect(next).toHaveBeenCalledOnce();
  });

  it('onError throwing does not stop later jobs from being dispatched', () => {
    const { pool, workers } = makePool(1);
    pool.setPriority((r) => r.centerX);
    pool.request(req(0), {
      onDone: () => {},
      onError: () => {
        throw new Error('consumer bug');
      },
    });
    pool.request(req(2), { onDone: () => {} });
    const w = workers[0];
    w.reply({ id: w.last.id, ok: false, error: 'x' });
    expect(w.last.request.centerX).toBe(0);
    expect(() => w.reply({ id: w.last.id, ok: false, error: 'x' })).toThrow('consumer bug');
    expect(w.last.request.centerX).toBe(2);
  });
});

describe('dispose', () => {
  it('terminates all workers, nulls handlers, ignores later replies and rejects new requests', () => {
    const { pool, workers } = makePool(3);
    const onDone = vi.fn();
    const onError = vi.fn();
    for (let i = 0; i < 6; i++) pool.request(req(i), { onDone, onError });
    const handlers = workers.map((w) => ({ m: w.onmessage, e: w.onerror }));
    pool.dispose();
    for (const w of workers) {
      expect(w.terminated).toBe(true);
      expect(w.onmessage).toBeNull();
      expect(w.onerror).toBeNull();
    }
    // Stale handlers (e.g. a message already queued by the browser) must do nothing.
    handlers.forEach((h, i) => {
      h.m?.({ data: ok(workers[i].posted[0].id) } as MessageEvent);
      h.e?.({ message: 'late', preventDefault() {} } as unknown as ErrorEvent);
    });
    expect(onDone).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(workers).toHaveLength(3); // no replacement workers spawned
    expect(pool.pending).toBe(0);
    expect(() => pool.request(req(1), { onDone })).toThrow();
  });

  it('is idempotent and cancel after dispose is safe', () => {
    const { pool } = makePool(1);
    const id = pool.request(req(1), { onDone: () => {} });
    pool.dispose();
    expect(() => {
      pool.dispose();
      pool.cancel(id);
    }).not.toThrow();
  });
});
