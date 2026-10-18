/**
 * Stealth's view of thread 5's perception hook (`src/enemies/perceptionHook.ts`, `src/enemies/ai/perception.ts`,
 * `src/enemies/ai/awareness.ts`). Types and maths are thread 5's; this file only adapts them to the shapes the
 * stealth tick and its tests use (a nullable modifier list, a numeric awareness step).
 */
import { type PerceptionInput, type PerceptionResult, perceive } from '../enemies/ai/perception';
import { stepAwareness as step } from '../enemies/ai/awareness';
import { combineModifiers as combine, type PerceptionModifiers, type SightBlocker } from '../enemies/perceptionHook';
import type { CombinedModifiers } from '../enemies/perceptionHook';
import { AI } from '../enemies/tuning';

export type { CombinedModifiers, PerceptionModifiers, SightBlocker };
export type P3 = { x: number; y: number; z: number };

export const NO_MODIFIERS: PerceptionModifiers = { sightRangeScale: 1, coneScale: 1, hearingQuietScale: 1, hearingLoudScale: 1 };

/** Thread 5's `combineModifiers`, skipping nulls; the identity set for an empty list. */
export function combineModifiers(list: readonly (PerceptionModifiers | null | undefined)[]): CombinedModifiers {
  const present = list.filter((m): m is PerceptionModifiers => !!m);
  return combine(present) ?? { ...NO_MODIFIERS, blockSight: [] };
}

/** Thread 5's `perceive` result plus the effective sight range awareness fills over. */
export type ModifiedPerception = PerceptionResult & { sightRange?: number };

/** Thread 5's `perceive` with one provider's (or a combined) modifier set. */
export function perceiveWith(input: PerceptionInput, mods: PerceptionModifiers | null): ModifiedPerception {
  if (!mods) return perceive(input);
  const combined = combineModifiers([mods]);
  return { ...perceive({ ...input, modifiers: combined }), sightRange: AI.sightRange * combined.sightRangeScale };
}

/** Thread 5's awareness step, as the next awareness value. */
export function stepAwareness(prev: number, r: ModifiedPerception, dt: number): number {
  return step(prev, r, dt).awareness;
}

/** The per-guard read thread 5 exposes as `enemies.perception.state(actorId)`. */
export interface GuardPerceptionState {
  awareness: number;
  sees: boolean;
  hears: boolean;
  distance: number;
}
