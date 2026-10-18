import { TOBB_LOOK, buildTobbExtras } from '../region/tobbLook';
import type { NpcDef, NpcModelId } from './types';

const def = (
  id: string,
  model: NpcModelId,
  extra: { scale?: number; tint?: number | null } = {},
): NpcDef => ({
  id,
  nameKey: `npc.${id}.name`,
  model,
  scale: extra.scale ?? 1,
  tint: extra.tint ?? null,
  dialogueId: `npc-${id}`,
  idleClip: 'Idle',
});

// Rogue_Hooded.glb has only `Rogue_Head_Hooded` (no plain head under the hood), so Edda keeps her hood.
export const NPC_DEFS: NpcDef[] = [
  def('gaut', 'knight', { tint: 0x9aa0a8 }),
  def('edda', 'rogueHooded'),
  def('stane', 'barbarian'),
  def('aelfreda', 'mage', { tint: 0xffffff }),
  def('hob', 'mage'),
  def('wynn', 'barbarian', { scale: 0.95 }),
  // Tobb's cloak and lute are shared with the companion (thread 4b) through region/tobbLook.ts.
  { ...def('tobb', TOBB_LOOK.model, { scale: TOBB_LOOK.scale, tint: TOBB_LOOK.tint }), extras: buildTobbExtras },
  def('carter-1', 'barbarian', { tint: 0x8a7a5a }),
  def('carter-2', 'rogue', { tint: 0x7a6a4a }),
];
