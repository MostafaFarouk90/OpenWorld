// Act 5 events (contracts v0.9 items 4 and 5): lava, vents and the siege. Typed here by augmentation; core's events.ts
// stays core-only. Every siege event carries `siegeId` (M52 at the Rim Gate, R27 at the tunnel mouth).
import type { SiegeOrderId } from './siege';

declare module '../core/events' {
  interface GameEventMap {
    /** The player's feet entered a lava volume (N3). */
    'lava.entered': { volumeId: string };
    /** The player was thrown out of a lava volume to its nearest safe lip. */
    'lava.thrown': { volumeId: string; to: { x: number; y: number; z: number } };
    'vent.opened': { ventId: string };
    'vent.closed': { ventId: string };
    'siege.wave.started': { siegeId: string; n: number };
    'siege.wave.cleared': { siegeId: string; n: number };
    /** The gate's health fell; `pct` is what remains, 0..100. */
    'siege.gate.damaged': { siegeId: string; pct: number };
    'siege.gate.breached': { siegeId: string };
    'siege.order': { siegeId: string; id: SiegeOrderId };
    /** An ally squad or dragon arrived (`id` is its def id). */
    'siege.ally.arrived': { siegeId: string; id: string };
    /** v0.9 item 7: a boss arena piece changed state (`bossArena.set`), for the HUD, music and N3's kit. */
    'arena.piece': { arenaId: string; pieceId: string; state: string };
    /** v0.9 item 7: every piece of an arena went back to its start (`boss.ended`, `save.loaded`). */
    'arena.reset': { arenaId: string };
  }
}

export {};
