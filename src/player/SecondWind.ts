// Second Wind: a once-per-charge lethal-damage save. Pure; the lethal-damage pipeline calls `handler`.
import type { ActorLike, InvulnerabilityGate } from './types';
import { SECOND_WIND } from './tuning';

export const SECOND_WIND_SOURCE = 'secondWind';

export interface SecondWindDeps {
  actor: ActorLike;
  invuln: InvulnerabilityGate;
  hostilesNear(radius: number): Array<{ id: string }>;
  stagger(targetId: string, byId: string, poise: number): boolean;
  /** Sets actor.health. */
  heal(health: number): void;
  onFired(info: { charges: number; staggered: string[] }): void;
}

export interface SecondWindApi {
  handler(target: ActorLike, result?: unknown): boolean;
  readonly armed: boolean;
  readonly charges: number;
  reArm(charges?: number): void;
  disarm(): void;
  tickGrace(): void;
}

export function createSecondWind(deps: SecondWindDeps): SecondWindApi {
  let armed = true;
  let charges: number = SECOND_WIND.defaultCharges;
  let graceLeft = 0;

  return {
    handler(target) {
      const { actor } = deps;
      if (!armed || charges <= 0 || target.id !== actor.id) return false;
      deps.heal(Math.max(1, SECOND_WIND.healthFraction * actor.maxHealth));
      charges -= 1;
      if (graceLeft === 0) deps.invuln.add(SECOND_WIND_SOURCE);
      graceLeft = SECOND_WIND.graceTicks;
      const staggered: string[] = [];
      for (const h of deps.hostilesNear(SECOND_WIND.burstRadius)) {
        try {
          deps.stagger(h.id, actor.id, SECOND_WIND.burstPoise);
          staggered.push(h.id);
        } catch {
          // A failing stagger must never undo the save.
        }
      }
      try {
        deps.onFired({ charges, staggered });
      } catch {
        // Presentation hooks cannot break the save either.
      }
      return true;
    },
    get armed() {
      return armed && charges > 0;
    },
    get charges() {
      return charges;
    },
    reArm(n = SECOND_WIND.defaultCharges) {
      armed = true;
      charges = Math.max(0, Math.floor(n));
    },
    disarm() {
      armed = false;
    },
    tickGrace() {
      if (graceLeft <= 0) return;
      graceLeft -= 1;
      if (graceLeft === 0) deps.invuln.remove(SECOND_WIND_SOURCE);
    },
  };
}

