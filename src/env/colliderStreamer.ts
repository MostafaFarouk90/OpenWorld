// Streams the env colliders (src/env/colliders.ts) as static Rapier cuboids: 64 m cells, a cell goes in when the player is within 80 m of it and
// out beyond 120 m (the CityNavStreamer pattern), at most one cell added per update so riding fast never spikes a frame.
import type RAPIER from '@dimforge/rapier3d';
import { bucketByCell, COLLIDER_CELL, type ColliderBox } from './colliders';

/** A cell's colliders are added when the player comes this close to its rect (metres)... */
export const COLLIDER_ADD_DISTANCE = 80;
/** ...and removed beyond this. */
export const COLLIDER_DROP_DISTANCE = 120;
/** Boxes reach this far below the lowest ground under them, so a slope never leaves a gap under a fence. */
export const COLLIDER_SINK = 0.5;

export interface ColliderPorts {
  rapier: Pick<typeof RAPIER, 'ColliderDesc'>;
  physics: { addStaticCollider(desc: RAPIER.ColliderDesc): RAPIER.Collider; removeCollider(c: RAPIER.Collider): void };
  heightAt(x: number, z: number): number;
  warn?(message: string, err?: unknown): void;
}

interface Cell {
  ix: number;
  iz: number;
  boxes: ColliderBox[];
  live: RAPIER.Collider[] | null;
}

export class ColliderStreamer {
  private readonly cells = new Map<string, Cell>();
  private disposed = false;

  constructor(private readonly ports: ColliderPorts) {}

  /** Registers a tile's boxes (a tile is added once; boxes join the cells they fall in). */
  addBoxes(boxes: readonly ColliderBox[]): void {
    for (const [key, list] of bucketByCell(boxes)) {
      const cell = this.cells.get(key);
      if (cell) cell.boxes.push(...list);
      else {
        const [ix, iz] = key.split(',').map(Number) as [number, number];
        this.cells.set(key, { ix, iz, boxes: [...list], live: null });
      }
    }
  }

  /** Colliders in the physics world now. */
  get liveColliders(): number {
    let n = 0;
    for (const c of this.cells.values()) n += c.live?.length ?? 0;
    return n;
  }

  get liveCells(): number {
    let n = 0;
    for (const c of this.cells.values()) if (c.live) n++;
    return n;
  }

  get totalBoxes(): number {
    let n = 0;
    for (const c of this.cells.values()) n += c.boxes.length;
    return n;
  }

  update(x: number, z: number): void {
    if (this.disposed || !Number.isFinite(x) || !Number.isFinite(z)) return;
    let want: Cell | null = null;
    let wantDistance = Infinity;
    for (const c of this.cells.values()) {
      const d = this.distance(c, x, z);
      if (c.live) {
        if (d > COLLIDER_DROP_DISTANCE) this.release(c);
      } else if (d <= COLLIDER_ADD_DISTANCE && d < wantDistance) {
        want = c;
        wantDistance = d;
      }
    }
    if (want) this.acquire(want);
  }

  dispose(): void {
    this.disposed = true;
    for (const c of this.cells.values()) this.release(c);
    this.cells.clear();
  }

  private distance(c: Cell, x: number, z: number): number {
    const x0 = c.ix * COLLIDER_CELL;
    const z0 = c.iz * COLLIDER_CELL;
    return Math.hypot(Math.max(x0 - x, 0, x - (x0 + COLLIDER_CELL)), Math.max(z0 - z, 0, z - (z0 + COLLIDER_CELL)));
  }

  private release(c: Cell): void {
    if (!c.live) return;
    for (const col of c.live) {
      try {
        this.ports.physics.removeCollider(col);
      } catch (err) {
        this.ports.warn?.('env colliders: a collider could not be removed', err);
      }
    }
    c.live = null;
  }

  private acquire(c: Cell): void {
    const live: RAPIER.Collider[] = [];
    c.live = live;
    for (const b of c.boxes) {
      try {
        const desc = this.descFor(b);
        if (desc) live.push(this.ports.physics.addStaticCollider(desc));
      } catch (err) {
        // One bad box costs that box only.
        this.ports.warn?.(`env colliders: ${b.id} at ${b.cx.toFixed(1)}, ${b.cz.toFixed(1)} could not be added`, err);
      }
    }
  }

  private descFor(b: ColliderBox): RAPIER.ColliderDesc | null {
    const { heightAt } = this.ports;
    // Ground under the box: its centre and the ends of the long axis (a run can climb a slope).
    const c = Math.cos(b.yaw);
    const s = Math.sin(b.yaw);
    let lo = Infinity;
    let hi = -Infinity;
    for (const t of [-1, -0.5, 0, 0.5, 1]) {
      const g = heightAt(b.cx + c * b.hx * t, b.cz - s * b.hx * t);
      if (!Number.isFinite(g)) return null;
      lo = Math.min(lo, g);
      hi = Math.max(hi, g);
    }
    const bottom = lo - COLLIDER_SINK;
    const top = hi + b.h;
    const desc = this.ports.rapier.ColliderDesc.cuboid(b.hx, (top - bottom) / 2, b.hz).setTranslation(b.cx, (top + bottom) / 2, b.cz);
    if (b.yaw !== 0) desc.setRotation({ x: 0, y: Math.sin(b.yaw / 2), z: 0, w: Math.cos(b.yaw / 2) });
    return desc;
  }
}
