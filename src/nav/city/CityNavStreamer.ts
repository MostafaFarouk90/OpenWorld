import { NavGrid } from '../NavGrid';
import type { BlockGridResult, CityNavBlock } from './blocks';

/** A block's grid is added when the player comes this close to its rect (horizontal metres)... */
export const CITY_NAV_BUILD_DISTANCE = 150;
/** ...and removed beyond this. */
export const CITY_NAV_DROP_DISTANCE = 250;

export interface CityNavStreamerPorts {
  /** The grid def for a block (blockGridDef bound to the city's structures and terrain). */
  def(block: CityNavBlock): BlockGridResult;
  /** Registers a grid; returns the undo. */
  add(grid: NavGrid): () => void;
  warn(message: string, err?: unknown): void;
}

type Slot = { block: CityNavBlock; state: 'idle' | 'skipped' } | { block: CityNavBlock; state: 'ready'; grid: NavGrid; remove: (() => void) | null };

const distanceToRect = (b: CityNavBlock, x: number, z: number): number => {
  const dx = Math.max(b.rect.x0 - x, 0, x - b.rect.x1);
  const dz = Math.max(b.rect.z0 - z, 0, z - b.rect.z1);
  return Math.hypot(dx, dz);
};

/**
 * Adds and removes the block grids around the player. At most one grid is built per `update` (the nearest wanted one);
 * a built grid is kept, so coming back only registers it again. A skipped or failed block is warned about once and never
 * retried.
 */
export class CityNavStreamer {
  private readonly slots: Slot[];

  constructor(blocks: readonly CityNavBlock[], private readonly ports: CityNavStreamerPorts) {
    this.slots = blocks.map((block) => ({ block, state: 'idle' }));
  }

  /** Ids of the blocks whose grids are registered now. */
  get active(): string[] {
    return this.slots.filter((s) => s.state === 'ready' && s.remove).map((s) => s.block.id);
  }

  /** Ids of the blocks whose grids exist (registered or not). */
  get built(): string[] {
    return this.slots.filter((s) => s.state === 'ready').map((s) => s.block.id);
  }

  update(x: number, z: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    let want: Slot | null = null;
    let wantDistance = Infinity;
    for (const s of this.slots) {
      const d = distanceToRect(s.block, x, z);
      if (s.state === 'ready') {
        if (s.remove && d > CITY_NAV_DROP_DISTANCE) {
          s.remove();
          s.remove = null;
        } else if (!s.remove && d <= CITY_NAV_BUILD_DISTANCE) {
          s.remove = this.register(s.block, s.grid);
        }
      } else if (s.state === 'idle' && d <= CITY_NAV_BUILD_DISTANCE && d < wantDistance) {
        want = s;
        wantDistance = d;
      }
    }
    if (want) this.build(want);
  }

  dispose(): void {
    for (const s of this.slots) {
      if (s.state === 'ready' && s.remove) {
        s.remove();
        s.remove = null;
      }
    }
  }

  private build(slot: Slot): void {
    const i = this.slots.indexOf(slot);
    try {
      const result = this.ports.def(slot.block);
      if ('skipped' in result) {
        this.ports.warn(`city nav: block "${slot.block.id}" skipped: ${result.skipped}`);
        this.slots[i] = { block: slot.block, state: 'skipped' };
        return;
      }
      const grid = new NavGrid(result.def);
      this.slots[i] = { block: slot.block, state: 'ready', grid, remove: this.register(slot.block, grid) };
    } catch (err) {
      this.ports.warn(`city nav: block "${slot.block.id}" failed to build`, err);
      this.slots[i] = { block: slot.block, state: 'skipped' };
    }
  }

  private register(block: CityNavBlock, grid: NavGrid): (() => void) | null {
    try {
      return this.ports.add(grid);
    } catch (err) {
      this.ports.warn(`city nav: block "${block.id}" could not be registered`, err);
      return null;
    }
  }
}
