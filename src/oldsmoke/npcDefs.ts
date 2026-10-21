// Deepgate's cast (design 8.2, 14.2). The dialogue trees (`npc-<id>`) are A13's; until they land a talk does nothing. Act 1's
// `grisel` (Lord Aldous Grisel in the Harrowmark Keep) stays where he is: Deepgate's Aldous is a separate NPC, `aldous`.
import type { NpcDef, NpcModelId } from '../npcs/types';
import type { NpcSpec } from '../region/layoutTypes';
import { HALL_HOSTILE_FLAG, MARKET_MINER_GUARD_FLAG, MARKET_STEWARD_GUARD_FLAG } from './flags';

const def = (id: string, model: NpcModelId, extra: { scale?: number; tint?: number | null } = {}): NpcDef => ({
  id,
  nameKey: `npc.${id}.name`,
  model,
  scale: extra.scale ?? 1,
  tint: extra.tint ?? null,
  dialogueId: `npc-${id}`,
  idleClip: 'Idle',
});

const STEWARD = 0x3f6a4a;
const SOOT = 0x5a5048;
const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

export const OLDSMOKE_NPC_DEFS: NpcDef[] = [
  def('aldous', 'knight', { tint: 0x2f4a2f }),
  def('wenna', 'rogue', { tint: 0x4f7a56 }),
  def('slagg', 'barbarian', { scale: 1.05, tint: 0x4a4540 }),
  def('pike', 'mage', { scale: 0.97, tint: 0x6a6a68 }),
  ...range(2).map((n) => def(`steward-gate-${n}`, 'knight', { tint: STEWARD })),
  ...range(2).map((n) => def(`steward-market-${n}`, 'knight', { tint: STEWARD })),
  ...range(4).map((n) => def(`steward-hall-${n}`, 'knight', { tint: STEWARD })),
  ...range(2).map((n) => def(`miner-guard-${n}`, 'barbarian', { scale: 1.02, tint: SOOT })),
  ...range(4).map((n) => def(`miner-${n}`, 'barbarian', { scale: 0.98, tint: 0x6a5e50 })),
];

export const OLDSMOKE_NPC_STRINGS_EN: Record<string, string> = {
  'npc.aldous.name': 'Lord Aldous Grisel',
  'npc.wenna.name': 'Lady Wenna Grisel',
  'npc.slagg.name': 'Foreman Burchard Slagg',
  'npc.pike.name': 'Fire-tender Cuthbert Pike',
  ...Object.fromEntries([...range(2).map((n) => `steward-gate-${n}`), ...range(2).map((n) => `steward-market-${n}`), ...range(4).map((n) => `steward-hall-${n}`)].map((id) => [`npc.${id}.name`, 'Grisel Steward'])),
  ...Object.fromEntries(range(2).map((n) => [`npc.miner-guard-${n}.name`, "Miners' Watch"])),
  ...Object.fromEntries(range(4).map((n) => [`npc.miner-${n}.name`, 'Deepgate Miner'])),
};

/**
 * Layout NPC specs: each has a layout post (the interior posts of Aldous, Wenna and the hall stewards are moved to by
 * `OLDSMOKE_POST_RULES`). The market guards are chosen by R10's readers; the hall stewards give way to A13's fight.
 */
export const OLDSMOKE_NPCS: NpcSpec[] = [
  { id: 'aldous', post: 'npc-post.aldous.court' },
  { id: 'wenna', post: 'npc-post.wenna.court' },
  { id: 'slagg', post: 'npc-post.slagg.shaft' },
  { id: 'pike', post: 'npc-post.pike.shaft' },
  { id: 'steward-gate-1', post: 'oldsmoke.gate.guard.1' },
  { id: 'steward-gate-2', post: 'oldsmoke.gate.guard.2' },
  { id: 'steward-market-1', post: 'oldsmoke.market.guard.1', presentWhen: MARKET_STEWARD_GUARD_FLAG },
  { id: 'steward-market-2', post: 'oldsmoke.market.guard.2', presentWhen: MARKET_STEWARD_GUARD_FLAG },
  { id: 'miner-guard-1', post: 'oldsmoke.market.guard.3', presentWhen: MARKET_MINER_GUARD_FLAG },
  { id: 'miner-guard-2', post: 'oldsmoke.market.guard.4', presentWhen: MARKET_MINER_GUARD_FLAG },
  ...range(4).map((n) => ({ id: `steward-hall-${n}`, post: `npc-post.steward-hall.${n}`, absentWhen: HALL_HOSTILE_FLAG })),
  { id: 'miner-1', post: 'npc-post.miner.1' },
  { id: 'miner-2', post: 'npc-post.miner.2' },
  { id: 'miner-3', post: 'npc-post.miner.shaft.1' },
  { id: 'miner-4', post: 'npc-post.miner.shaft.2' },
];
