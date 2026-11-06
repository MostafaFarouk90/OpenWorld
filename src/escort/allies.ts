// Act 4 L4 (plans/act4-L4.md section 1.4): the people L10 and L11 escort. Each member id names a look and a role;
// `memberSpec(id, ...)` builds the spec the engine spawns. Edric and Rook are escorted allies here, never companion
// seats (the party service, the portraits and the seat count never see them).
//   walker  -> never attacks: Edric, the delegates, the miners, the carter
//   fighter -> swings like the militia, never the killing blow: Rook, the watch, the delegations' guards
import { HARROWMARK_NPC_DEFS } from '../harrowmark/npcDefs';
import type { NpcDef, NpcModelId, NpcModelLoader } from '../npcs/types';
import { R22_CHOICE_FLAG, withEdricBlade } from '../companions/act4/edric';
import { npcEscortBodyFactory, type EscortMemberSpec, type EscortRole } from './EscortMembers';

interface AllyLook {
  role: EscortRole;
  /** A shipped NPC def by id, or a look of its own. */
  npc: string | { model: NpcModelId; tint: number; scale?: number };
}

const look = (role: EscortRole, model: NpcModelId, tint: number, scale = 1): AllyLook => ({ role, npc: { model, tint, scale } });

/** House colours (design 3): Halvard steel-blue, Oswin teal, Grisel ochre. Wenna's miners in soot brown. */
const HOUSE = { halvard: 0x4a5a7a, oswin: 0x2f8a86, grisel: 0xa0783a } as const;
const MINER = 0x5a4a3a;

export const ESCORT_ALLIES: Readonly<Record<string, AllyLook>> = {
  // M40, M41
  edric: { role: 'walker', npc: 'edric' },
  rook: { role: 'fighter', npc: 'rook' },
  'watch.1': look('fighter', 'knight', 0x6f7f9a),
  'watch.2': look('fighter', 'knight', 0x66748c),
  // M35: one delegate and two guards per House (Orrin is the Grisel steward)
  'delegate.halvard': look('walker', 'knight', HOUSE.halvard),
  'delegate.oswin': look('walker', 'mage', HOUSE.oswin),
  'delegate.grisel': look('walker', 'mage', HOUSE.grisel),
  'guard.halvard.1': look('fighter', 'knight', HOUSE.halvard),
  'guard.halvard.2': look('fighter', 'knight', HOUSE.halvard),
  'guard.oswin.1': look('fighter', 'knight', HOUSE.oswin),
  'guard.oswin.2': look('fighter', 'knight', HOUSE.oswin),
  'guard.grisel.1': look('fighter', 'barbarian', HOUSE.grisel),
  'guard.grisel.2': look('fighter', 'barbarian', HOUSE.grisel),
  // R21: leaders walk one group of 3, "all" walks two groups of 4 (12 stand at the refuge later, L1 PR 2)
  ...Object.fromEntries(
    Array.from({ length: 12 }, (_, i) => [`miner.${i + 1}`, look('walker', (['barbarian', 'rogue', 'barbarian', 'rogueHooded'] as const)[i % 4], MINER, 0.95 + (i % 3) * 0.03)]),
  ),
  // R24: the Ashwalker who pulls the rain-cask cart
  carter: look('walker', 'rogueHooded', 0x8a8478),
};

/** Ids an escort def may name as `kind: 'npc'` members. */
export const ESCORT_ALLY_IDS: readonly string[] = Object.keys(ESCORT_ALLIES);

export function isEscortAlly(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(ESCORT_ALLIES, id);
}

/** The NPC def of a member id (Edric's carries the R22 blade from `flag`). */
export function allyNpcDef(id: string, flag: (key: string) => unknown): NpcDef | null {
  if (!isEscortAlly(id)) return null;
  const a = ESCORT_ALLIES[id];
  if (!a) return null;
  if (typeof a.npc === 'string') {
    const shipped = HARROWMARK_NPC_DEFS.find((d) => d.id === a.npc);
    if (!shipped) return null;
    return id === 'edric' ? withEdricBlade(shipped, flag(R22_CHOICE_FLAG)) : shipped;
  }
  return { id: `escort.${id}`, nameKey: `escort.member.${id.split('.')[0]}`, model: a.npc.model, scale: a.npc.scale ?? 1, tint: a.npc.tint, dialogueId: '', idleClip: 'Idle' };
}

/** The spec the engine spawns for a member id, or null for an unknown id. */
export function memberSpec(id: string, loader: NpcModelLoader | null, flag: (key: string) => unknown): EscortMemberSpec | null {
  if (!isEscortAlly(id)) return null;
  const a = ESCORT_ALLIES[id];
  const def = allyNpcDef(id, flag);
  if (!a || !def) return null;
  return { id, role: a.role, makeBody: npcEscortBodyFactory(loader, def) };
}
