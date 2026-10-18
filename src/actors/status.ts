import type { ActorId } from './Actor';

/**
 * Status effects (contracts/actors-and-damage.md section 10, v0.5). Core defines the shape; thread 2
 * provides `services.provide('status', …)`. The kind is `ignite`, never "burn": the Burn meter is another thing.
 */
export type StatusKind = 'bleed' | 'ignite' | 'stun' | 'slow';

export interface StatusSpec {
  /** Same id on the same actor refreshes to the longer remaining time and never stacks `dps`. */
  id: string;
  kind: StatusKind;
  /** Health per second for `bleed` and `ignite`, ticked once a second as `kind: 'status'` damage. */
  dps?: number;
  seconds: number;
  sourceId: ActorId | null;
  /** `slow` only: the speed fraction removed, 0..0.9. */
  slow?: number;
}

export interface StatusEntry {
  id: string;
  kind: StatusKind;
  remaining: number;
  sourceId: ActorId | null;
}

export interface StatusService {
  /**
   * False for `seconds` <= 0 or not finite, `dps` < 0 or not finite, and a dead, despawned or unhittable actor.
   * For `stun` and `slow` the strongest active entry wins; `bleed` and `ignite` with different ids stack.
   */
  apply(actorId: ActorId, spec: StatusSpec): boolean;
  clear(actorId: ActorId, id?: string): void;
  has(actorId: ActorId, kind: StatusKind): boolean;
  list(actorId: ActorId): readonly StatusEntry[];
}

declare module '../core/Services' {
  interface GameServices {
    status: StatusService;
  }
}
