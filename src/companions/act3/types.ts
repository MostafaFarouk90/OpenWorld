// Act 3 (K5): the `act3Allies` service (the M27 deserter). K12 reads it as `ctx.services.get('act3Allies')?.`: the
// service is absent when the `companions-act3` plugin is not loaded (reduced-manifest tests).

export interface DeserterView {
  actorId: string;
  /** The anchor he holds (he never walks). */
  anchorId: string;
  state: 'post' | 'down';
}

export interface Act3AlliesService {
  /**
   * Places the deserter at `anchorId` (yaw from the anchor) and returns true. Refused (false, one warning) unless
   * `story.r14.choice` is `released` and the anchor exists. The same anchor again revives him at full health; another
   * anchor moves him there (despawned and rebuilt).
   */
  spawnDeserter(anchorId: string): boolean;
  /** Removes him (idempotent). K12 calls it when M27 ends, and on `save.loaded` unless M27 is at a fight step. */
  despawnDeserter(): void;
  deserter(): DeserterView | null;
}

declare module '../../core/Services' {
  interface GameServices {
    act3Allies: Act3AlliesService;
  }
}
