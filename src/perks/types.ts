// Contracts v0.8 item 17: the perks port. A perk is read live (no rebinding): the Burn decay scale is the product over
// active perks, the Release cost the minimum over active perks (never below 0). Keeper's Understanding (Act 3) and the
// Walker Tattoo (L7, Q13) are perks.

export interface PerkContext {
  /** The Release targets a boss (the Walker Tattoo leaves boss releases at their cost). */
  isBoss?: boolean;
}

export interface PerkDef {
  id: string;
  active(): boolean;
  /** Multiplies the out-of-combat Burn decay while active. */
  burnDecayScale?(): number;
  /** The Release cost while active, from the base cost. */
  releaseBurnCost?(base: number, ctx: PerkContext): number;
}

export interface PerksService {
  /** Throws on a duplicate id; returns the undo. */
  register(def: PerkDef): () => void;
  /** Ids of the perks active now. */
  active(): string[];
  burnDecayScale(): number;
  releaseBurnCost(base: number, ctx?: PerkContext): number;
}

declare module '../core/Services' {
  interface GameServices {
    perks: PerksService;
  }
}

export {};
