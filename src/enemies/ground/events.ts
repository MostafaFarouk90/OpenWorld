/**
 * A6b's additions to the shared event map and service registry, by module augmentation (never `core/events.ts` or
 * `core/Services.ts`): the hunters' witnesses, the fox and the herd, and the cooling hit.
 */
declare module '../../core/events' {
  interface GameEventMap {
    /** A Dragon-Hunter was spared (once per actor). A12 counts these into `story.a2.witnesses`. */
    'hunter.spared': { actorId: string; kind: 'hunter-spearman' | 'hunter-harpooner' };
    /** The guide fox reached stop `stop` (0-based) of the list `foxes.guide` was given. */
    'fox.arrived': { foxId: string; stop: number };
    /** A fox fed a Barley Cake reached the cache; A2 reveals the chest. */
    'fox.cache': { foxId: string };
    /** The herd began following the player (`n` sheep) or stopped (`n` 0). */
    'herd.joined': { herdId: string; n: number };
    /** `n` sheep scattered into ash-fog. */
    'herd.scattered': { herdId: string; n: number };
    /** A Slag Crawler was staggered by a cooling hit. */
    'cooling.hit': { actorId: string; kind: 'draught' | 'wind' | 'valve' };
  }
}

declare module '../../core/Services' {
  interface GameServices {
    cooling: import('./cooling').CoolingService;
    foxes: import('./foxService').FoxService;
    herd: import('./herdService').HerdService;
  }
}

export {};
