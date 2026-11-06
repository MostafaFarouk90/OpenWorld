// Act 4's new Harrowmark cast (L2; plans/act4-L2.md section 3): the M36 delegates, R19's four banner-captains, R23's five old
// watchmen and Vey's checkpoint guards. Names are invented (Q6) and logged in design/changes-applied.md. L10 writes their
// dialogue (`npc-<id>`); until it lands a talk does nothing (the NpcManager's warn-once path).
import type { NpcDef, NpcModelId } from '../../npcs/types';
import { CHECKPOINTS } from './sites';
import { guardId } from './act4.layout';

const def = (id: string, model: NpcModelId, extra: { scale?: number; tint?: number | null } = {}): NpcDef => ({
  id,
  nameKey: `npc.${id}.name`,
  model,
  scale: extra.scale ?? 1,
  tint: extra.tint ?? null,
  dialogueId: `npc-${id}`,
  idleClip: 'Idle',
});

/** Vey's guards wear soot-black plate (the Charred Footman's colours, on the friendly knight figure). */
const VEY_TINT = 0x2a2624;

export const ACT4_NPC_DEFS: NpcDef[] = [
  def('aldric-cole', 'knight', { tint: 0x8d8d92 }),
  def('wilmot-penn', 'mage', { scale: 0.95, tint: 0x2f6a68 }),
  def('captain-hesketh', 'rogueHooded', { tint: 0x5a6a3a }),
  def('captain-morwen', 'barbarian', { tint: 0x7a7a80 }),
  def('captain-bran', 'knight', { tint: 0x6a4a2a }),
  def('captain-tolly', 'barbarian', { scale: 0.95, tint: 0x8a6a3a }),
  def('witness-barracks', 'knight', { scale: 0.95, tint: 0x5a6a86 }),
  def('witness-gatehouse', 'barbarian', { scale: 0.95, tint: 0x5a6a86 }),
  def('witness-chapel', 'mage', { scale: 0.92, tint: 0x5a6a86 }),
  def('witness-anvil', 'barbarian', { scale: 0.95, tint: 0x5a6a86 }),
  def('witness-stables', 'rogue', { scale: 0.95, tint: 0x5a6a86 }),
  ...CHECKPOINTS.flatMap((c) => [1, 2].map((k) => def(guardId(c, k), 'knight', { tint: VEY_TINT }))),
];

export const ACT4_NPC_STRINGS_EN: Record<string, string> = {
  'npc.aldric-cole.name': 'Ser Aldric Cole',
  'npc.wilmot-penn.name': 'Wilmot Penn, Oswin Clerk',
  'npc.captain-hesketh.name': 'Captain Hesketh of the Archers',
  'npc.captain-morwen.name': 'Captain Morwen of the Pikes',
  'npc.captain-bran.name': 'Captain Bran of the Horse',
  'npc.captain-tolly.name': 'Captain Tolly of the Engineers',
  'npc.witness-barracks.name': 'Old Cuthred Hale',
  'npc.witness-gatehouse.name': 'Osgood Fenn, Gate-Warden',
  'npc.witness-chapel.name': 'Wulfstan Reed',
  'npc.witness-anvil.name': 'Aldred Tapper',
  'npc.witness-stables.name': 'Leofwine the Stabler',
  ...Object.fromEntries(CHECKPOINTS.flatMap((c) => [1, 2].map((k) => [`npc.${guardId(c, k)}.name`, "Regent's Guard"]))),
};
