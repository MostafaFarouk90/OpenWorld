import type { ActorId } from '../../ports';
import type { FlagCondition } from '../../../core/flagCondition';

/**
 * Skarl's drake for K8's D06 encounter (plans/act3-K6a.md 3). The chain itself is a `wyrms.tether` (saved through its
 * `until` condition); this service adds the collar-to-post leash for a flier, the strike K8 turns into the forced break,
 * and the release.
 */
export interface DrakesService {
  /** Chains a drake group's slot 0 to the post anchor until `until` holds. Returns the remover. */
  chain(spawnerId: string, postAnchor: string, opts?: { length?: number; until?: FlagCondition }): () => void;
  /** The chain's low point (world) while the drake is chained, else null: where K8 puts its strike target. */
  chainLow(actorId: ActorId): { x: number; y: number; z: number } | null;
  /** The chain was struck: emits `wyrm.drake.chainStruck` only while the drake is chained and on the ground. */
  strike(actorId: ActorId, by: ActorId | null): boolean;
  /** Frees the drake: the chain drops, it flies off (retired, slot spent) and `wyrm.drake.freed` fires. */
  release(actorId: ActorId): boolean;
}

declare module '../../../core/events' {
  interface GameEventMap {
    /** Skarl's drake touched down (K8's chain window opens). */
    'wyrm.drake.landed': { actorId: ActorId };
    /** The chain was struck while the drake was landed: K8 makes it Skarl's forced break. */
    'wyrm.drake.chainStruck': { actorId: ActorId; by: ActorId | null };
    /** The drake was released and flies off. */
    'wyrm.drake.freed': { actorId: ActorId };
  }
}

declare module '../../../core/Services' {
  interface GameServices {
    drakes: DrakesService;
  }
}
