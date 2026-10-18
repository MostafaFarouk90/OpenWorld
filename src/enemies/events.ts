import type { EnemiesService } from './EnemyManager';

/**
 * Thread 2's additions to the shared event map and service registry, by module augmentation
 * (contracts/game-events-and-flags.md section 4: plugin events live in their own namespace).
 */
declare module '../core/events' {
  interface GameEventMap {
    /** Every member of a spawner's group died, was released or was spared. A despawn or a thief's escape never counts (an escape is refilled). */
    'enemies.groupCleared': { spawnerId: string };
    /** An observer's awareness of its target rose above 0.3 (once per rise). */
    'ai.suspicious': { actorId: string; targetId: string; awareness: number };
    /** An observer's awareness reached 1 (once per fill). Thread 18 maps it to `stealth.noticed`. */
    'ai.spotted': { actorId: string; targetId: string };
    /** An enemy's AI state changed (debug and tests; not persisted). */
    'enemies.state': { actorId: string; from: string; to: string };
    /** A blighted soldier kneels: Spare is open for `seconds`. */
    'enemies.yield': { actorId: string; seconds: number };
    /** An ash scarecrow was cleared, once each: by the carried torch, by the Surge (or, as a fallback, killed). */
    /** The Alley Cutpurse robbed the player of `amount` gold. */
    'enemies.cutpurse.robbed': { amount: number };
    /** A fleeing Alley Cutpurse was caught (staggered or cornered); `amount` is the gold it holds. */
    'enemies.cutpurse.caught': { amount: number };
    'scarecrow.cleared': { actorId: string; scarecrowId: string; method: 'torch' | 'surge' | 'strike' };
  }
}

declare module '../core/Services' {
  interface GameServices {
    enemies: EnemiesService;
  }
}

export {};
