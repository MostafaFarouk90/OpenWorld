import { looseService } from '../vfx/ports';
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

declare module '../core/Services' {
  interface GameServices {
    spells: SpellsService;
  }
}
declare module '../core/events' {
  interface GameEventMap {
    'ember.changed': { value: number; previous: number };
    'spell.cancelled': { casterId: string; spellId: string; reason: string };
  }
}

/**
 * Thread 5's `abilities` service as the spells plugin uses it (plans/hud-inventory-skills.md, v2 changes). ports.ts still
 * declares the old handler shape, so this module reads the service through `abilitiesOf` instead of redeclaring it.
 */
export type AbilityHandlerResult = { ok: true } | { ok: false; reason: string };
export interface AbilityHandlerArgs {
  skillId: string;
  slot: number;
  /** The Actor casting (not an id). */
  caster: { readonly id: string } | null | undefined;
  ctx?: unknown;
}
export interface AbilitiesServiceV2 {
  registerHandler(skillId: string, handler: (args: AbilityHandlerArgs) => AbilityHandlerResult): { ok: true; dispose(): void } | { ok: false; reason: string };
}

export function abilitiesOf(services: { get(name: never): unknown }): AbilitiesServiceV2 | undefined {
  return looseService(services, 'abilities') as AbilitiesServiceV2 | undefined;
}
