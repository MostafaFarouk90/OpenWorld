/**
 * K16 era kit (coordinator ruling 2026-11-03): a `?act3=` jump into the Dragonspine or the summit (m28 onward) arrives with
 * what an L17 to L20 player carries there in a normal playthrough, not Act 1's starter sword and shield. The crag and the
 * peaks are tuned against this kit, so the fixtures and the live jump share it.
 *
 * The kit, in order (taste call logged in design/changes-applied.md):
 * 1. the class's tier 3 Ashforged set (forged at the Hushed Anvil in Act 2) is given when not held;
 * 2. each gear slot equips the best held piece by stat (so R12's reed armour or a tier 4 reward beats Ashplate);
 * 3. the equipped pieces are tempered to `ERA_TEMPER` for the block (never lowered), and the Anvil records tiers 2 and 3
 *    as tempered there, so Thorgar's smith does not refuse with "temper one at the Anvil first";
 * 4. every skill point the player has is spent, lowest tier first across the branches (tiers 4 and 5 only once the
 *    master's book allows them); learning fills the ability bar;
 * 5. healing flasks are topped up to the bag's cap;
 * 6. the party is Aelfreda and Hrolf (both joined in Act 2; the second seat opens at the Act 2 ending).
 * Warmth needs nothing here: it is derived from the shrine flags the jump already injects.
 */
import { GEAR_ROWS, type GearRow } from '../gear/catalog';
import { TIER4_REWARD_ROWS, TIER4_ROWS } from '../gear/tier4/catalog';
import { SKILLS } from '../progression/skills';
import type { Act3BlockOf } from './act3Jump';

/** Temper level of the equipped pieces per arrival block. */
export const ERA_TEMPER: Readonly<Record<Act3BlockOf, number>> = { greyfen: 0, spine: 3, summit: 4 };
/** Anvil tiers an era player has tempered at the Hushed Anvil (Act 2 brought tiers 2 and 3 there). */
export const ERA_ANVIL_TIERS: readonly number[] = [2, 3];
export const ERA_PARTY: readonly string[] = ['aelfreda', 'hrolf'];
export const ERA_FLASK = 'healing-flask';
const SLOTS = ['weapon', 'offhand', 'armour'] as const;
type Slot = (typeof SLOTS)[number];

const ROWS: readonly GearRow[] = [...GEAR_ROWS, ...TIER4_ROWS, ...TIER4_REWARD_ROWS];
/** A piece made for another class (R14's longbow for a Knight) is never worn; pieces without a gear row suit anyone. */
export const suitsClass = (id: string, classId: string): boolean => {
  const r = ROWS.find((x) => x.id === id);
  return !r || r.classes.includes(classId as never);
};

/** True for the blocks the kit applies to: the Dragonspine and the summit. */
export const wantsEraKit = (block: Act3BlockOf | undefined): block is 'spine' | 'summit' => block === 'spine' || block === 'summit';

/** The class's tier 3 pieces (Knight: longsword, spike shield, Ashplate). */
export const eraGear = (classId: string): string[] =>
  GEAR_ROWS.filter((r) => r.tier === 3 && r.classes.includes(classId as never)).map((r) => r.id);

export interface EraKitPorts {
  inventory: {
    has(id: string): boolean;
    add(id: string, n: number): number;
    count(id: string): number;
    capOf(id: string): number;
    items(): readonly { id: string; count: number }[];
    equip(id: string): { ok: boolean };
    equipped(slot: Slot): string | null;
    gear(id: string): { temper: number };
    setTemper(id: string, level: number): boolean;
  };
  /** The item def's slot and stat (attack for weapons, defense otherwise); undefined for an unknown id. */
  itemInfo(id: string): { slot?: string; stat: number } | undefined;
  progression?: { skillPoints: number; learn(id: string): { ok: boolean } };
  companions?: { setActive(ids: readonly string[]): boolean };
  markAnvilTier?(tier: number): void;
}

export interface EraKitReport { given: string[]; equipped: Partial<Record<Slot, string>>; learned: string[]; party: boolean }

export function applyEraKit(p: EraKitPorts, classId: string, block: 'spine' | 'summit'): EraKitReport {
  const inv = p.inventory;
  const given: string[] = [];
  for (const id of eraGear(classId)) {
    if (!inv.has(id) && inv.add(id, 1) > 0) given.push(id);
  }
  const equipped: Partial<Record<Slot, string>> = {};
  for (const slot of SLOTS) {
    let best: { id: string; stat: number } | null = null;
    const current = inv.equipped(slot);
    for (const { id } of inv.items()) {
      const info = p.itemInfo(id);
      if (info?.slot !== slot || !suitsClass(id, classId)) continue;
      // Strictly better replaces; a tie keeps the worn piece, then the first held.
      if (!best || info.stat > best.stat || (info.stat === best.stat && id === current)) best = { id, stat: info.stat };
    }
    if (best && (current === best.id || inv.equip(best.id).ok)) equipped[slot] = best.id;
    const worn = inv.equipped(slot);
    if (worn && inv.gear(worn).temper < ERA_TEMPER[block]) inv.setTemper(worn, ERA_TEMPER[block]);
  }
  for (const t of ERA_ANVIL_TIERS) p.markAnvilTier?.(t);

  const learned: string[] = [];
  const prog = p.progression;
  if (prog) {
    // Tier order, then catalog order (branch by branch): every tier is filled across the branches before the next.
    const tree = SKILLS.filter((s) => s.classId === classId).slice().sort((a, b) => a.tier - b.tier);
    for (const s of tree) {
      if (prog.skillPoints < s.cost) continue;
      if (prog.learn(s.id).ok) learned.push(s.id);
    }
  }

  const room = inv.capOf(ERA_FLASK) - inv.count(ERA_FLASK);
  if (room > 0) inv.add(ERA_FLASK, room);

  const party = p.companions?.setActive(ERA_PARTY) ?? false;
  return { given, equipped, learned, party };
}
