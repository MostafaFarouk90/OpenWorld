// The Greyfen's cast (design 8 and the Act 3 plan's Part 7.1 rows): Leofa Hartley, Dudda Reedly and his wife Hild (name
// invented, logged in design/changes-applied.md), Gytha Mireweather, the rangers, the deserter (Wybert Fenn, invented), the
// reed-cutters, the ferry folk and the chapel's ghost bell keeper. Looks are greybox tints; the dialogue trees (`npc-<id>`)
// are K12's, and until they land a talk does nothing. Leofa, Gytha, the deserter and the bell keeper move by postRules.ts.
import type { NpcSpec } from '../region/layoutTypes';
import type { NpcDef, NpcModelId } from '../npcs/types';
import { DESERTER_GONE_FLAG } from './flags';

const def = (id: string, model: NpcModelId, extra: { scale?: number; tint?: number | null } = {}): NpcDef => ({
  id,
  nameKey: `npc.${id}.name`,
  model,
  scale: extra.scale ?? 1,
  tint: extra.tint ?? null,
  dialogueId: `npc-${id}`,
  idleClip: 'Idle',
});

/** The fen's silver-green cast, after the plan's Part 11 palette. */
export const GREYFEN_NPC_DEFS: NpcDef[] = [
  def('leofa', 'rogueHooded', { tint: 0x5a6a4a }),
  def('dudda', 'barbarian', { scale: 1.02, tint: 0x6a6a52 }),
  def('hild', 'mage', { scale: 0.94, tint: 0x7a7a62 }),
  def('ferry-hand-1', 'barbarian', { scale: 0.96, tint: 0x5a5a48 }),
  def('ferry-hand-2', 'rogue', { scale: 0.95, tint: 0x5e6650 }),
  def('widow', 'mage', { scale: 0.9, tint: 0x4a4a52 }),
  def('gytha', 'mage', { scale: 0.92, tint: 0x4e5e3e }),
  def('causeway-ranger', 'rogueHooded', { scale: 0.97, tint: 0x4e5a3e }),
  def('greywatch-ranger-1', 'rogueHooded', { scale: 0.98, tint: 0x4a5a40 }),
  def('greywatch-ranger-2', 'rogue', { scale: 0.96, tint: 0x52603e }),
  def('greywatch-ranger-3', 'rogueHooded', { scale: 0.95, tint: 0x4e5642 }),
  def('deserter', 'rogue', { scale: 0.97, tint: 0x5a5040 }),
  def('reed-cutter-1', 'barbarian', { scale: 0.95, tint: 0x6a6648 }),
  def('reed-cutter-2', 'rogue', { scale: 0.93, tint: 0x6e6a4c }),
  def('herb-cutter', 'barbarian', { scale: 0.94, tint: 0x5e6a46 }),
  def('bell-keeper', 'mage', { scale: 0.96, tint: 0x8a9aa2 }),
];

export const GREYFEN_NPC_STRINGS_EN: Record<string, string> = {
  'npc.leofa.name': 'Leofa Hartley',
  'npc.dudda.name': 'Dudda Reedly',
  'npc.hild.name': 'Hild Reedly',
  'npc.ferry-hand-1.name': 'Ferry-hand',
  'npc.ferry-hand-2.name': 'Ferry-hand',
  'npc.widow.name': "The ferryman's widow",
  'npc.gytha.name': 'Gytha Mireweather',
  'npc.causeway-ranger.name': 'Causeway ranger',
  'npc.greywatch-ranger-1.name': 'Greywatch ranger',
  'npc.greywatch-ranger-2.name': 'Greywatch ranger',
  'npc.greywatch-ranger-3.name': 'Greywatch ranger',
  'npc.deserter.name': 'Wybert Fenn',
  'npc.reed-cutter-1.name': 'Reed-cutter',
  'npc.reed-cutter-2.name': 'Reed-cutter',
  'npc.herb-cutter.name': 'Reed-cutter',
  'npc.bell-keeper.name': 'The bell keeper',
};

/** Layout NPC specs: one spec and one home post each. */
export const GREYFEN_NPCS: NpcSpec[] = [
  { id: 'leofa', post: 'npc-post.leofa.reedgate' },
  { id: 'dudda', post: 'npc-post.dudda.ferry' },
  { id: 'hild', post: 'npc-post.hild.ferry' },
  { id: 'ferry-hand-1', post: 'greyfen.ferry.hand.1' },
  { id: 'ferry-hand-2', post: 'greyfen.ferry.hand.2' },
  { id: 'widow', post: 'npc-post.widow.ferry' },
  { id: 'gytha', post: 'npc-post.gytha.hut' },
  { id: 'causeway-ranger', post: 'npc-post.ranger.causeway' },
  // R14's missing rangers turn up at their posts once the patrol is missed (the third is the one tied up at post 3).
  { id: 'greywatch-ranger-1', post: 'greyfen.r14.ranger.1', presentWhen: 'story.r14.started' },
  { id: 'greywatch-ranger-2', post: 'greyfen.r14.ranger.2', presentWhen: 'story.r14.started' },
  { id: 'greywatch-ranger-3', post: 'greyfen.r14.tied', presentWhen: 'story.r14.started' },
  // The deserter: at the post 4 camp during R14, in the stocks once returned, gone once released (K12 places him in M27).
  { id: 'deserter', post: 'npc-post.deserter.camp', presentWhen: 'story.r14.started', absentWhen: DESERTER_GONE_FLAG },
  { id: 'reed-cutter-1', post: 'greyfen.r12.cutter.1' },
  { id: 'reed-cutter-2', post: 'greyfen.r12.cutter.2' },
  { id: 'herb-cutter', post: 'greyfen.m25.cutter' },
  // The ghost bell keeper appears with R13 and stands in the chapel porch (postRules.ts moves him in).
  { id: 'bell-keeper', post: 'npc-post.bell-keeper.door', presentWhen: 'story.r13.started' },
];
