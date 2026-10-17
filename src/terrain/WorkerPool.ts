// Pool of 2-4 Web Workers (TERRAIN.workerCount) that build chunk geometry concurrently using
// chunkGeometry.ts / heightfield.ts. Jobs wait in a queue and are dispatched nearest-first, so
// chunks around the camera appear before distant ones. Reference: Vheissu/emerald-bayou.
//
// Failure handling: an error reply or a worker `error` event fails the in-flight job, which is
// retried once; a crashed worker is replaced so the queue keeps draining. Replies that are
// malformed, for unknown or cancelled jobs, or arrive after dispose are ignored.

import type { ChunkData, ChunkRequest } from './chunkGeometry';
import { isValidReply, type ChunkJobMessage } from './workerProtocol';

/** The part of the Worker interface the pool uses, so tests can inject a fake. */
export interface WorkerLike {
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: unknown): void;
  terminate(): void;
}

export type WorkerFactory = (index: number) => WorkerLike;

export interface JobCallbacks {
  onDone: (data: ChunkData) => void;
  /** Called when the job failed on its last attempt. */
  onError?: (error: string) => void;
}

/** Attempts per job: the first try plus one retry. */
export const MAX_ATTEMPTS = 2;

interface Job extends JobCallbacks {
  id: number;
  request: ChunkRequest;
  attempts: number;
}

interface Slot {
  worker: WorkerLike;
  job: Job | null;
}

// Vite needs static worker options to bundle the worker.
const defaultFactory: WorkerFactory = () =>
  new Worker(new URL('./workers/terrain.worker.ts', import.meta.url), { type: 'module' });

/** Clamps the configured worker count to 1-4 and to the cores left after the main thread. */
export function resolveWorkerCount(requested: number, cores: number): number {
  return Math.max(1, Math.min(Math.floor(requested) || 1, 4, Math.max(cores - 1, 1)));
}

export class WorkerPool {
  private readonly slots: Slot[] = [];
  private readonly queue: Job[] = [];
  private nextId = 1;
  private disposed = false;
  private warnedMalformed = false;
  private priority: (request: ChunkRequest) => number = () => 0;

  constructor(
    workerCount: number,
    private readonly factory: WorkerFactory = defaultFactory,
    cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 2 : 2,
  ) {
    const count = resolveWorkerCount(workerCount, cores);
    for (let i = 0; i < count; i++) this.slots.push(this.spawn(i));
  }

  get size(): number {
    return this.slots.length;
  }

  /** Jobs queued or running. */
  get pending(): number {
    return this.queue.length + this.slots.filter((slot) => slot.job).length;
  }

  /** Lower values are dispatched first. Evaluated when a worker frees up. */
  setPriority(fn: (request: ChunkRequest) => number): void {
    this.priority = fn;
  }

  /** Queues a chunk build; returns a job id usable with `cancel`. */
  request(request: ChunkRequest, callbacks: JobCallbacks): number {
    if (this.disposed) throw new Error('WorkerPool is disposed');
    const id = this.nextId++;
    this.queue.push({ id, request, attempts: 0, ...callbacks });
    this.pump();
    return id;
  }

  /** Drops a queued job, or discards its result if a worker is already building it. */
  cancel(id: number): void {
    const index = this.queue.findIndex((job) => job.id === id);
    if (index >= 0) {
      this.queue.splice(index, 1);
      return;
    }
    const slot = this.slots.find((s) => s.job?.id === id);
    // The worker keeps building; its reply no longer matches a job and is ignored.
    if (slot) slot.job = null;
    this.pump();
  }

  /** Terminates all workers. Callbacks of queued and in-flight jobs never fire. */
  dispose(): void {
    this.disposed = true;
    for (const slot of this.slots) this.retire(slot.worker);
    this.slots.length = 0;
    this.queue.length = 0;
  }

  private spawn(index: number): Slot {
    const slot: Slot = { worker: this.factory(index), job: null };
    slot.worker.onmessage = (event) => this.onMessage(slot, event.data);
    slot.worker.onerror = (event) => this.onWorkerError(slot, event);
    return slot;
  }

  private retire(worker: WorkerLike): void {
    worker.onmessage = null;
    worker.onerror = null;
    worker.terminate();
  }

  private pump(): void {
    if (this.disposed) return;
    for (const slot of this.slots) {
      if (slot.job || this.queue.length === 0) continue;
      let best = 0;
      let bestScore = Infinity;
      for (let i = 0; i < this.queue.length; i++) {
        const score = this.priority(this.queue[i].request);
        if (score < bestScore) {
          bestScore = score;
          best = i;
        }
      }
      const job = this.queue.splice(best, 1)[0];
      job.attempts++;
      slot.job = job;
      const message: ChunkJobMessage = { id: job.id, request: job.request };
      slot.worker.postMessage(message);
    }
  }

  private onMessage(slot: Slot, message: unknown): void {
    if (this.disposed) return;
    const job = slot.job;
    if (!isValidReply(message)) {
      // Cannot tell which job it answers; fail the slot's current job so the slot never hangs.
      this.warnMalformed(message);
      if (job) this.finish(slot, job, 'malformed reply');
      return;
    }
    // A reply for a cancelled job, or a duplicate: the slot has moved on.
    if (!job || job.id !== message.id) return;
    // Buffers must match the requested chunk shape before a mesh is built from them.
    if (message.ok && !isValidReply(message, job.request.segments)) {
      this.warnMalformed(message);
      this.finish(slot, job, 'reply buffers do not match the requested chunk');
      return;
    }
    this.finish(slot, job, message.ok ? message.data : message.error);
  }

  /** Frees the slot and completes the job with data, or fails / retries it with an error. */
  private finish(slot: Slot, job: Job, result: ChunkData | string): void {
    slot.job = null;
    try {
      if (typeof result === 'string') this.failOrRetry(job, result);
      else job.onDone(result);
    } finally {
      this.pump();
    }
  }

  private warnMalformed(message: unknown): void {
    if (this.warnedMalformed) return;
    this.warnedMalformed = true;
    console.warn('Terrain worker sent a malformed reply; ignoring it', message);
  }

  private onWorkerError(slot: Slot, event: ErrorEvent): void {
    if (this.disposed) return;
    event.preventDefault?.();
    const job = slot.job;
    const index = this.slots.indexOf(slot);
    this.retire(slot.worker);
    if (index >= 0) this.slots[index] = this.spawn(index);
    if (job) this.failOrRetry(job, event.message || 'terrain worker crashed');
    this.pump();
  }

  private failOrRetry(job: Job, error: string): void {
    if (job.attempts < MAX_ATTEMPTS) {
      this.queue.push(job);
      return;
    }
    job.onError?.(error);
  }
}
