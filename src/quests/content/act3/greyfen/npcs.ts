// The minor cast the Greyfen quests add to K3's: the three Reedgate folk (M23), the M27 brood keeper and D05's drowned monk
// (K3's handoff; his post is the Deeps interior's `npc-post.monk-echo.deeps`). Defs and specs in the shape of K3's npcDefs.ts;
// the dialogue trees (`npc-<id>`) are in src/dialogue/content/act3/greyfen/. The director registers them on the npcs service.
import type { NpcDef, NpcModelId } from '../../../../npcs/types';
import type { NpcSpec } from '../../../../region/layoutTypes';

const def = (id: string, model: NpcModelId, extra: { scale?: number; tint?: number | null } = {}): NpcDef => ({
  id, nameKey: `npc.${id}.name`, model, scale: extra.scale ?? 1, tint: extra.tint ?? null, dialogueId: `npc-${id}`, idleClip: 'Idle',
});

export const GREYFEN_Q_NPC_DEFS: NpcDef[] = [
  def('reedgate-folk-1', 'barbarian', { scale: 0.97, tint: 0x6a6a52 }),
  def('reedgate-folk-2', 'mage', { scale: 0.92, tint: 0x7a7660 }),
  def('reedgate-folk-3', 'rogue', { scale: 0.94, tint: 0x62664c }),
  def('brood-keeper', 'rogue', { scale: 0.96, tint: 0x5a4e40 }),
  def('monk-echo', 'mage', { scale: 0.98, tint: 0x9db8b0 }),
];

export const GREYFEN_Q_NPC_STRINGS: Record<string, string> = {
  'npc.reedgate-folk-1.name': 'Reedgate reed-wife',
  'npc.reedgate-folk-2.name': 'Reedgate net-mender',
  'npc.reedgate-folk-3.name': 'Reedgate boy',
  'npc.brood-keeper.name': 'The brood keeper',
  'npc.monk-echo.name': 'A drowned monk',
};

export const GREYFEN_Q_NPCS: NpcSpec[] = [
  { id: 'reedgate-folk-1', post: 'greyfen.reedgate.folk.1' },
  { id: 'reedgate-folk-2', post: 'greyfen.reedgate.folk.2' },
  { id: 'reedgate-folk-3', post: 'greyfen.reedgate.folk.3' },
  // the keeper is held at the brood while M27 runs and gone with it
  { id: 'brood-keeper', post: 'greyfen.m27.keeper', presentWhen: 'story.m27.started', absentWhen: 'story.m27.complete' },
  // the echo stands at the first air pocket of the Deeps from D05 on (the interior is locked until then)
  { id: 'monk-echo', post: 'npc-post.monk-echo.deeps', presentWhen: 'story.d05.started' },
];
