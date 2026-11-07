// N4's siege events beyond N0's set (src/caldera/events.ts), and the `siege` service (module augmentations).
import type { SiegeOrderId } from '../caldera/siege';
import type { SiegeService } from './service';

declare module '../core/events' {
  interface GameEventMap {
    /** The siege's last wave cleared. */
    'siege.completed': { siegeId: string };
    /** A ram began its wind-up (N8's creak). */
    'siege.ram.creak': { siegeId: string; id: string };
    /** A ram struck the gate. */
    'siege.ram.hit': { siegeId: string; id: string };
    /** A ram was stalled (sappers, a dragon, the sally). */
    'siege.ram.stall': { siegeId: string; id: string; seconds: number };
    /** A dragon's breath telegraph began at `at` (the fire lands `DRAGON.telegraphS` later). */
    'siege.dragon.breath': { siegeId: string; dragonId: string; at: { x: number; y: number; z: number } };
    /** The wounded beat (Q2 a): the companion sits out at the aid post until the siege ends. */
    'siege.companion.wounded': { siegeId: string; companionId: string };
    /** A break began: the orders on offer (the war post's talk reads them from flags too). */
    'siege.break': { siegeId: string; n: number; orders: readonly SiegeOrderId[] };
    /** The gong starts waves 2 on (`by` 'cael' when R29 is done or Cael ordered it, else Ansgar off screen; N8's `sfx.gong.rim`). */
    'siege.gong': { siegeId: string; by: 'cael' | 'ansgar' };
    /** The war post's dialogue choices (effect events; the runner turns them into `siege.order`). */
    'siege.order.hold': unknown;
    'siege.order.brace': unknown;
    'siege.order.loose': unknown;
    'siege.order.flasks': unknown;
    'siege.order.gong': unknown;
  }
}

declare module '../core/Services' {
  interface GameServices {
    siege: SiegeService;
  }
}

export {};
