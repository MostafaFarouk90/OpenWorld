// `dragon.flight` is declared here (nobody else declares it); K6a's `wyrm.hathren` and `wyrm.drake.*` events are declared
// in src/enemies/wyrm/ (the plugin imports them). K6a does not emit `dragon.flight`.
declare module '../core/events' {
  interface GameEventMap {
    /** A dragon's wings start or stop; `actorId` is an actor id, or the dragon's name for a scene object that is not an actor. */
    'dragon.flight': { actorId: string; on: boolean };
  }
}

export {};
