import type RAPIER_API from '@dimforge/rapier3d';
import { TERRAIN, WORLD } from '../config/constants';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import { heightAt as defaultHeightAt } from '../terrain/heightfield';

export interface TerrainCollidersOptions {
  /** Edge length of each square patch in metres. */
  patchSize?: number;
  /** Cells per patch edge. */
  cells?: number;
  /** Patches kept around the player's patch in each direction (1 = a 3 x 3 block). */
  radius?: number;
  /** Milliseconds each `update` may spend building queued patches (at least one column is always built). */
  budgetMs?: number;
  /** Clock in milliseconds; injectable for tests. */
  now?: () => number;
  /** Terrain height sampler. */
  heightAt?: (x: number, z: number) => number;
}

interface PatchJob {
  key: string;
  cx: number;
  cz: number;
  heights: Float32Array;
  /** Next column to fill; the patch is complete when it reaches cells + 1. */
  col: number;
}

/**
 * Keeps Rapier heightfield colliders on the same patch grid as `ColliderPatches` (key `"ix,iz"`,
 * patch ix = floor(x / size)) but spreads the sampling cost over ticks: the patch under the player
 * is built synchronously, the rest are queued nearest-first and built column by column under a
 * per-update time budget. Heightfields match `buildPhysicsHeightfield` exactly.
 */
export class TerrainColliders {
  readonly patchSize: number;
  readonly cells: number;
  readonly radius: number;
  readonly budgetMs: number;

  private readonly now: () => number;
  private readonly sample: (x: number, z: number) => number;
  private readonly colliders = new Map<string, RAPIER_API.Collider>();
  private readonly jobs = new Map<string, PatchJob>();
  private queue: string[] = [];
  private playerKey: string | null = null;
  private disposed = false;
  private updates = 0;
  /** Keys whose collider failed to add: retried after an exponential backoff, warned about once. */
  private readonly failures = new Map<string, { count: number; retryAt: number }>();

  constructor(
    private readonly physics: PhysicsWorld,
    options: TerrainCollidersOptions = {},
  ) {
    this.patchSize = options.patchSize ?? TERRAIN.colliderPatchSize;
    this.cells = options.cells ?? TERRAIN.colliderPatchCells;
    this.radius = options.radius ?? TERRAIN.colliderPatchRadius;
    this.budgetMs = options.budgetMs ?? WORLD.colliderBuildBudgetMs;
    this.now = options.now ?? (() => performance.now());
    this.sample = options.heightAt ?? defaultHeightAt;
    if (!Number.isFinite(this.patchSize) || this.patchSize <= 0) {
      throw new RangeError(`Patch size must be a positive finite number, got ${this.patchSize}`);
    }
    if (!Number.isInteger(this.cells) || this.cells < 1) {
      throw new RangeError(`Patch cells must be a positive integer, got ${this.cells}`);
    }
    if (!Number.isInteger(this.radius) || this.radius < 0) {
      throw new RangeError(`Patch radius must be a non-negative integer, got ${this.radius}`);
    }
    if (!Number.isFinite(this.budgetMs) || this.budgetMs < 0) {
      throw new RangeError(`Budget must be a finite number >= 0, got ${this.budgetMs}`);
    }
  }

  /** Keys with a registered collider. */
  get keys(): string[] {
    return [...this.colliders.keys()];
  }

  get count(): number {
    return this.colliders.size;
  }

  /** Keys waiting to be built and added, head first. */
  get pendingKeys(): string[] {
    return [...this.queue];
  }

  colliderFor(key: string): RAPIER_API.Collider | undefined {
    return this.colliders.get(key);
  }

  /**
   * Call once per fixed tick before `physics.step()`. Removes colliders that left the wanted block,
   * builds the player's patch immediately, and builds queued patches within the time budget.
   * Non-finite positions change nothing; a patch that fails to add is logged once and retried after
   * a growing number of updates.
   */
  update(x: number, z: number): void {
    if (this.disposed || !Number.isFinite(x) || !Number.isFinite(z)) return;
    this.updates++;

    const px = Math.floor(x / this.patchSize);
    const pz = Math.floor(z / this.patchSize);
    const playerKey = `${px},${pz}`;
    // Steady state: same patch, nothing to build or retry.
    if (playerKey === this.playerKey && this.queue.length === 0 && this.failures.size === 0) return;
    const wanted = new Set<string>();
    for (let iz = pz - this.radius; iz <= pz + this.radius; iz++) {
      for (let ix = px - this.radius; ix <= px + this.radius; ix++) wanted.add(`${ix},${iz}`);
    }

    for (const [key, collider] of this.colliders) {
      if (wanted.has(key)) continue;
      this.physics.removeCollider(collider);
      this.colliders.delete(key);
    }
    for (const key of this.jobs.keys()) {
      if (!wanted.has(key)) this.jobs.delete(key);
    }
    for (const key of this.failures.keys()) {
      if (!wanted.has(key)) this.failures.delete(key);
    }
    this.queue = this.queue.filter((key) => wanted.has(key));

    const queued = new Set(this.queue);
    for (const key of wanted) {
      if (!this.colliders.has(key) && !queued.has(key) && !this.backingOff(key)) this.queue.push(key);
    }
    if (playerKey !== this.playerKey || this.queue.length > queued.size) {
      this.playerKey = playerKey;
      this.sortQueue(x, z);
    }

    if (!this.colliders.has(playerKey) && !this.backingOff(playerKey)) {
      const i = this.queue.indexOf(playerKey);
      if (i >= 0) this.queue.splice(i, 1);
      const job = this.jobFor(playerKey);
      while (job.col <= this.cells) this.fillColumn(job);
      if (!this.finish(job)) return;
    }
    this.buildQueued();
  }

  /** Removes every collider and clears the queue. Idempotent; later updates do nothing. */
  dispose(): void {
    this.disposed = true;
    this.failures.clear();
    for (const collider of this.colliders.values()) this.physics.removeCollider(collider);
    this.colliders.clear();
    this.jobs.clear();
    this.queue = [];
  }

  private sortQueue(x: number, z: number): void {
    const size = this.patchSize;
    const dist = new Map<string, number>();
    for (const key of this.queue) {
      const [ix, iz] = parseKey(key);
      dist.set(key, Math.hypot((ix + 0.5) * size - x, (iz + 0.5) * size - z));
    }
    this.queue.sort((a, b) => dist.get(a)! - dist.get(b)!);
  }

  private buildQueued(): void {
    const start = this.now();
    while (this.queue.length > 0) {
      const job = this.jobFor(this.queue[0]);
      this.fillColumn(job);
      if (job.col > this.cells) {
        this.queue.shift();
        if (!this.finish(job)) return;
      }
      if (this.now() - start >= this.budgetMs) return;
    }
  }

  private jobFor(key: string): PatchJob {
    let job = this.jobs.get(key);
    if (!job) {
      const [ix, iz] = parseKey(key);
      job = {
        key,
        cx: (ix + 0.5) * this.patchSize,
        cz: (iz + 0.5) * this.patchSize,
        heights: new Float32Array((this.cells + 1) * (this.cells + 1)),
        col: 0,
      };
      this.jobs.set(key, job);
    }
    return job;
  }

  /** Samples one column (fixed x, every row) in the layout of `buildPhysicsHeightfield`. */
  private fillColumn(job: PatchJob): void {
    const { cells, patchSize } = this;
    const step = patchSize / cells;
    const half = patchSize / 2;
    const stride = cells + 1;
    const x = job.cx - half + job.col * step;
    const z0 = job.cz - half;
    const base = job.col * stride;
    for (let row = 0; row <= cells; row++) job.heights[row + base] = this.sample(x, z0 + row * step);
    job.col++;
  }

  /** Adds the finished patch. On failure logs, discards the work and re-queues the key; returns false. */
  private finish(job: PatchJob): boolean {
    this.jobs.delete(job.key);
    const old = this.colliders.get(job.key);
    if (old) {
      this.physics.removeCollider(old);
      this.colliders.delete(job.key);
    }
    try {
      const collider = this.physics.addHeightfield({
        nrows: this.cells,
        ncols: this.cells,
        heights: job.heights,
        scale: { x: this.patchSize, y: 1, z: this.patchSize },
        center: { x: job.cx, y: 0, z: job.cz },
      });
      this.colliders.set(job.key, collider);
      this.failures.delete(job.key);
      return true;
    } catch (err) {
      const failure = this.failures.get(job.key) ?? { count: 0, retryAt: 0 };
      if (failure.count === 0) console.warn(`TerrainColliders: failed to add heightfield ${job.key}; will retry`, err);
      failure.count++;
      // 2, 4, 8 ... updates, capped at about ten seconds of ticks.
      failure.retryAt = this.updates + Math.min(2 ** failure.count, 600);
      this.failures.set(job.key, failure);
      return false;
    }
  }

  private backingOff(key: string): boolean {
    const failure = this.failures.get(key);
    return failure !== undefined && this.updates < failure.retryAt;
  }
}

function parseKey(key: string): [number, number] {
  const i = key.indexOf(',');
  return [Number(key.slice(0, i)), Number(key.slice(i + 1))];
}
