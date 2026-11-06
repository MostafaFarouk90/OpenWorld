// The minor cast the Harrowmark quests add to L2's: R20's three post sergeants, R21's cellar-keeper, R23's Council clerk, D07's
// captive smith and R22's three locals (names invented, Q6, logged in design/changes-applied.md). Defs in the shape of L2's
// npcDefs.ts; the director registers them on the npcs service. Their trees (`npc-<id>`) are in src/dialogue/content/act4/harrowmark/.
import type { NpcDef, NpcModelId } from '../../../../npcs/types';
import type { NpcSpec } from '../../../../region/layoutTypes';
import type { PostRule } from '../../../posts';
import { Q } from './anchors';
import { R22_SITES } from './r22.quest';
import { ACT4_CITY } from '../../../../harrowmark/act4/postRules';
import type { Condition } from '../../../types';
import { M41_ARRIVALS } from './m41.quest';
import { M38_ALLIES } from './m38.quest';

const def = (id: string, model: NpcModelId, extra: { scale?: number; tint?: number | null } = {}): NpcDef => ({
  id, nameKey: `npc.${id}.name`, model, scale: extra.scale ?? 1, tint: extra.tint ?? null, dialogueId: `npc-${id}`, idleClip: 'Idle',
});
const VEY_TINT = 0x2a2624;
const A4 = 'story.gate.a4';
const HELD = 'story.m38.complete';
const done = (q: string): Condition => ({ quest: q, state: 'completed' });
const active = (q: string): Condition => ({ quest: q, state: 'active' });
/** From the Council's fall to the deep run (M39 and M40's brief): the Keep stairs. */
const STAIRS: Condition = { all: [done('m38'), { not: active('m40') }, { not: done('m40') }] };
/** Gaut holds the stairs from the Council's fall until he falls (his retirement at story.m39.fallen takes him then). */
const GAUT_STAIRS: Condition = { all: [done('m38'), { not: { flag: 'story.m39.fallen', equals: true } }] };
/** From the deep run until Ashgate is named: the M41 camp. */
const CAMP: Condition = { all: [{ any: [active('m40'), done('m40')] }, { not: done('m41') }] };

export const HARROWMARK_A4_Q_NPC_DEFS: NpcDef[] = [
  ...[1, 2, 3].map((n) => def(`r20-sergeant-${n}`, 'knight', { tint: VEY_TINT })),
  def('cellar-keeper', 'barbarian', { scale: 0.96, tint: 0x5a4a3a }),
  def('hamon-quill', 'mage', { scale: 0.94, tint: 0x4a4038 }),
  def('crucible-captive', 'barbarian', { scale: 0.95, tint: 0x6a5a4a }),
  def('r22-local-cinderreach', 'barbarian', { scale: 0.97, tint: 0x7a5a3a }),
  def('r22-local-greyfen', 'rogue', { scale: 0.94, tint: 0x62664c }),
  def('r22-local-dragonspine', 'rogueHooded', { scale: 0.97, tint: 0x8a96a6 }),
];

export const HARROWMARK_A4_Q_NPC_STRINGS: Record<string, string> = {
  'npc.r20-sergeant-1.name': 'Sergeant Brock, River Gate',
  'npc.r20-sergeant-2.name': 'Sergeant Holt, the near hut',
  'npc.r20-sergeant-3.name': 'Sergeant Dunn, the far hut',
  'npc.cellar-keeper.name': 'Old Hebba, cellar-keeper',
  'npc.hamon-quill.name': 'Hamon Quill, Council Clerk',
  'npc.crucible-captive.name': 'Eadric Smallbone, smith',
  'npc.r22-local-cinderreach.name': 'Thane the crag-cutter',
  'npc.r22-local-greyfen.name': 'Wynne the peat-digger',
  'npc.r22-local-dragonspine.name': 'Sigrun of the cairns',
};

const city = { presentWhen: A4, absentWhen: HELD } as const;
export const HARROWMARK_A4_Q_NPCS: NpcSpec[] = [
  ...[1, 2, 3].map((n) => ({ id: `r20-sergeant-${n}`, post: `${Q}.post.r20-sergeant-${n}`, ...city })),
  { id: 'cellar-keeper', post: `${Q}.post.cellar-keeper`, ...city },
  { id: 'hamon-quill', post: `${Q}.post.hamon-quill`, ...city },
  // the smith is in the Crucible from D07 on (the interior is locked until then) and gone with the city
  { id: 'crucible-captive', post: 'harrowmark.a4.crucible.captive', presentWhen: 'story.d07.started', absentWhen: HELD },
  // R22's locals stand at their sites while R22 runs (and after, harmlessly)
  ...R22_SITES.map((s) => ({ id: s.local, post: `${s.region}.q.r22.local`, presentWhen: 'story.r22.started' })),
];

/** Rows put in front of the shipped and L2 rows: Rook waits inside the Crucible during D07; Gaut is in the city in Act 4. */
export const HARROWMARK_A4_QUEST_POST_ROWS: readonly { npcId: string; home: string; posts: PostRule['posts'] }[] = [
  { npcId: 'rook', home: 'npc-post.rook', posts: [{ when: { quest: 'd07', state: 'active' }, anchorId: 'harrowmark.a4.crucible.rook' }] },
  // Gaut has stood at Cinderford since M11; in Act 4 he is back at the Bastion until the Council, and at the inn for the feast.
  {
    npcId: 'gaut', home: 'npc-post.gaut',
    posts: [
      { when: GAUT_STAIRS, anchorId: 'harrowmark.a4.stairs.gaut' },
      { when: { quest: 'm37', state: 'active' }, anchorId: `${Q}.post.gaut.inn` },
      { when: ACT4_CITY, anchorId: 'npc-post.gaut.bastion' },
    ],
  },
  // PR 2: after the Council nobody is needed at a city post (plan 3, L2's question). Edric and Rook wait on the Keep stairs
  // until the deep run, then at the M41 camp (L4's escort walks them through the run itself); the allies come out to the camp.
  { npcId: 'edric', home: 'npc-post.edric', posts: [{ when: STAIRS, anchorId: 'harrowmark.a4.stairs.edric' }, { when: CAMP, anchorId: `${Q}.m41.edric` }] },
  { npcId: 'rook', home: 'npc-post.rook', posts: [{ when: STAIRS, anchorId: 'harrowmark.a4.stairs.rook' }, { when: CAMP, anchorId: `${Q}.m41.rook` }] },
  // M38: the three allies sit in the Council Chamber while it runs (L2's seats)
  ...M38_ALLIES.map((id) => ({ npcId: id, home: `npc-post.${id}`, posts: [{ when: active('m38'), anchorId: `harrowmark.a4.chamber.seat.${id}` }] })),
  ...M41_ARRIVALS.map((id) => ({ npcId: id, home: `npc-post.${id}`, posts: [{ when: { quest: 'm41', state: 'active' } as Condition, anchorId: `${Q}.m41.${id}` }] })),
];

const QUEST_ROW_SET = new Set(HARROWMARK_A4_QUEST_POST_ROWS.flatMap((r) => r.posts));

/** A rule with this block's rows taken back out (for tables that pin their own shipped rows, like L2's `withoutAct4Rows`). */
export function withoutHarrowmarkQuestRows(rule: PostRule): PostRule {
  const posts = rule.posts.filter((p) => !QUEST_ROW_SET.has(p));
  return posts.length === rule.posts.length ? rule : { ...rule, posts };
}

/** The rules with this block's rows put first (the first matching row wins); never reorders or drops a row. */
export function withHarrowmarkQuestPosts(rules: PostRule[]): PostRule[] {
  const out = [...rules];
  for (const row of HARROWMARK_A4_QUEST_POST_ROWS) {
    const i = out.findIndex((r) => r.npcId === row.npcId);
    if (i >= 0) out[i] = { ...out[i]!, posts: [...row.posts, ...out[i]!.posts] };
    else out.push({ npcId: row.npcId, home: row.home, posts: [...row.posts] });
  }
  return out;
}
