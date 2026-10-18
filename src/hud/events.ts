import type { AbilitiesService, InventoryService, ProgressionService } from './ports';

/** Events and services of thread 5 (contracts/game-events-and-flags.md, "Requests from thread 5"). */
declare module '../core/events' {
  interface GameEventMap {
    'inventory.changed': { itemId: string; count: number };
    'inventory.equipped': { slot: string; itemId: string | null; previous: string | null };
    'item.used': { itemId: string };
    'xp.gained': { amount: number; source: string; total: number };
    'level.up': { level: number; previous: number };
    'skillpoints.changed': { points: number };
    'skill.learned': { skillId: string };
    'ability.used': { skillId: string; slot: number };
    'ability.failed': { slot: number; reason: string };
    'ability.bar.changed': Record<string, never>;
    'skill.triggered': { skillId: string };
    /** Until thread 3's quest effects call `progression.grantXp` directly. */
    'xp.grant': { amount: number; source: string };
    /** Short HUD message; thread 5's HUD shows it in the toast slot. */
    'hud.toast': { textKey: string; params?: Record<string, string | number> };
    /** A timed buff for the buff bar (thread 7 emits it for Rally Cry and similar). */
    /** The player dismissed the Act 1 mini-ending card; thread 21 starts the camp scene after it. */
    'hud.actEnding.closed': { endingId: string };
    'buff.applied': { id: string; nameKey: string; seconds: number };
    'buff.removed': { id: string };
  }
}

declare module '../core/Services' {
  interface GameServices {
    inventory: InventoryService;
    progression: ProgressionService;
    abilities: AbilitiesService;
  }
}

export {};
