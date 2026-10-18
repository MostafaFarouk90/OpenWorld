import type { CastResult } from './SpellCaster';
import type { SpellDef } from './spellDefs';

/** The 'spells' service (design 9.7 Burn, Ember, casting). */
export interface SpellsService {
  readonly burn: number;
  readonly scars: number;
  readonly ember: number;
  readonly maxEmber: number;
  spendEmber(n: number): boolean;
  addBurn(n: number, source: string): void;
  clearBurn(reason: string): void;
  cast(spellId: string): CastResult;
  canCast(spellId: string): CastResult;
  /** Seconds remaining. */
  cooldown(spellId: string): number;
  def(spellId: string): SpellDef | undefined;
}

declare module '../vfx/ports' {
  interface ServiceMap {
    spells?: SpellsService;
  }
}
