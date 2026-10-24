// Cinderreach's cast (design 8.2): the NPCs this region adds. Gaut, Aelfreda and Pennard already exist (Brightwater and
// Harrowmark) and are moved here by POST_RULES rows, never registered again. Hrolf's def is A5's (it carries his axe and
// tint). The dialogue trees (`npc-<id>`) are A12's; until they land a talk does nothing.
import { HROLF_NPC_DEF } from '../companions/hrolfLook';
import type { NpcSpec } from '../region/layoutTypes';
import type { NpcDef, NpcModelId } from '../npcs/types';
import { CINDERFORD_SEALED_FLAG } from './flags';

const def = (id: string, model: NpcModelId, extra: { scale?: number; tint?: number | null } = {}): NpcDef => ({
  id,
  nameKey: `npc.${id}.name`,
  model,
  scale: extra.scale ?? 1,
  tint: extra.tint ?? null,
  dialogueId: `npc-${id}`,
  idleClip: 'Idle',
});

export const CINDERREACH_NPC_DEFS: NpcDef[] = [
  def('osgar', 'knight', { tint: 0x6a5a44 }),
  def('ketta', 'rogueHooded', { tint: 0x7a8a5a }),
  def('maud', 'mage', { tint: 0x8a8a90 }),
  def('beornwyn', 'rogue', { tint: 0x7a4a6a }),
  // Named from this table: the companions plugin's `companion.hrolf.name` is not registered yet when the town's NPCs spawn.
  { ...HROLF_NPC_DEF, nameKey: 'npc.hrolf.name' },
  def('lantern-keeper', 'mage', { scale: 0.95, tint: 0x6a5a3a }),
  // R06's four households, hidden when the well is sealed and the town evacuated.
  def('household-1', 'barbarian', { scale: 0.95, tint: 0x8a6a4a }),
  def('household-2', 'rogue', { scale: 0.92, tint: 0x6a7a5a }),
  def('household-3', 'mage', { scale: 0.9, tint: 0x7a5a6a }),
  def('household-4', 'rogueHooded', { scale: 0.95, tint: 0x5a6a7a }),
  def('carter-bound', 'barbarian', { scale: 0.97, tint: 0x6a5a3a }),
  // A12's quest NPCs (additive; each on an existing A3 anchor).
  def('pell', 'rogue', { scale: 0.78, tint: 0x8a7a5a }),
  def('osric', 'barbarian', { scale: 0.96, tint: 0x6a6a4a }),
  def('ealdred', 'barbarian', { scale: 1.0, tint: 0x7a5a3a }),
  def('wynne', 'mage', { scale: 0.93, tint: 0x7a6a7a }),
  def('corwin', 'rogueHooded', { scale: 0.97, tint: 0x5a4a3a }),
  def('brand', 'knight', { scale: 0.98, tint: 0x7a3a2a }),
  def('redmane', 'barbarian', { scale: 1.1, tint: 0x8a3a2a }),
];

export const CINDERREACH_NPC_STRINGS_EN: Record<string, string> = {
  'npc.osgar.name': 'Reeve Osgar Thane',
  'npc.ketta.name': 'Ketta Fellwalker',
  'npc.maud.name': 'Mother Maud',
  'npc.beornwyn.name': 'Beornwyn Skald',
  'npc.lantern-keeper.name': 'The Lantern-Keeper',
  'npc.household-1.name': 'Edmer Holt',
  'npc.household-2.name': 'Wynflaed Holt',
  'npc.household-3.name': 'Godwin Marsh',
  'npc.household-4.name': 'Aelswith Marsh',
  'npc.carter-bound.name': 'The bound carter',
  'npc.pell.name': 'Pell',
  'npc.osric.name': 'Osric Reed',
  'npc.ealdred.name': 'Ealdred Ironbrow',
  'npc.wynne.name': 'Wynne Ironbrow',
  'npc.corwin.name': 'Corwin',
  'npc.brand.name': 'Sergeant Brand',
  'npc.redmane.name': 'Thrandil Redmane',
  'npc.hrolf.name': 'Hrolf Ironbrow',
};

/** Layout NPC specs: one spec and one post each; the movers (Osgar, Ketta) are driven by POST_RULES from their home post. */
export const CINDERREACH_NPCS: NpcSpec[] = [
  { id: 'osgar', post: 'npc-post.osgar.barricade' },
  { id: 'ketta', post: 'npc-post.ketta.pasture' },
  { id: 'maud', post: 'npc-post.maud.refuge', absentWhen: CINDERFORD_SEALED_FLAG },
  { id: 'beornwyn', post: 'npc-post.beornwyn.tavern', absentWhen: CINDERFORD_SEALED_FLAG },
  { id: 'hrolf', post: 'npc-post.hrolf', absentWhen: 'story.m13.hrolfJoined' },
  { id: 'lantern-keeper', post: 'npc-post.lantern-keeper.anvil' },
  ...[1, 2, 3, 4].map((n) => ({ id: `household-${n}`, post: `npc-post.household-${n}`, absentWhen: CINDERFORD_SEALED_FLAG })),
  // Caged in the camp from M15's start; A12's story flags release him.
  { id: 'carter-bound', post: 'npc-post.carter-bound', presentWhen: 'story.m15.started' },
  // A12's quest NPCs. Pell hides in the second fog hollow; Corwin joins after the first pack (his flag is the director's);
  // Redmane stands under guard by Osgar's Scorchhold post once spared (the director sets the flag; he leaves on D03's end).
  { id: 'pell', post: 'cinderreach.pasture.hollow.2', presentWhen: 'story.r05.started', absentWhen: 'story.r05.complete' },
  { id: 'osric', post: 'cinderreach.r07.sign.1', presentWhen: 'story.r07.started', absentWhen: 'story.r07.complete' },
  { id: 'ealdred', post: 'cinderreach.m13.hall.1', presentWhen: 'story.m13.started' },
  { id: 'wynne', post: 'cinderreach.r11.camp.1', presentWhen: 'story.r11.started' },
  { id: 'corwin', post: 'cinderreach.m15.search.3', presentWhen: 'story.m15.corwinHere', absentWhen: 'story.m15.complete' },
  { id: 'brand', post: 'cinderreach.m12.militia.1', presentWhen: 'story.m12.started' },
  { id: 'redmane', post: 'cinderreach.post.scorchhold.1', presentWhen: 'story.d03.redmaneHeld', absentWhen: 'story.d03.complete' },
];
