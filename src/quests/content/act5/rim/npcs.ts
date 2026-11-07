// The Rim quests' cast (N10 defines the new ones; N1 places only the camp's talk posts, `npc-post.<id>.rim`). Defs in the shape of
// L11's npcs.ts; the director registers them on the npcs service. Their trees (`npc-<id>`) are in src/dialogue/content/act5/rim/.
// Invented names (Q6) are logged under "Act 5 N10" in design/changes-applied.md.
//
// Movers (the coordinator's ruling 3): the allies stand at their Rim Camp posts from M49's arrival scene's end; Edric and Rook
// stand inside the Rim Gate from the moment it opens until then. Alric moves with his quests. Shops are N7's (they open on
// their own flags, `story.m49.complete` for the rim vendors).
import type { NpcDef, NpcModelId } from '../../../../npcs/types';
import type { NpcSpec } from '../../../../region/layoutTypes';
import type { PostRule } from '../../../posts';
import type { Condition } from '../../../types';
import { COOL, Q } from './ids';
import { ALRIC, M47_RIM_GATE_OPEN } from './m47.quest';
import { M48_GHOST } from './m48.quest';
import { F4_CLEANSED, M49_ARRIVED } from './m49.quest';
import { R26_CART_OUT, R26_GUARD, R26_GUARD_OUT, R26_IN, R26_MASTER, R26_WOUNDED } from './r26.quest';
import { R29_GHOST, R29_POSTS } from './r29.quest';
import { M50_KEEPER } from './m50.quest';
import { M51_CAPTAIN, M51_SCOUTS_DOWN } from './m51.quest';

const def = (id: string, model: NpcModelId, extra: { scale?: number; tint?: number | null; idleClip?: string } = {}): NpcDef => ({
  id, nameKey: `npc.${id}.name`, model, scale: extra.scale ?? 1, tint: extra.tint ?? null, dialogueId: `npc-${id}`, idleClip: extra.idleClip ?? 'Idle',
});
/** Shades of the stokers: the pale ash tint the Waste's dead wear, a touch of ember. */
const SHADE = 0xb8b0a4;

export const RIM_A5_NPC_DEFS: NpcDef[] = [
  def(ALRIC, 'barbarian', { scale: 1.04, tint: 0x8a6a50 }),
  def(R26_MASTER, 'rogueHooded', { scale: 1, tint: 0x7a6a58 }),
  ...([1, 2] as const).map((n) => def(R26_GUARD(n), 'knight', { scale: 0.98 + n * 0.02, tint: 0x8a5a3a })),
  def(M48_GHOST, 'rogueHooded', { scale: 0.97, tint: SHADE }),
  ...R29_POSTS.map((n) => def(R29_GHOST(n), n === 2 ? 'rogue' : 'barbarian', { scale: 0.96, tint: SHADE })),
  def(M50_KEEPER, 'mage', { scale: 0.98, tint: SHADE }),
  def(M51_CAPTAIN, 'knight', { scale: 1, tint: 0x3a3634 }),
];

export const RIM_A5_NPC_STRINGS: Record<string, string> = {
  [`npc.${ALRIC}.name`]: 'Alric, last of the stokers',
  [`npc.${R26_MASTER}.name`]: 'Leodwin, Oswin\'s convoy master',
  [`npc.${R26_GUARD(1)}.name`]: 'Sigeric, a convoy guard',
  [`npc.${R26_GUARD(2)}.name`]: 'Tidhelm, a convoy guard',
  [`npc.${M48_GHOST}.name`]: 'A stoker\'s shade',
  [`npc.${R29_GHOST(1)}.name`]: 'The hut\'s shade',
  [`npc.${R29_GHOST(2)}.name`]: 'The shelf\'s shade',
  [`npc.${R29_GHOST(3)}.name`]: 'The path\'s shade',
  [`npc.${M50_KEEPER}.name`]: 'Hildeburh, keeper of the Hall',
  [`npc.${M51_CAPTAIN}.name`]: 'Captain Harl of the Warhost',
};

const RIM = (id: string): string => `npc-post.${id}.rim`;

export const RIM_A5_NPCS: NpcSpec[] = [
  // Alric keeps the gate from M47's start (his post rows move him; home is his camp post)
  { id: ALRIC, post: RIM(ALRIC), presentWhen: 'story.m47.started' },
  // R26: the master and his guards at Rimfoot until the cart goes out (then the escort walks them), at the camp after
  { id: R26_MASTER, post: `${Q}.post.r26.master`, presentWhen: 'story.r26.started', absentWhen: R26_CART_OUT },
  // a guard walks with the cart while `guardOut` holds; the director clears it when he is carried off wounded or the convoy is in
  ...([1, 2] as const).map((n): NpcSpec => ({ id: R26_GUARD(n), post: `${Q}.post.r26.guard.${n}`, presentWhen: 'story.r26.started', absentWhen: R26_GUARD_OUT(n) })),
  // the shades stand at their posts from their quest's start (and after, harmlessly)
  { id: M48_GHOST, post: `${Q}.post.m48.ghost`, presentWhen: 'story.m48.started' },
  ...R29_POSTS.map((n): NpcSpec => ({ id: R29_GHOST(n), post: `${Q}.post.r29.stoker.${n}`, presentWhen: 'story.r29.started' })),
  { id: M50_KEEPER, post: `${Q}.post.m50.keeper`, presentWhen: 'story.m50.started' },
  // the scout captain kneels where his line broke
  { id: M51_CAPTAIN, post: `${Q}.post.m51.captain`, presentWhen: M51_SCOUTS_DOWN },
];

const active = (q: string): Condition => ({ quest: q, state: 'active' });
const flag = (k: string): Condition => ({ flag: k, equals: true });
const ARRIVED = flag(M49_ARRIVED);
/** The allies' shipped layout posts (a row that matches nothing sends the NPC home, never to the rim). */
const HOME = {
  edric: 'npc-post.edric', rook: 'npc-post.rook', wystan: 'npc-post.wystan', merrin: 'npc-post.merrin', wenna: 'npc-post.wenna.court',
  wulfhild: 'npc-post.wulfhild.camp', ansgar: 'npc-post.ansgar.anvil', maud: 'npc-post.maud.refuge',
} as const;
const atRim = (id: string): { when: Condition; anchorId: string } => ({ when: ARRIVED, anchorId: RIM(id) });

/**
 * Rows go in front of any shipped row (the first matching row wins). The allies' rows read only Act 5 flags, so a world before
 * the Rim moves nobody. Hrolf, Tobb and Aelfreda are companions (the companion system and N7's camp posts own them).
 */
export const RIM_A5_POST_ROWS: readonly PostRule[] = [
  {
    npcId: ALRIC, home: RIM(ALRIC),
    posts: [
      { when: active('m47'), anchorId: `${Q}.post.alric.gate` },
      // he waits at the stair head with M48's brief (M48 starts from that talk), and again if the talk was cut short
      { when: { all: [{ quest: 'm47', state: 'completed' }, { quest: 'm48', state: 'inactive' }] }, anchorId: `${Q}.post.alric.stair` },
      { when: { all: [active('m48'), { objective: ['m48', 'brief'], done: false }] }, anchorId: `${Q}.post.alric.stair` },
      { when: active('m48'), anchorId: `${Q}.post.alric.foot` },
      // M51's word with him is at the camp, even while M50 has him in the Cooling Hall
      { when: { all: [active('m51'), { objective: ['m51', 'call'], done: true }, { objective: ['m51', 'alric'], done: false }] }, anchorId: RIM(ALRIC) },
      { when: active('m50'), anchorId: `${COOL}.alric` },
    ],
  },
  // Edric and Rook came up behind Cael: inside the gate once it opens, at the camp from the arrival
  ...(['edric', 'rook'] as const).map((id): PostRule => ({
    npcId: id, home: HOME[id],
    posts: [atRim(id), { when: flag(M47_RIM_GATE_OPEN), anchorId: `${Q}.post.${id}.gate` }],
  })),
  ...(['wystan', 'merrin', 'wenna', 'wulfhild', 'ansgar'] as const).map((id): PostRule => ({ npcId: id, home: HOME[id], posts: [atRim(id)] })),
  // M52 (a later row for the same NPC goes in front, so this beats his camp post): Wystan gives the orders at N4's war post from the brief until the gate holds (N4's orders tree, siege-orders-m52)
  {
    npcId: 'wystan', home: HOME.wystan,
    posts: [{ when: { all: [active('m52'), { objective: ['m52', 'brief'], done: true }, { not: { flag: 'story.m52.gateHeld', equals: true } }] }, anchorId: 'caldera.siege.orders' }],
  },
  // M52: while a squad stands for them their world body is out (absentWhen); leaving them unplaced then makes the post director
  // place them afresh at the Rim when they come back (else NpcManager respawns them at their spec post, far from the Caldera)
  ...(['rook', 'edric', 'wulfhild'] as const).map((id): PostRule => ({ npcId: id, home: HOME[id], posts: [], leaveWhen: flag(`story.m52.out.${id}`) })),
  // Maud cooks at the camp only with F4 Cleanse (N7's kitchen)
  { npcId: 'maud', home: HOME.maud, posts: [{ when: { all: [ARRIVED, flag(F4_CLEANSED)] }, anchorId: RIM('maud') }] },
  // R26: once the convoy is in, the master and the guards stand at the camp (a wounded guard at the aid tent, either way)
  { npcId: R26_MASTER, home: `${Q}.post.r26.master`, posts: [{ when: flag(R26_IN), anchorId: `${Q}.post.r26.master.camp` }] },
  ...([1, 2] as const).map((n): PostRule => ({
    npcId: R26_GUARD(n), home: `${Q}.post.r26.guard.${n}`,
    posts: [{ when: { any: [flag(R26_IN), flag(R26_WOUNDED(n))] }, anchorId: `${Q}.post.r26.guard.${n}.camp` }],
  })),
];

const RIM_ROW_SET = new Set(RIM_A5_POST_ROWS.flatMap((r) => r.posts));
/** A rule without this block's rows (for the shipped posts tests that compare their own rows). */
const RIM_LEAVE_SET = new Set(RIM_A5_POST_ROWS.flatMap((r) => (r.leaveWhen ? [r.leaveWhen] : [])));
export function withoutRimQuestRows(rule: PostRule): PostRule {
  const posts = rule.posts.filter((p) => !RIM_ROW_SET.has(p));
  const lw = rule.leaveWhen;
  const base = !lw ? undefined : RIM_LEAVE_SET.has(lw) ? undefined
    : 'any' in lw && lw.any.length === 2 && RIM_LEAVE_SET.has(lw.any[0]!) ? lw.any[1] : lw;
  if (posts.length === rule.posts.length && base === lw) return rule;
  const { leaveWhen: _drop, ...rest } = rule;
  return { ...rest, posts, ...(base ? { leaveWhen: base } : {}) };
}

/** The rules with this block's rows put first (the first matching row wins); never reorders or drops a row. */
export function withRimQuestPosts(rules: PostRule[]): PostRule[] {
  const out = [...rules];
  for (const row of RIM_A5_POST_ROWS) {
    const i = out.findIndex((r) => r.npcId === row.npcId);
    const leave = (base: PostRule['leaveWhen']): PostRule['leaveWhen'] =>
      row.leaveWhen && base ? { any: [row.leaveWhen, base] } : (row.leaveWhen ?? base);
    if (i >= 0) {
      const lw = leave(out[i]!.leaveWhen);
      out[i] = { ...out[i]!, posts: [...row.posts, ...out[i]!.posts], ...(lw ? { leaveWhen: lw } : {}) };
    } else out.push({ npcId: row.npcId, home: row.home, posts: [...row.posts], ...(row.leaveWhen ? { leaveWhen: row.leaveWhen } : {}) });
  }
  return out;
}
