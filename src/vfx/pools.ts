/**
 * Fixed-capacity pool. `acquire` hands out a free slot or, when exhausted, recycles the oldest live
 * one (calling `onRecycle` so its owner can stop it). Release is idempotent.
 */
export class Pool<T> {
  private readonly free: T[] = [];
  private readonly live: T[] = [];

  constructor(
    private readonly make: () => T,
    readonly capacity: number,
    private readonly onRecycle?: (item: T) => void,
  ) {
    if (!(capacity >= 1)) throw new Error('Pool capacity must be at least 1');
  }

  get liveCount(): number {
    return this.live.length;
  }
  get freeCount(): number {
    return this.capacity - this.live.length;
  }

  acquire(): T {
    let item: T | undefined = this.free.pop();
    if (item === undefined) {
      if (this.live.length + this.free.length < this.capacity) item = this.make();
      else {
        item = this.live.shift() as T;
        this.onRecycle?.(item);
        this.live.push(item);
        return item;
      }
    }
    this.live.push(item);
    return item;
  }

  release(item: T): boolean {
    const i = this.live.indexOf(item);
    if (i < 0) return false;
    this.live.splice(i, 1);
    this.free.push(item);
    return true;
  }

  forEachLive(fn: (item: T) => void): void {
    for (const item of [...this.live]) fn(item);
  }

  clear(): void {
    this.free.push(...this.live.splice(0));
  }
}
