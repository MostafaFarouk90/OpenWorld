import type { EventsLike } from '../vfx/ports';

/**
 * Subscribes to an event that VfxEventMap (src/vfx/ports.ts) does not declare yet, such as 'ui.modal'
 * ({ id: string; open: boolean }) and 'mercy' ({ actorId: string; ... }). Remove once ports.ts lists them.
 */
export function onLoose<P>(events: EventsLike, type: string, fn: (payload: P) => void): () => void {
  return (events as unknown as { on(t: string, f: (p: P) => void): () => void }).on(type, fn);
}
