import { COMBAT } from '../config/constants';
import type { HitEvent } from './types';

export type HitListener = (e: HitEvent) => void;

/** Minimal synchronous pub/sub for hit events. Listener failures are isolated. */
export class DamageBus {
  private listeners: HitListener[] = [];

  constructor(private readonly onListenerError: (err: unknown) => void = console.error) {}

  get listenerCount(): number {
    return this.listeners.length;
  }

  subscribe(listener: HitListener): () => void {
    // Wrap so the same function subscribed twice yields independent subscriptions.
    const entry: HitListener = (e) => listener(e);
    this.listeners.push(entry);
    return () => {
      const i = this.listeners.indexOf(entry);
      if (i >= 0) this.listeners.splice(i, 1);
    };
  }

  emit(e: HitEvent): void {
    const snapshot = this.listeners.slice();
    for (const entry of snapshot) {
      // Skip listeners unsubscribed earlier in this same emit.
      if (!this.listeners.includes(entry)) continue;
      try {
        entry(e);
      } catch (err) {
        try {
          this.onListenerError(err);
        } catch {
          /* error handler must never break emit */
        }
      }
    }
  }
}

/** Damage for a struck bone: base scaled by the bone multiplier (unknown bones use 1). */
export function damageFor(bone: string, base: number = COMBAT.baseDamage): number {
  return base * (COMBAT.boneMultipliers[bone] ?? 1);
}
