import type { ActorId } from '../ports';

export type CoolingKind = 'draught' | 'wind' | 'valve';

/**
 * The `cooling` service: a cooling hit on a Slag Crawler. It staggers regardless of poise and does not count as a strike, so
 * Calm stays open ("a cooling hit, then hold T"). Callers: the thrown Cooling Draught (ground/throw.ts), the Emberwright's
 * Gust Step (an additive edit to its runtime), and A9/A13's valve spray.
 */
export interface CoolingService {
  /** Cools one actor. False when it is not a coolable enemy (or already gone). */
  hit(actorId: ActorId, sourceId?: ActorId | null, kind?: CoolingKind): boolean;
  /** Cools every coolable enemy within `radius` metres of `at`; returns how many reacted. */
  hitArea(at: { x: number; y: number; z: number }, radius: number, sourceId?: ActorId | null, kind?: CoolingKind): number;
}

/** The part of an enemy cooling needs. */
export interface Coolable {
  readonly id: ActorId;
  readonly feet: { x: number; y: number; z: number };
  coolingHit(sourceId: ActorId | null): boolean;
}

export function createCooling(deps: {
  get(id: ActorId): Coolable | undefined;
  all(): Iterable<Coolable>;
  emit(kind: CoolingKind, actorId: ActorId): void;
}): CoolingService {
  const one = (c: Coolable, sourceId: ActorId | null, kind: CoolingKind): boolean => {
    if (!c.coolingHit(sourceId)) return false;
    deps.emit(kind, c.id);
    return true;
  };
  return {
    hit(actorId, sourceId = null, kind = 'draught') {
      const c = deps.get(actorId);
      return c ? one(c, sourceId, kind) : false;
    },
    hitArea(at, radius, sourceId = null, kind = 'wind') {
      if (!(radius > 0) || !Number.isFinite(radius)) return 0;
      let n = 0;
      for (const c of deps.all()) {
        if (Math.hypot(c.feet.x - at.x, c.feet.z - at.z) <= radius && Math.abs(c.feet.y - at.y) <= 3 && one(c, sourceId, kind)) n++;
      }
      return n;
    },
  };
}
