import { PLAYER_ID } from '../actors/teams';
import { PURSE_GOLD, PURSE_KIND, PURSE_SPAWNERS, THUG_GOLD, THUG_KIND, THUG_SPAWNERS } from './goldTable';

export interface DiedEvent {
  actorId: string;
  killerId: string | null;
  kind: string;
  spawnTag?: string;
}

/** What a kill pays: a flat purse for the Dead Road camp Footmen and R03's thugs, nothing else (design: a Spare pays none). */
export function purseFor(e: DiedEvent): number {
  if (e.killerId !== PLAYER_ID || !e.spawnTag) return 0;
  if (e.kind === PURSE_KIND && PURSE_SPAWNERS.includes(e.spawnTag)) return PURSE_GOLD;
  if (e.kind === THUG_KIND && THUG_SPAWNERS.includes(e.spawnTag)) return THUG_GOLD;
  return 0;
}

/** Pays each actor's purse once, even if its death is announced twice. */
export class PurseTracker {
  private readonly paid = new Set<string>();

  constructor(private readonly pay: (gold: number, actorId: string) => void) {}

  /** Forgets who was paid (a save with no economy entry, a new game). */
  reset(): void {
    this.paid.clear();
  }

  onDied(e: DiedEvent): number {
    const gold = purseFor(e);
    if (gold <= 0 || this.paid.has(e.actorId)) return 0;
    this.paid.add(e.actorId);
    this.pay(gold, e.actorId);
    return gold;
  }
}
