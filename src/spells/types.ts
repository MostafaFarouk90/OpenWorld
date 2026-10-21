import { looseService } from '../vfx/ports';
import type { CastResult } from './SpellCaster';
import type { SpellDef } from './spellDefs';
import type { BurnZone } from './Burn';
import type { RegisterFormResult, SurgeFormImpl } from './SurgeAndRally';

/** The 'spells' service (design 9.7 Burn, Ember, casting). */
export interface SpellsService {
  readonly burn: number;
  readonly scars: number;
  /**
   * Optional (v0.6 item 16): A5 implements it. Removes up to `n` Scars for the Hearth rite (flag `aelfreda.rite.a<act>`)
   * and returns how many were removed. `scars` stays a number.
   */
  removeScars?(n: number, reason: 'hearth-rite'): number;
  readonly ember: number;
  readonly maxEmber: number;
  spendEmber(n: number): boolean;
  /** The class row's Ember maximum (progression calls it on a class change and after a load); false for a bad number. */
  setMaxEmber(n: number): boolean;
  /** Adds Ember (clamped to the maximum) and returns how much was added; n <= 0 or not finite adds 0. */
  restoreEmber(n: number): number;
  /** Raw Burn change (boss attacks that add Burn directly): never scars. */
  addBurn(n: number, source: string): void;
  /**
   * The only shard-use path (Surge, Leap, rekindle, Release): adds `gain` Burn and, when Burn was 75 or more before the
   * gain, a Scar (`scar.added`, flag `story.f10.scars`, max health refresh, feedback).
   */
  useShard(gain: number, source: string): { gained: number; scarred: boolean };
  registerSurgeForm(classId: string, zone: BurnZone, impl: SurgeFormImpl): RegisterFormResult;
  /** The Surge Leap on V: learned once M03 grants `surge-leap`; `cooldown()` is in sim seconds. */
  readonly leap: { readonly learned: boolean; cooldown(): { remaining: number; total: number } };
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
