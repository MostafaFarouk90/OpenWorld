import type { DamageModifierLike } from '../ports';
import { gnatScatterRule } from './gnats/overlay';
import { huskEmberRule, huskRiseLethal, huskRiseRule } from './huskKnight/overlay';
import { striderTripRule } from './strider/overlay';

/** Modifier orders: the trip and the ember after the defender verbs (a block stops them), beside `poiseBreakBones` (50); the
 * gnats' scatter after the buffs; the Husk Knight's rise floor last but one in the buffs band (the Ashblade's 99 runs after). */
export const WASTE_TRIP_ORDER = 51;
export const WASTE_SCATTER_ORDER = 95;
export const WASTE_RISE_ORDER = 98;

export interface WasteRulesPorts {
  addModifier(id: string, modifier: DamageModifierLike, order?: number): () => void;
  /** The game's lethal handlers (a raw `damage.kill` skips the modifiers); a host without them keeps the modifier floor only. */
  addLethalHandler?(id: string, handler: (target: { id: string; kind: string; health: number; maxHealth: number }) => boolean, order?: number): () => void;
  /** Seconds of game time (the light-hit window). */
  now(): number;
}

const fromPlayerSide = (attacker: { team?: string } | null): boolean => attacker?.team === 'player' || attacker?.team === 'ally';

/**
 * The Waste creatures' damage rules (plans/act4-L5.md sections 2 to 4), registered by the waste plugin (and by tests on a
 * fake host): a leg hit trips a strider, a chest hit while the ember glows breaks a Husk Knight, a fire or area hit scatters
 * a gnat swarm, and a Husk Knight's first death becomes its heap. Returns the remover.
 */
export function registerWasteRules(p: WasteRulesPorts): () => void {
  const offs = [
    p.addModifier(
      'waste.strider-trip',
      (req, target, attacker) => {
        if (!fromPlayerSide(attacker) || target.kind !== 'waste-strider') return;
        striderTripRule(req, { id: target.id, poise: target.poise }, p.now());
      },
      WASTE_TRIP_ORDER,
    ),
    p.addModifier(
      'waste.husk-ember',
      (req, target, attacker) => {
        if (!fromPlayerSide(attacker) || target.kind !== 'husk-knight') return;
        huskEmberRule(req, { id: target.id, poise: target.poise });
      },
      WASTE_TRIP_ORDER,
    ),
    p.addModifier(
      'waste.gnats-scatter',
      (req, target, attacker) => {
        if (target.kind !== 'cinder-gnat-swarm' || !fromPlayerSide(attacker)) return;
        // No poise: a heavy blow never staggers a cloud.
        req.poise = 0;
        gnatScatterRule(req as Parameters<typeof gnatScatterRule>[0], { health: target.health });
      },
      WASTE_SCATTER_ORDER,
    ),
    p.addModifier(
      'waste.husk-rise',
      (req, target) => {
        if (target.kind !== 'husk-knight') return;
        huskRiseRule(req, { id: target.id, health: target.health });
      },
      WASTE_RISE_ORDER,
    ),
  ];
  if (p.addLethalHandler) {
    offs.push(p.addLethalHandler('waste.husk-rise', (target) => target.kind === 'husk-knight' && huskRiseLethal(target)));
  }
  return () => {
    for (const off of offs.reverse()) off();
  };
}
