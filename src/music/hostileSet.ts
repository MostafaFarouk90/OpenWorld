import type { DamageKind, TeamName } from './driver';

/**
 * The actors currently hostile to the player, built from the edge events `ai.aggro` and `ai.calm`.
 * Mercy removes a creature at once; `mercy.revoked` does not put it back (only a fresh aggro does).
 */
export class HostileSet {
  private readonly ids = new Set<string>();

  add(id: string): void {
    this.ids.add(id);
  }

  /** Returns true when the id was in the set. */
  remove(id: string): boolean {
    return this.ids.delete(id);
  }

  has(id: string): boolean {
    return this.ids.has(id);
  }

  get size(): number {
    return this.ids.size;
  }

  clear(): void {
    this.ids.clear();
  }

  list(): string[] {
    return [...this.ids];
  }
}

/**
 * Does a damage result count for combat music? Only melee or spell damage between a hostile
 * attacker and the player, or the player and a hostile target. Falls, script damage and neutral
 * targets (dummies, scarecrow) never start combat music.
 */
export function isCombatHit(
  kind: DamageKind,
  attackerTeam: TeamName | undefined,
  targetTeam: TeamName | undefined,
): 'hostile-hit-player' | 'player-hit-hostile' | null {
  if (kind !== 'melee' && kind !== 'spell') return null;
  if (attackerTeam === 'hostile' && targetTeam === 'player') return 'hostile-hit-player';
  if (attackerTeam === 'player' && targetTeam === 'hostile') return 'player-hit-hostile';
  return null;
}
