// `dragon.flight` is not declared by any other thread yet, so the K14 sound plugin declares it here by module augmentation.
// Hathren's and the drake's events are K6a's own declarations (src/enemies/wyrm/hathren/events.ts, drake/events.ts).
declare module '../core/events' {
  interface GameEventMap {
    /** A dragon's wings start or stop; `actorId` is an actor id, or the dragon's name for a scene object that is not an actor. */
    'dragon.flight': { actorId: string; on: boolean };
  }
}

export {};
