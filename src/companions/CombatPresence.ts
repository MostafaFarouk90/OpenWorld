import { TOBB_TUNING } from './tuning';

export type CombatEdge = 'start' | 'end' | null;

/**
 * Whether the player is in a fight, from hostiles aggroed on the player (`ai.aggro` with the player as target)
 * minus those calmed, killed or despawned. `end` waits for `debounce` seconds of no hostile and is only reported
 * for a fight that lasted `minFight` seconds or more.
 */
export class CombatPresence {
  private readonly hostiles = new Set<string>();
  private fightSeconds = 0;
  private quietSeconds = 0;
  private inFight = false;

  constructor(
    private readonly debounce: number = TOBB_TUNING.combatEndDebounceSeconds,
    private readonly minFight: number = TOBB_TUNING.combatMinSeconds,
  ) {}

  get fighting(): boolean {
    return this.inFight;
  }

  get size(): number {
    return this.hostiles.size;
  }

  /** 'start' when the first hostile of a new fight aggroes. */
  aggro(actorId: string): CombatEdge {
    this.hostiles.add(actorId);
    this.quietSeconds = 0;
    if (this.inFight) return null;
    this.inFight = true;
    this.fightSeconds = 0;
    return 'start';
  }

  /** Calm, death or despawn. */
  remove(actorId: string): void {
    this.hostiles.delete(actorId);
  }

  tick(dt: number): CombatEdge {
    if (!this.inFight || !(dt > 0)) return null;
    this.fightSeconds += dt;
    if (this.hostiles.size > 0) {
      this.quietSeconds = 0;
      return null;
    }
    this.quietSeconds += dt;
    if (this.quietSeconds < this.debounce) return null;
    const long = this.fightSeconds - this.quietSeconds >= this.minFight;
    this.inFight = false;
    this.fightSeconds = 0;
    this.quietSeconds = 0;
    return long ? 'end' : null;
  }

  /** Player death or a load: forget everything without reporting an end. */
  reset(): void {
    this.hostiles.clear();
    this.inFight = false;
    this.fightSeconds = 0;
    this.quietSeconds = 0;
  }
}
