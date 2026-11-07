// The Waste's cast (L11 defines them all; L1 places only the camp, chapel and Rimfoot posts, L7 owns Wulfhild's and Hild's shops).
// Defs in the shape of L10's npcs.ts; the director registers them on the npcs service. Their trees (`npc-<id>`) are in
// src/dialogue/content/act4/waste/. Invented names (Q6) are logged under "Act 4 L11" in design/changes-applied.md.
import type { NpcDef, NpcModelId } from '../../../../npcs/types';
import type { NpcSpec } from '../../../../region/layoutTypes';
import type { PostRule } from '../../../posts';
import type { Condition } from '../../../types';
import { W } from './ids';
import { L1 } from './siteIds';
import { HILD, M42_GATE } from './m42.quest';
import { CHAPEL_KEEPER, EBBA } from './m44.quest';
import { R24_CARTER, R24_CART_OUT } from './r24.quest';
import { D08_DYING, D08_ENTERED } from './d08.quest';
import { M45_MET } from './m45.quest';
import { M46_KEEPER } from './m46.quest';

const def = (id: string, model: NpcModelId, extra: { scale?: number; tint?: number | null; idleClip?: string } = {}): NpcDef => ({
  id, nameKey: `npc.${id}.name`, model, scale: extra.scale ?? 1, tint: extra.tint ?? null, dialogueId: `npc-${id}`, idleClip: extra.idleClip ?? 'Idle',
});
const ASH = 0x8a8680;

export const WASTE_A4_NPC_DEFS: NpcDef[] = [
  def('wulfhild', 'barbarian', { scale: 1.02, tint: ASH }),
  def(HILD, 'rogueHooded', { scale: 0.96, tint: 0x6e6658 }),
  def('hrodna', 'barbarian', { scale: 1.05, tint: 0x7a7470 }),
  def('walker-knots', 'rogueHooded', { scale: 0.98, tint: 0x8c8478 }),
  def('walker-pyres', 'mage', { scale: 0.95, tint: 0x9a948c }),
  def('walker-3', 'rogue', { scale: 0.97, tint: ASH }),
  def('walker-4', 'rogue', { scale: 1, tint: 0x948c80 }),
  def(R24_CARTER, 'rogueHooded', { scale: 1, tint: 0x8a8478 }),
  def(EBBA, 'rogue', { scale: 0.7, tint: 0xa08a78 }),
  def(CHAPEL_KEEPER, 'mage', { scale: 0.96, tint: 0x8e8e8a }),
  def(D08_DYING, 'rogue', { scale: 0.98, tint: 0x6a6460 }),
  ...[1, 2, 3].map((n) => def(M46_KEEPER(n), 'rogueHooded', { scale: 0.97, tint: [0x8a8478, 0x948a80, 0x7e7a74][n - 1]! })),
];

export const WASTE_A4_NPC_STRINGS: Record<string, string> = {
  'npc.wulfhild.name': 'Wulfhild of the Ashwalkers',
  [`npc.${HILD}.name`]: 'Hild Ropewright, rope-warden',
  'npc.hrodna.name': 'Hrodna, Wulfhild\'s champion',
  'npc.walker-knots.name': 'Osgar Knotwise',
  'npc.walker-pyres.name': 'Mother Aelfgifu, pyre-keeper',
  'npc.walker-3.name': 'Tola, an Ashwalker',
  'npc.walker-4.name': 'Ceolric, an Ashwalker',
  [`npc.${R24_CARTER}.name`]: 'Brand the carter',
  [`npc.${EBBA}.name`]: 'Little Ebba',
  [`npc.${CHAPEL_KEEPER}.name`]: 'Sister Aedre',
  [`npc.${D08_DYING}.name`]: 'Leofric, a walker',
  [`npc.${M46_KEEPER(1)}.name`]: 'Eadwig, cairn-keeper',
  [`npc.${M46_KEEPER(2)}.name`]: 'Saewynn, cairn-keeper',
  [`npc.${M46_KEEPER(3)}.name`]: 'Cuthwine, cairn-keeper',
  'npc.ulthred.name': 'A voice in the glass',
};

const OUT = 'story.m41.complete';
const IN = 'story.m42.started';
export const WASTE_A4_NPCS: NpcSpec[] = [
  // Act 5 N10: under F8 All her Ashwalker squad stands at M52's gate, and her world body steps out while the siege runs
  { id: 'wulfhild', post: L1.wulfhildCamp, presentWhen: OUT, absentWhen: 'story.m52.out.wulfhild' },
  { id: HILD, post: L1.hildPost, presentWhen: OUT },
  { id: 'hrodna', post: L1.hrodnaCamp, presentWhen: IN },
  { id: 'walker-knots', post: L1.walkerPost(1), presentWhen: IN },
  { id: 'walker-pyres', post: L1.walkerPost(2), presentWhen: IN },
  { id: 'walker-3', post: L1.walkerPost(3), presentWhen: IN },
  { id: 'walker-4', post: L1.walkerPost(4), presentWhen: IN },
  { id: R24_CARTER, post: L1.carterCamp, presentWhen: IN, absentWhen: R24_CART_OUT },
  { id: EBBA, post: L1.ebbaChapel, presentWhen: IN },
  { id: CHAPEL_KEEPER, post: `${W}.post.chapel-keeper`, presentWhen: IN },
  // Leofric kneels by the door from D08's start until Cael goes in (he does not live to see the end)
  { id: D08_DYING, post: `${W}.post.d08.dying`, presentWhen: 'story.d08.started', absentWhen: D08_ENTERED },
  // the cairn-keepers stand at their cairns from M46's start (and after, harmlessly)
  ...[1, 2, 3].map((n): NpcSpec => ({ id: M46_KEEPER(n), post: `${W}.post.m46.keeper.${n}`, presentWhen: 'story.m46.started' })),
];

const active = (q: string): Condition => ({ quest: q, state: 'active' });
const done = (q: string): Condition => ({ quest: q, state: 'completed' });

/**
 * Wulfhild moves by flags (plan 12, point 1): at Ashgate until Cael passes the gate arch, at the Glasslands from M45's meeting
 * until its end, at the Rimfoot fire once the act is done; the camp otherwise. Brand waits at the spring while R24 is before
 * its escort. Rows go in front of any shipped row (none exist for these ids).
 */
export const WASTE_A4_POST_ROWS: readonly PostRule[] = [
  {
    npcId: 'wulfhild', home: L1.wulfhildCamp,
    posts: [
      { when: done('m46'), anchorId: L1.wulfhildRimfoot },
      { when: { all: [active('m45'), { flag: M45_MET, equals: true }] }, anchorId: `${W}.post.wulfhild.glasslands` },
      // Act 4 only: before the Ash Road opens nobody is moved (a fresh world resolves no Waste post)
      { when: { all: [{ flag: OUT, equals: true }, { not: { flag: M42_GATE, equals: true } }, { not: done('m42') }] }, anchorId: `${W}.post.wulfhild.ashgate` },
    ],
  },
  {
    npcId: R24_CARTER, home: L1.carterCamp,
    posts: [{ when: { all: [active('r24'), { objective: ['r24', 'load'], done: false }, { objective: ['r24', 'brief'], done: true }] }, anchorId: `${W}.post.carter.spring` }],
  },
];

/** The rules with this block's rows put first (the first matching row wins); never reorders or drops a row. */
export function withWasteQuestPosts(rules: PostRule[]): PostRule[] {
  const out = [...rules];
  for (const row of WASTE_A4_POST_ROWS) {
    const i = out.findIndex((r) => r.npcId === row.npcId);
    if (i >= 0) out[i] = { ...out[i]!, posts: [...row.posts, ...out[i]!.posts] };
    else out.push({ npcId: row.npcId, home: row.home, posts: [...row.posts] });
  }
  return out;
}
