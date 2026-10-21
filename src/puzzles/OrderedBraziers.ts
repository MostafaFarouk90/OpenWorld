export type LightResult = 'ok' | 'done' | 'wrong' | 'already' | 'unknown';

/** Braziers that must be lit in a fixed order; lighting out of order clears them all (no penalty). */
export class OrderedBraziers {
  private litCount = 0;

  constructor(readonly order: readonly number[]) {
    if (order.length === 0 || new Set(order).size !== order.length) throw new Error('OrderedBraziers: order must be non-empty and unique');
  }

  get count(): number {
    return this.order.length;
  }

  isLit(index: number): boolean {
    const at = this.order.indexOf(index);
    return at >= 0 && at < this.litCount;
  }

  litIndices(): number[] {
    return this.order.slice(0, this.litCount);
  }

  light(index: number): LightResult {
    if (!this.order.includes(index)) return 'unknown';
    if (this.isLit(index)) return 'already';
    if (this.order[this.litCount] !== index) {
      this.litCount = 0;
      return 'wrong';
    }
    this.litCount++;
    return this.litCount === this.order.length ? 'done' : 'ok';
  }

  reset(): void {
    this.litCount = 0;
  }

  fill(): void {
    this.litCount = this.order.length;
  }
}
