// Act 4 L7 (Q3, plans/act4-L7.md section 2.1): Gaut's Oathblade. A Knight carries the sword (tier 4 at +5, Sworn); any
// other class carries the trinket (+10% poise damage). The form follows the class: a class change swaps it, the sword
// always comes back at +5 with Sworn, and fitted shard-gems go back to the bag first. Pure: the plugin supplies ports.
import type { ClassId } from '../../actors/classes';
import type { ModifiableRequest } from '../../actors/DamageResolver';
import type { EquipSlot } from '../../hud/ports';
import { OATHBLADE } from './catalog';

export interface OathbladePorts {
  /** The chosen class; null before M07's choice. */
  classId(): ClassId | null;
  has(id: string): boolean;
  add(id: string, n: number): number;
  remove(id: string, n: number): boolean;
  setTemper(itemId: string, level: number, affix?: string): boolean;
  equipped(slot: EquipSlot): string | null;
  equip(id: string): { ok: boolean };
  /** Whether the item's shard-gems would all fit back in the bag (absent: nothing is ever socketed). */
  gemRoomFor?(itemId: string): boolean;
}

/** The form a class carries: the sword for a Knight (and before any class, which M39 never meets), else the trinket. */
export const oathbladeFormFor = (classId: ClassId | null): string => (classId === null || classId === 'knight' ? OATHBLADE.sword : OATHBLADE.carried);

const slotOf = (id: string): EquipSlot => (id === OATHBLADE.sword ? 'weapon' : 'trinket');

/** Gives the sword its +5 and Sworn (idempotent; the sword's record is set, never read). */
function temperSword(p: OathbladePorts): void {
  p.setTemper(OATHBLADE.sword, OATHBLADE.temper, OATHBLADE.affix);
}

export type GrantOathbladeResult = { ok: true; granted: string | null } | { ok: false; reason: 'full' };

/** M39's reward: the form for the current class. Gives nothing when either form is already held. */
export function grantOathblade(p: OathbladePorts): GrantOathbladeResult {
  if (p.has(OATHBLADE.sword) || p.has(OATHBLADE.carried)) return { ok: true, granted: null };
  const id = oathbladeFormFor(p.classId());
  if (p.add(id, 1) < 1) return { ok: false, reason: 'full' };
  if (id === OATHBLADE.sword) temperSword(p);
  return { ok: true, granted: id };
}

export type ReconcileResult = 'none' | 'swapped' | 'waiting';

/**
 * Makes the held form match the class: run on `class.changed`, `class.chosen` and `save.loaded`. A sword with gems that
 * would not fit back in the bag stays (`waiting`) until the next run, so a gem is never lost. The new form is equipped
 * only when the old one was and its own slot is free, so it never displaces another trinket or weapon.
 */
export function reconcileOathblade(p: OathbladePorts): ReconcileResult {
  const want = oathbladeFormFor(p.classId());
  const held = p.has(OATHBLADE.sword) ? OATHBLADE.sword : p.has(OATHBLADE.carried) ? OATHBLADE.carried : null;
  if (held === null) return 'none';
  if (held === want) {
    if (held === OATHBLADE.sword) temperSword(p);
    return 'none';
  }
  if (held === OATHBLADE.sword && p.gemRoomFor && !p.gemRoomFor(held)) return 'waiting';
  const wasEquipped = p.equipped(slotOf(held)) === held;
  if (!p.remove(held, 1)) return 'none';
  if (p.add(want, 1) < 1) {
    // Never leave the player with neither form.
    p.add(held, 1);
    if (held === OATHBLADE.sword) temperSword(p);
    return 'waiting';
  }
  if (want === OATHBLADE.sword) temperSword(p);
  if (wasEquipped && p.equipped(slotOf(want)) === null) p.equip(want);
  return 'swapped';
}

/** True when the carried form adds its poise bonus to this request (the player's own hit, not a status tick). */
export function oathbladePoiseApplies(req: Pick<ModifiableRequest, 'attackerId' | 'kind'>, playerId: string, trinket: string | null): boolean {
  return trinket === OATHBLADE.carried && req.attackerId === playerId && req.kind !== 'status';
}

/** The poise after the carried form's +10% (unchanged when it does not apply). */
export function oathbladePoise(req: Pick<ModifiableRequest, 'attackerId' | 'kind' | 'poise'>, playerId: string, trinket: string | null): number {
  return oathbladePoiseApplies(req, playerId, trinket) ? req.poise * (1 + OATHBLADE.poiseBonus) : req.poise;
}

export const OATHBLADE_POISE_MODIFIER = { id: 'gear.oathblade.poise', order: -110 } as const;
