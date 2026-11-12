// The Foundry quests' minor cast and the posts they move (plans/act5-N11.md section 2). Defs in the Act 4 shape; the director
// registers them on the npcs service. Their trees (`npc-<id>`) are in src/dialogue/content/act5/foundry/. Invented names
// (Q6) are logged under "Act 5 N11" in design/changes-applied.md. Alric is N10's; Wenna, Edric, Rook, Wulfhild are shipped.
import type { NpcDef, NpcModelId } from '../../../../npcs/types';
import type { NpcSpec } from '../../../../region/layoutTypes';
import type { PostRule } from '../../../posts';
import type { Condition } from '../../../types';
import { FA } from './anchors';
import { R27_CAPTAIN } from './r27.quest';
import { R28_MOURNER, R28_PYRE_NS } from './r28.quest';
import { M53_VEY, M53_WITHDRAWN } from './m53.quest';
import { D09_ENTERED, D09_STOKER } from './d09.quest';
import { D09_GUARDS_DOWN, M54_ENTERED, ULTHRED_OUTCOME, VEY_OUTCOME } from './flags';
import { M55_ULTHRED } from './m55.quest';

const def = (id: string, model: NpcModelId, extra: { scale?: number; tint?: number | null } = {}): NpcDef => ({
  id, nameKey: `npc.${id}.name`, model, scale: extra.scale ?? 1, tint: extra.tint ?? null, dialogueId: `npc-${id}`, idleClip: 'Idle',
});

/** The four mourners' tints (soot-dark Halvard grey, Oswin blue, Grisel green, Ashwalker ash). */
const MOURNER_TINT = [0x5e6470, 0x4a5a78, 0x4e6a4a, 0x8a8680] as const;

export const FOUNDRY_A5_NPC_DEFS: NpcDef[] = [
  def(R27_CAPTAIN, 'barbarian', { scale: 1.03, tint: 0x5a6a4e }),
  ...R28_PYRE_NS.map((n) => def(R28_MOURNER(n), n === 4 ? 'rogueHooded' : 'rogue', { scale: 0.97, tint: MOURNER_TINT[n - 1]! })),
  def(M53_VEY, 'knight', { scale: 1.08, tint: 0x3a2a24 }),
  def(D09_STOKER, 'rogue', { scale: 0.95, tint: 0x6a5a4a }),
  // Ulthred, the First Smith, before his fight: the Knight at 1.8 in ember tones (design 9; N6's boss is its own actor)
  def(M55_ULTHRED, 'knight', { scale: 1.8, tint: 0xd8743a }),
];

export const FOUNDRY_A5_NPC_STRINGS: Record<string, string> = {
  [`npc.${R27_CAPTAIN}.name`]: 'Dagna Coalbrow, tunnel captain',
  [`npc.${R28_MOURNER(1)}.name`]: 'Aldred, a Halvard archer',
  [`npc.${R28_MOURNER(2)}.name`]: 'Sabine, an Oswin quartermaster',
  [`npc.${R28_MOURNER(3)}.name`]: 'Holt, a Grisel miner',
  [`npc.${R28_MOURNER(4)}.name`]: 'Wenyth, an Ashwalker',
  [`npc.${M53_VEY}.name`]: 'Morcant Vey, the Regent',
  [`npc.${D09_STOKER}.name`]: 'Old Tam, a stoker',
  [`npc.${M55_ULTHRED}.name`]: 'Ulthred, the First Smith',
};

const S = (q: string, s: 'started' | 'complete'): string => `story.${q}.${s}`;
export const FOUNDRY_A5_NPCS: NpcSpec[] = [
  { id: R27_CAPTAIN, post: FA.tunnelCaptain, presentWhen: S('r27', 'started'), absentWhen: S('r27', 'complete') },
  ...R28_PYRE_NS.map((n): NpcSpec => ({ id: R28_MOURNER(n), post: FA.mourner(n), presentWhen: S('r28', 'started'), absentWhen: S('r28', 'complete') })),
  { id: M53_VEY, post: FA.m53Vey, presentWhen: S('m53', 'started'), absentWhen: M53_WITHDRAWN },
  { id: D09_STOKER, post: FA.d09Stoker, presentWhen: D09_ENTERED, absentWhen: S('d09', 'complete') },
  // Ulthred stands at the hall's far end once M54 opens its gate, until D10 starts (then N6's boss takes his place)
  { id: M55_ULTHRED, post: 'caldera.int.hammer.ulthred', presentWhen: S('m54', 'complete'), absentWhen: S('d10', 'started') },
];

const active = (q: string): Condition => ({ quest: q, state: 'active' });
const obj = (q: string, o: string, done: boolean): Condition => ({ objective: [q, o], done });
const flag = (key: string, equals: unknown = true): Condition => ({ flag: key, equals: equals as boolean });

/**
 * The posts the Foundry quests move (first matching row wins; rows go in front of each NPC's shipped and Rim rows):
 * Edric at the Inner Gate from M53's walk to its end; Wulfhild at the court while R28 runs; Wenna at the vat gallery while
 * D09 is before its guards (both F1 roads since the pacing pass: on Confront she cannot turn them); Alric outside the Foundry door from D09's offer until Cael goes in.
 */
export const FOUNDRY_A5_POST_ROWS: readonly PostRule[] = [
  { npcId: 'edric', home: 'npc-post.edric.rim', posts: [{ when: { all: [active('m53'), obj('m53', 'rook', true)] }, anchorId: FA.m53Edric }] },
  { npcId: 'wulfhild', home: 'npc-post.wulfhild.rim', posts: [{ when: { all: [active('r28'), obj('r28', 'brief', true)] }, anchorId: FA.r28Wulfhild }] },
  {
    npcId: 'wenna', home: 'npc-post.wenna.rim',
    posts: [{ when: { all: [active('d09'), { not: flag(D09_GUARDS_DOWN) }] }, anchorId: 'caldera.int.foundry.wenna' }],
  },
  {
    npcId: 'alric', home: 'npc-post.alric.rim', posts: [
      // M56: on the Anvil of Ages once Ulthred has fallen
      { when: { any: [{ quest: 'd10', state: 'completed' }, { all: [active('d10'), flag(ULTHRED_OUTCOME, 'defeated')] }] }, anchorId: FA.m56Alric },
      // M54 (once Cael is below) to D10: in the Hammer Hall's approach
      { when: { any: [{ all: [active('m54'), flag(M54_ENTERED)] }, { quest: 'm54', state: 'completed' }] }, anchorId: 'caldera.int.hammer.alric' },
      // after Vey's fight, at the Foundry's foot for D09's last talk
      { when: { all: [active('d09'), { any: [flag(VEY_OUTCOME, 'spared'), flag(VEY_OUTCOME, 'defeated')] }] }, anchorId: FA.d09AlricFoot },
      { when: { all: [{ any: [{ quest: 'm53', state: 'completed' }, active('d09')] }, { not: flag(D09_ENTERED) }, { not: { quest: 'd09', state: 'completed' } }] }, anchorId: FA.d09Alric },
    ],
  },
];

const QUEST_ROW_SET = new Set(FOUNDRY_A5_POST_ROWS.flatMap((r) => r.posts));
/** A rule without this block's rows (tests that pin an older block's rows strip them, as Act 4's blocks do). */
export function withoutFoundryQuestRows(rule: PostRule): PostRule {
  const posts = rule.posts.filter((p) => !QUEST_ROW_SET.has(p));
  return posts.length === rule.posts.length ? rule : { ...rule, posts };
}

/** The rules with this block's rows put first (the first matching row wins); never reorders or drops a row. */
export function withFoundryQuestPosts(rules: PostRule[]): PostRule[] {
  const out = [...rules];
  for (const row of FOUNDRY_A5_POST_ROWS) {
    const i = out.findIndex((r) => r.npcId === row.npcId);
    if (i >= 0) out[i] = { ...out[i]!, posts: [...row.posts, ...out[i]!.posts] };
    else out.push({ npcId: row.npcId, home: row.home, posts: [...row.posts] });
  }
  return out;
}
