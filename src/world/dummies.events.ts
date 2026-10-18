/**
 * Events of the blocking training dummies (quest R02, Stane's Last Drill), declared by module
 * augmentation like src/enemies/events.ts. `dummyId` is the dummy's actor id; `byId` is the actor
 * that caused it (the player).
 */
declare module '../core/events' {
  interface GameEventMap {
    /** The player hit a blocking dummy while its guard was down. */
    'dummy.hitOpen': { dummyId: string; byId: string };
    /** The player hit a blocking dummy while its guard was up; a light hit, damage blocked. */
    'dummy.blocked': { dummyId: string; byId: string };
    /** A heavy hit (poise >= 30) met a raised guard: the guard breaks and the dummy staggers for 1.2 s. */
    'dummy.guardBroken': { dummyId: string; byId: string };
    /** The player parried the dummy's scripted swing. */
    'dummy.parried': { dummyId: string; byId: string };
  }
}

export {};
