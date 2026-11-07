// N4 (Act 5): the waves kit's additive events (module augmentation; core's events.ts stays core-only).
import type { CartRole } from './structures';

declare module '../core/events' {
  interface GameEventMap {
    /** A set with `breach` lost its barricade: the wave goes on in the court (no `waves.failed`). `index` is 0-based. */
    'waves.breached': { defId: string; index: number };
    /** A cart began its wind-up (a ram's creak). */
    'waves.cart.windup': { defId: string; id: string; role: CartRole };
    /** A cart struck the barricade; `damage` is the health it took off. */
    'waves.cart.struck': { defId: string; id: string; role: CartRole; damage: number };
  }
}

export {};
