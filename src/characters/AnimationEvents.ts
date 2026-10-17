import type { Foot, LocomotionState } from './knightClips';

/** Events the animation controller emits during its fixed tick; see contracts/animation-events.md. */
export type AnimationEvent =
  | { type: 'stateChange'; from: LocomotionState; to: LocomotionState }
  | { type: 'clipStart'; clip: string }
  | { type: 'clipEnd'; clip: string; interrupted: boolean }
  | { type: 'attackWindow'; clip: string; swingId: number; phase: 'open' | 'close'; normalizedTime: number }
  | {
      type: 'attackProgress';
      clip: string;
      swingId: number;
      normalizedTime: number;
      previousNormalizedTime: number;
      active: boolean;
    }
  | { type: 'footstep'; foot: Foot; clip: string; normalizedTime: number }
  | { type: 'land'; fallSpeed: number };

export type AnimationListener = (event: AnimationEvent) => void;

/**
 * Synchronous typed emitter. A throwing listener is reported through `onError` and does not stop the
 * others; listeners may unsubscribe (themselves or others) while an event is being delivered.
 */
export class AnimationEvents {
  private listeners: AnimationListener[] = [];

  constructor(
    private readonly onError: (error: unknown, event: AnimationEvent) => void = (error, event) =>
      console.error(`Animation event listener failed on "${event.type}":`, error),
  ) {}

  /** Returns a function that removes the listener; calling it twice is harmless. */
  subscribe(listener: AnimationListener): () => void {
    this.listeners = [...this.listeners, listener];
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  emit(event: AnimationEvent): void {
    // Copy-on-write: a snapshot of the list at emit time, so unsubscribing mid-emit is safe.
    for (const listener of this.listeners) {
      if (!this.listeners.includes(listener)) continue;
      try {
        listener(event);
      } catch (error) {
        this.onError(error, event);
      }
    }
  }

  get size(): number {
    return this.listeners.length;
  }
}
