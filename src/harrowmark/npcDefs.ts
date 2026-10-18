import type { NpcDef, NpcModelId } from '../npcs/types';

const def = (id: string, model: NpcModelId, extra: { scale?: number; tint?: number | null } = {}): NpcDef => ({
  id,
  nameKey: `npc.${id}.name`,
  model,
  scale: extra.scale ?? 1,
  tint: extra.tint ?? null,
  dialogueId: `npc-${id}`,
  idleClip: 'Idle',
});

/** Harrowmark's cast (design section 8). Gaut, Stane, Aelfreda and Tobb are Brightwater NPCs that move by thread 6's post rules. */
export const HARROWMARK_NPC_DEFS: NpcDef[] = [
  def('rook', 'knight', { tint: 0x6f7f9a }),
  def('aldith', 'barbarian', { scale: 0.95 }),
  def('gerta', 'rogue', { tint: 0x3a3430 }),
  def('whitlock', 'mage', { tint: 0x4a4658 }),
  def('pennard', 'mage', { tint: 0xd98a3a }),
  def('ashdown', 'rogueHooded', { tint: 0x8a2f2a }),
  def('dunstan', 'barbarian'),
  def('wace', 'rogueHooded', { tint: 0x7a6a4a }),
  def('wystan', 'knight', { tint: 0x8d8d92 }),
  def('merrin', 'mage', { tint: 0x2f8a86 }),
  def('edric', 'rogue', { scale: 0.72, tint: 0xd9b23a }),
  def('vey', 'knight', { tint: 0x1c1c22 }),
];

export const HARROWMARK_NPC_STRINGS_EN: Record<string, string> = {
  'npc.rook.name': 'Captain Ealdred Rook',
  'npc.aldith.name': 'Aldith Stonebrewer',
  'npc.gerta.name': 'Gerta Quickfingers',
  'npc.whitlock.name': 'Whitlock the Archivist',
  'npc.pennard.name': 'Magister Ceolwin Pennard',
  'npc.ashdown.name': 'Archer-Sergeant Cenric Ashdown',
  'npc.dunstan.name': 'Master Smith Dunstan Ironside',
  'npc.wace.name': 'Wace Carter',
  'npc.wystan.name': 'Lord Wystan Halvard',
  'npc.merrin.name': 'Lady Merrin Oswin',
  'npc.edric.name': 'King Edric IV',
  'npc.vey.name': 'Lord-Regent Morcant Vey',
};
