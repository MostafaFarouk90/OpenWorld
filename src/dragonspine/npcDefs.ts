// The Dragonspine cast (design 8): Thorgar, Eadgyth, Ansgar, the lodge hunters, the sled-hands, the cave hunter, the egg thief
// and the pilgrims. Dialogue trees (`npc-<id>`) are K13's, vendor stock K10's (by NPC id). The two hunters in the hall stand on the
// interior's own posts through `DRAGONSPINE_POST_RULES`.
import type { NpcDef, NpcModelId } from '../npcs/types';
import type { NpcSpec } from '../region/layoutTypes';

const def = (id: string, model: NpcModelId, extra: { scale?: number; tint?: number | null } = {}): NpcDef => ({
  id,
  nameKey: `npc.${id}.name`,
  model,
  scale: extra.scale ?? 1,
  tint: extra.tint ?? null,
  dialogueId: `npc-${id}`,
  idleClip: 'Idle',
});

const HUNTER = 0x3f6a3c;
const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

export const DRAGONSPINE_NPC_DEFS: NpcDef[] = [
  def('thorgar', 'barbarian', { scale: 1.08, tint: 0x8a7458 }),
  def('eadgyth', 'rogueHooded', { tint: 0xe6e6e6 }),
  def('ansgar', 'mage', { tint: 0x6b4a2c }),
  ...range(6).map((n) => def(`lodge-hunter-${n}`, n % 2 === 0 ? 'barbarian' : 'rogue', { tint: HUNTER })),
  ...range(2).map((n) => def(`sled-hand-${n}`, 'barbarian', { scale: 0.98, tint: 0x6a5a48 })),
  def('lodge-hunter-cave', 'rogue', { tint: HUNTER }),
  def('egg-thief', 'rogue', { scale: 0.96, tint: 0x7a6040 }),
  ...range(3).map((n) => def(`pilgrim-${n}`, 'mage', { tint: 0x8a8a8a })),
];

export const DRAGONSPINE_NPC_STRINGS_EN: Record<string, string> = {
  'npc.thorgar.name': 'Thorgar Skyhold',
  'npc.eadgyth.name': 'Eadgyth Frostbrow',
  'npc.ansgar.name': 'Brother Ansgar',
  ...Object.fromEntries(range(6).map((n) => [`npc.lodge-hunter-${n}.name`, 'Wyrmwatch Hunter'])),
  ...Object.fromEntries(range(2).map((n) => [`npc.sled-hand-${n}.name`, 'Sled-hand'])),
  'npc.lodge-hunter-cave.name': 'Wyrmwatch Hunter',
  'npc.egg-thief.name': 'Egg Thief',
  ...Object.fromEntries(range(3).map((n) => [`npc.pilgrim-${n}.name`, 'Pilgrim'])),
};

/** One spec and one post each; the post is a layout anchor (`npc-post.` names are the contract's). */
export const DRAGONSPINE_NPCS: NpcSpec[] = [
  { id: 'thorgar', post: 'npc-post.thorgar.yard' },
  { id: 'eadgyth', post: 'npc-post.eadgyth.fire' },
  { id: 'ansgar', post: 'npc-post.ansgar.anvil' },
  ...range(6).map((n) => ({ id: `lodge-hunter-${n}`, post: `npc-post.lodge-hunter-${n}` })),
  ...range(2).map((n) => ({ id: `sled-hand-${n}`, post: `npc-post.sled-hand-${n}` })),
  { id: 'lodge-hunter-cave', post: 'npc-post.lodge-hunter-cave' },
  { id: 'egg-thief', post: 'npc-post.egg-thief' },
  ...range(3).map((n) => ({ id: `pilgrim-${n}`, post: `npc-post.pilgrim-${n}` })),
];
