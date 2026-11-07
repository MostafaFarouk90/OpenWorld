// N3 arena kit: lava that rises (plans/act5-N3.md 1.6). Moves one lava volume's surface (and mesh, through the `lava`
// service) between named levels over ARENA_KIT.riseS seconds. Each level may carry its own safe lips; rising, the new
// level's lips apply at once (a lip about to flood is no longer a target), falling, they apply on arrival. A player the
// surface reaches is in lava and is thrown to a dry lip by the lava rule, never killed. Reset snaps to 'low'.
import type { ArenaPiece } from '../../bosses/arena';
import type { Vec3 } from '../../physics/PhysicsWorld';
import { ARENA_KIT } from '../lava/tuning';

export interface LavaLike {
  setSurface(volumeId: string, y: number): boolean;
  surface(volumeId: string): number | undefined;
  setLips(volumeId: string, lips: readonly Vec3[]): boolean;
}

export interface LavaLevel {
  y: number;
  lips?: readonly Vec3[];
}

export interface RisingLavaOptions {
  lava: LavaLike;
  volumeId: string;
  /** Named levels; 'low' is required (the start and reset). Other names are the states ('level:1', 'flood'). */
  levels: Readonly<Record<string, LavaLevel>>;
  riseS?: number;
  warn?(message: string): void;
}

export class RisingLava implements ArenaPiece {
  private s = 'low';
  private from = 0;
  private to = 0;
  private t = 0;
  private moving = false;
  private pendingLips: readonly Vec3[] | null = null;
  private readonly warned = new Set<string>();

  constructor(private readonly opts: RisingLavaOptions) {
    const low = opts.levels.low;
    if (!low || !Number.isFinite(low.y)) throw new Error('RisingLava: needs a finite "low" level');
    // a reset must put the lips back too, so lips on any level need lips on 'low'
    if (!low.lips && Object.values(opts.levels).some((l) => l.lips)) throw new Error('RisingLava: levels carry lips, so "low" needs its lips');
    this.reset();
  }

  get state(): string {
    return this.s;
  }

  get y(): number {
    return this.opts.lava.surface(this.opts.volumeId) ?? this.opts.levels.low!.y;
  }

  apply(state: string): void {
    const lvl = this.opts.levels[state];
    if (!lvl || !Number.isFinite(lvl.y)) {
      if (!this.warned.has(state)) {
        this.warned.add(state);
        this.opts.warn?.(`RisingLava: unknown level "${state}"`);
      }
      return;
    }
    this.s = state;
    this.from = this.y;
    this.to = lvl.y;
    this.t = 0;
    this.moving = this.from !== this.to;
    const rising = this.to > this.from;
    if (lvl.lips && (rising || !this.moving)) this.opts.lava.setLips(this.opts.volumeId, lvl.lips);
    this.pendingLips = lvl.lips && !rising && this.moving ? lvl.lips : null;
  }

  update(dt: number): void {
    if (!this.moving || !(dt > 0)) return;
    const riseS = this.opts.riseS ?? ARENA_KIT.riseS;
    this.t = Math.min(riseS, this.t + dt);
    const k = riseS > 0 ? this.t / riseS : 1;
    this.opts.lava.setSurface(this.opts.volumeId, this.from + (this.to - this.from) * k);
    if (k >= 1) {
      this.moving = false;
      if (this.pendingLips) this.opts.lava.setLips(this.opts.volumeId, this.pendingLips);
      this.pendingLips = null;
    }
  }

  reset(): void {
    const low = this.opts.levels.low!;
    this.s = 'low';
    this.moving = false;
    this.pendingLips = null;
    this.opts.lava.setSurface(this.opts.volumeId, low.y);
    if (low.lips) this.opts.lava.setLips(this.opts.volumeId, low.lips);
  }
}
