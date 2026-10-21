import type { ActorId } from '../ports';
import type { OrskBeat, OrskRequest } from './orsk';
import type { TetherOptions, TetherPost } from './tethers';

/** A playing of Orsk's set piece. */
export interface OrskPlayback {
  /** Resolves once the sequence is over (`gone`, a skip, or teardown). */
  readonly done: Promise<void>;
  /** Jumps to the end: every remaining beat once, in order. */
  skip(): void;
}

/** The wyrm runtime for quest scripts (A12's M15 cage, A13's M20 nursery and gallery). */
export interface WyrmsService {
  /** Chains the slots of a wyrmling group: slot i to `posts[i]` while its `until` is false. Returns the remover. */
  tether(spawnerId: string, posts: readonly TetherPost[], opts?: TetherOptions): () => void;
  /** Frees a live wyrmling's chain for good (saved); false for an unknown or unchained actor. */
  unchain(actorId: ActorId): boolean;
  /** Sends a live wyrmling away without a mercy (flies off, slot spent, no credit); false for an unknown actor. */
  flyAway(actorId: ActorId): boolean;
  /** Plays Orsk's set piece once; null (with a warning) while one is already playing. */
  playOrsk(req: OrskRequest): OrskPlayback | null;
}

declare module '../../core/events' {
  interface GameEventMap {
    /** Orsk's set piece reached a beat (A4 swaps the gallery roof on `roofBurst`). */
    'wyrm.orsk': { beat: OrskBeat };
    /** An Ember Wyrm was brought down by a broken wing and touched down (its 3 s stagger starts). */
    'wyrm.grounded': { actorId: ActorId; by: ActorId | null };
    /** A wyrmling's chain was freed by `wyrms.unchain`. */
    'wyrm.unchained': { actorId: ActorId };
  }
}

declare module '../../core/Services' {
  interface GameServices {
    wyrms: WyrmsService;
  }
}
