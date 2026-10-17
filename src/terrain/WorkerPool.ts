// Pool of 2-4 Web Workers (TERRAIN.workerCount) that build chunk geometry concurrently using
// chunkGeometry.ts / heightfield.ts. Jobs wait in a queue and are dispatched nearest-first, so
// chunks around the camera appear before distant ones. Reference: Vheissu/emerald-bayou.

import type { ChunkData, ChunkRequest } from './chunkGeometry';
import type { ChunkJobMessage, ChunkResultMessage } from './workers/terrain.worker';

interface Job {
  id: number;
  request: ChunkRequest;
  onDone: (data: ChunkData) => void;
}

export class WorkerPool {
  private readonly workers: Worker[] = [];
  private readonly idle: Worker[] = [];
  private readonly queue: Job[] = [];
  private readonly running = new Map<number, Job>();
  private readonly cancelled = new Set<number>();
  private nextId = 1;
  private priority: (request: ChunkRequest) => number = () => 0;

  constructor(workerCount: number) {
    const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 2 : 2;
    const count = Math.max(1, Math.min(workerCount, 4, Math.max(cores - 1, 1)));
    for (let i = 0; i < count; i++) {
      const worker = new Worker(new URL('./workers/terrain.worker.ts', import.meta.url), {
        type: 'module',
        name: `terrain-${i}`,
      });
      worker.onmessage = (event: MessageEvent<ChunkResultMessage>) => this.onResult(worker, event.data);
      worker.onerror = (event) => console.error('Terrain worker error', event.message);
      this.workers.push(worker);
      this.idle.push(worker);
    }
  }

  get size(): number {
    return this.workers.length;
  }

  /** Jobs queued or running. */
  get pending(): number {
    return this.queue.length + this.running.size;
  }

  /** Lower values are dispatched first. Evaluated when a worker frees up. */
  setPriority(fn: (request: ChunkRequest) => number): void {
    this.priority = fn;
  }

  /** Queues a chunk build; returns a job id usable with `cancel`. */
  request(request: ChunkRequest, onDone: (data: ChunkData) => void): number {
    const id = this.nextId++;
    this.queue.push({ id, request, onDone });
    this.pump();
    return id;
  }

  /** Drops a queued job, or discards its result if a worker is already building it. */
  cancel(id: number): void {
    const index = this.queue.findIndex((job) => job.id === id);
    if (index >= 0) this.queue.splice(index, 1);
    else if (this.running.has(id)) this.cancelled.add(id);
  }

  dispose(): void {
    for (const worker of this.workers) worker.terminate();
    this.workers.length = 0;
    this.idle.length = 0;
    this.queue.length = 0;
    this.running.clear();
  }

  private pump(): void {
    while (this.idle.length > 0 && this.queue.length > 0) {
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
      const worker = this.idle.pop()!;
      this.running.set(job.id, job);
      const message: ChunkJobMessage = { id: job.id, request: job.request };
      worker.postMessage(message);
    }
  }

  private onResult(worker: Worker, message: ChunkResultMessage): void {
    const job = this.running.get(message.id);
    this.running.delete(message.id);
    this.idle.push(worker);
    if (job && !this.cancelled.delete(message.id)) job.onDone(message.data);
    this.pump();
  }
}
