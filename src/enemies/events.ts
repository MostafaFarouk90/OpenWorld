import type { EnemiesService } from './EnemyManager';

/**
 * Thread 2's additions to the shared event map and service registry, by module augmentation
 * (contracts/game-events-and-flags.md section 4: plugin events live in their own namespace).
 */
declare module '../core/events' {
  interface GameEventMap {
    /** Every member of a spawner's group died, was released, was spared or despawned. */
    'enemies.groupCleared': { spawnerId: string };
    /** An enemy's AI state changed (debug and tests; not persisted). */
    'enemies.state': { actorId: string; from: string; to: string };
    /** A blighted soldier kneels: Spare is open for `seconds`. */
    'enemies.yield': { actorId: string; seconds: number };
  }
}

declare module '../core/Services' {
  interface GameServices {
    enemies: EnemiesService;
  }
}

export {};
