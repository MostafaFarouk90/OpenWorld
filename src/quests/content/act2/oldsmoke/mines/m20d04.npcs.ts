// M20's minor cast (plans/act2-A13.md 3.0), additive on A4's anchors, following src/oldsmoke/npcDefs.ts. The trees are in
// src/dialogue/content/act2/oldsmoke/mines/m20d04.dialogue.ts.
import type { NpcDef } from '../../../../../npcs/types';
import type { NpcSpec } from '../../../../../region/layoutTypes';

const def = (id: string, model: NpcDef['model'], extra: { scale?: number; tint?: number | null } = {}): NpcDef => ({
  id, nameKey: `npc.${id}.name`, model, scale: extra.scale ?? 1, tint: extra.tint ?? null, dialogueId: `npc-${id}`, idleClip: 'Idle',
});

export const M20D04_NPC_DEFS: NpcDef[] = [
  def('steward-captain', 'knight', { scale: 1.03, tint: 0x2f4a2f }),
  def('wyrmling-keeper', 'rogue', { tint: 0x7a6a50 }),
];

export const M20D04_NPC_STRINGS: Record<string, string> = {
  'npc.steward-captain.name': 'Steward-Captain Hobb Varley',
  'npc.wyrmling-keeper.name': 'Wyrmling-Keeper Tamsin Roke',
};

/**
 * The captain stands at his own anchor from the quest's start and is led away when it ends; the keeper stays by the
 * nursery until then. Both are A4's anchors (`oldsmoke.m20.captain`, `oldsmoke.m19.nursery`).
 */
export const M20D04_NPCS: NpcSpec[] = [
  { id: 'steward-captain', post: 'oldsmoke.m20.captain', presentWhen: 'story.m20.started', absentWhen: 'story.m20.complete' },
  { id: 'wyrmling-keeper', post: 'oldsmoke.m19.nursery', presentWhen: 'story.m20.started', absentWhen: 'story.m20.complete' },
];
