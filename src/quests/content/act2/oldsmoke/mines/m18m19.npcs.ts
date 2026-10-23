// The minor cast of M18 (plan section 3.0): additive defs and specs, in the shape of src/oldsmoke/npcDefs.ts. The dialogue tree
// (`npc-pike-apprentice`) is in src/dialogue/content/act2/oldsmoke/mines/m18m19.dialogue.ts. Pike and Wenna are A4's.
import type { NpcDef, NpcModelId } from '../../../../../npcs/types';
import type { NpcSpec } from '../../../../../region/layoutTypes';

const def = (id: string, model: NpcModelId, extra: { scale?: number; tint?: number | null } = {}): NpcDef => ({
  id, nameKey: `npc.${id}.name`, model, scale: extra.scale ?? 1, tint: extra.tint ?? null, dialogueId: `npc-${id}`, idleClip: 'Idle',
});

export const M18M19_NPC_DEFS: NpcDef[] = [
  def('pike-apprentice', 'rogueHooded', { scale: 0.92, tint: 0x7a6a5a }),
];

export const M18M19_NPC_STRINGS: Record<string, string> = {
  'npc.pike-apprentice.name': "Hob, Pike's Apprentice",
};

/**
 * Layout NPC specs on A4's anchors. The apprentice tends the cavern from the first day, so he is there when M18 asks for him;
 * his post (`npc-post.pike-apprentice.bellows`) is not in A4's list and is asked for.
 */
export const M18M19_NPCS: NpcSpec[] = [
  { id: 'pike-apprentice', post: 'npc-post.pike-apprentice.bellows' },
];
