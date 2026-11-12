// G3 New Game+ ("Second Hearth", design 12.5): the `ngPlus` service. G1's pause menu row and the tutorial read it.

/** The `ngPlus` service (plugin `ngplus`). */
export interface NgPlusService {
  /** 0 on a first playthrough; 1 in the first Second Hearth, and so on. */
  cycle(): number;
  /** The endings this save line reached before this cycle ('rekindle' | 'let-it-die'), oldest first. */
  endingsSeen(): readonly string[];
  /** The live Heat (1 + 2k + W); 1 on a first playthrough. */
  heat(): number;
  /** Enemy health and damage multiplier from the Heat alone (design 12.4); 1 on a first playthrough. */
  heatMultiplier(): number;
  /** True in a save past the ending (`world.afterEnding`): a Second Hearth can begin. */
  available(): boolean;
  /**
   * Begins a Second Hearth from the live world: parks it (slot-0.parked), writes the Second Hearth to both slots and
   * reloads the page. Resolves false (nothing changed) when not available or the write failed.
   */
  begin(): Promise<boolean>;
}

declare module '../core/Services' {
  interface GameServices {
    ngPlus: NgPlusService;
  }
}
