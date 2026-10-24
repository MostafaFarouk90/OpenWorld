import { isHeavyBlow } from '../../combat/heavyBlow';
import { FEN_TUNING } from './tuning';

/** A hit's fields the fire rule reads. */
export interface FireReq {
  kind: string;
  attackId?: string;
  element?: 'fire';
  poise?: number;
}

/**
 * A fire hit (design 10 rows 9 and 10: Ember Bolt, Ember Quarrel, a torch): anything tagged `element: 'fire'`, the
 * Emberwright's spells (`emberwright.*`) and the Heartshard Surge. Status ticks never count; an ignite that lands (the Ember
 * Quarrel's, an Ember Bolt's) counts through `status.applied` instead (fen.plugin.ts).
 */
export function isFireHit(req: FireReq): boolean {
  if (req.kind === 'status') return false;
  if (req.element === 'fire') return true;
  const id = req.attackId ?? '';
  return id.startsWith('emberwright.') || id === 'heartshard-surge';
}

/** What a fire or heavy hit does to the poise of a Greyfen kind: the leech breaks at once, the shambler loses 50 more. */
export function fenPoise(kind: string, req: FireReq & { poise: number }, targetPoise: number, fire: boolean): number {
  if (kind === 'fen-leech' && (fire || isHeavyBlow(req))) return Math.max(req.poise, targetPoise);
  if (kind === 'peat-shambler' && fire) return req.poise + FEN_TUNING.shambler.firePoise;
  return req.poise;
}

/** One fire break per enemy within `FEN_TUNING.fireDedupeSeconds` (a bolt that also ignites counts once). */
export class FireDedupe {
  private readonly last = new Map<string, number>();
  private clock = 0;

  step(dt: number): void {
    this.clock += dt;
  }

  /** True (and remembered) when this enemy has not had a fire break within the window. */
  take(actorId: string): boolean {
    const t = this.last.get(actorId);
    if (t !== undefined && this.clock - t < FEN_TUNING.fireDedupeSeconds) return false;
    this.last.set(actorId, this.clock);
    return true;
  }

  forget(actorId: string): void {
    this.last.delete(actorId);
  }

  clear(): void {
    this.last.clear();
  }
}
