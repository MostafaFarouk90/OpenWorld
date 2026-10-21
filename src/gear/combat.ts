import type { Actor } from '../actors/Actor';
import type { ModifiableRequest } from '../actors/DamageResolver';
import { PLAYER_ID } from '../actors/teams';
import type { EquipSlot } from '../hud/ports';
import { getItem } from '../inventory/items';
import { AFFIX_EFFECTS } from './affixes';
import { tierOf } from './tempering';
import { GEAR_TUNING } from './tuning';

export interface CombatPorts {
  equipped(slot: EquipSlot): string | null;
  gear(itemId: string): { temper: number; affix?: string };
  /** Sets the Ember status on a foe; absent when the status service is not loaded. */
  ignite?(targetId: string, sourceId: string): void;
}
export interface DamageHost {
  addModifier(id: string, fn: (req: ModifiableRequest, target: Actor, attacker: Actor | null) => void, order?: number): () => void;
}

export const ATTACK_MODIFIER = { id: 'gear.attack', order: -120 } as const;
export const EMBER_MODIFIER = { id: 'gear.ember', order: 99 } as const;
export const DEFENCE_MODIFIER = { id: 'gear.defence', order: 50 } as const;

const temperK = (temper: number): number => 1 + GEAR_TUNING.combat.temperPerLevel * temper;

/** Weapon factor: tier 2+ scales by stat over the best Act 1 weapon; temper adds 5% a level. 1 for untempered Act 1 gear. */
export function weaponFactor(ports: CombatPorts): number {
  const id = ports.equipped('weapon');
  const def = id ? getItem(id) : undefined;
  if (!id || !def) return 1;
  const base = tierOf(def) >= 2 ? (def.stats?.attack ?? GEAR_TUNING.combat.weaponBaseline) / GEAR_TUNING.combat.weaponBaseline : 1;
  return base * temperK(ports.gear(id).temper);
}

/** D: twice the summed armour and shield stats; Act 1 pieces count only for what tempering added. */
export function defenceRating(ports: CombatPorts): number {
  let sum = 0;
  for (const slot of ['armour', 'offhand'] as const) {
    const id = ports.equipped(slot);
    const def = id ? getItem(id) : undefined;
    if (!id || !def) continue;
    const stat = def.stats?.defense ?? 0;
    const temper = ports.gear(id).temper;
    sum += tierOf(def) >= 2 ? stat * temperK(temper) : stat * GEAR_TUNING.combat.temperPerLevel * temper;
  }
  return GEAR_TUNING.combat.defenceScale * sum;
}

/** Affix ids on the equipped pieces: Ember and Sworn count on the weapon, Cinder on any piece. */
function equippedAffixes(ports: CombatPorts): { weapon?: string; all: Set<string> } {
  const all = new Set<string>();
  let weapon: string | undefined;
  for (const slot of ['weapon', 'offhand', 'armour', 'trinket'] as const) {
    const id = ports.equipped(slot);
    const a = id ? ports.gear(id).affix : undefined;
    if (!a) continue;
    all.add(a);
    if (slot === 'weapon') weapon = a;
  }
  return { weapon, all };
}

/** Registers `gear.attack` (attacker band) and `gear.defence` (buffs band). Returns the undo. */
export function registerGearModifiers(damage: DamageHost, ports: CombatPorts, playerId: string = PLAYER_ID): () => void {
  const offs = [
    damage.addModifier(
      ATTACK_MODIFIER.id,
      (req, target) => {
        // Ally hits and status ticks (the Ember burn included) are not the player's weapon.
        if (req.attackerId !== playerId || req.kind === 'status') return;
        const f = weaponFactor(ports);
        const { weapon } = equippedAffixes(ports);
        let k = f;
        if (weapon === 'sworn' && target.kind.includes('wraith')) k *= 1 + AFFIX_EFFECTS.sworn.bonus;
        if (k !== 1) req.amount *= k;
      },
      ATTACK_MODIFIER.order,
    ),
    // After block, parry and shields have settled the outcome: only a hit that lands ignites.
    damage.addModifier(
      EMBER_MODIFIER.id,
      (req, target) => {
        if (req.attackerId !== playerId || req.kind === 'status') return;
        if (equippedAffixes(ports).weapon === 'ember' && req.outcome === 'hit' && target.team !== 'player' && req.amount > 0) ports.ignite?.(target.id, playerId);
      },
      EMBER_MODIFIER.order,
    ),
    damage.addModifier(
      DEFENCE_MODIFIER.id,
      (req, target) => {
        if (target.id !== playerId || req.kind === 'fall') return;
        const d = defenceRating(ports);
        if (d > 0) req.amount *= 100 / (100 + d);
        if (req.kind === 'status' && req.statusKind === 'ignite' && equippedAffixes(ports).all.has('cinder')) req.amount *= 1 - AFFIX_EFFECTS.cinder.resist;
      },
      DEFENCE_MODIFIER.order,
    ),
  ];
  return () => offs.forEach((off) => off());
}
