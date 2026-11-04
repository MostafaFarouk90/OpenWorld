import type { SpawnerDef, EnemyKind } from '../../../../enemies/types';
import { cragOgreSpawner, M28_CRAG_OPTIONS, r18ParentsSpawner, rimeHawkSpawner } from '../../../../enemies/act3Spawners';
import { R15_STOOP_FLAGS, R15_STOOP_TAG } from './r15.quest';
import { M28_CRAG_FLAG, M28_CRAG_TAG, M28_SCOUT_FLAG, M28_SCOUT_TAG } from './m28.quest';
import { M29_HAWKS_FLAG, M29_HAWKS_TAG } from './m29.quest';
import { R16_PACK_FLAG, R16_PACK_TAG } from './r16.quest';
import { M30_PACK_FLAG, M30_PACK_TAG } from './m30.quest';
import { R17_HAWK_FLAGS, R17_HAWK_TAGS } from './r17.quest';
import { R18_PARENTS_TAG } from './r18.quest';

// The quest packs are built with K6b's helpers (`rimeHawkSpawner`, `cragOgreSpawner`, `r18ParentsSpawner` in
// src/enemies/act3Spawners.ts): lower-block, never refilled, leashed; this file adds the quest's tag, count and activation flag.
const HAWK = 'rime-hawk' as EnemyKind;
const OGRE = 'crag-ogre' as EnemyKind;

/**
 * One stoop of an R18 parent, as a share of the player's maximum health, is held to this at level 17 (coordinator ruling): K6b
 * measured 132 of 280 on a Knight, which is not a fright but a third of the bar. The parents carry `PARENT_DAMAGE_SCALE` through
 * their spawner options (never an edit of K6b's defs); a test computes the worst case from the real move and the level formula.
 */
export const PARENT_STOOP_MAX_SHARE = 0.3;
export const PARENT_DAMAGE_SCALE = 0.35;

const range = (prefix: string, from: number, to: number): string[] => Array.from({ length: to - from + 1 }, (_, i) => `${prefix}${from + i}`);
const activateOn = (quest: string, flag: string) => ({ activation: { quest, flag } });

const hawks = (id: string, tag: string, anchors: string[], quest: string, flag: string, extra: Partial<SpawnerDef> = {}): SpawnerDef =>
  rimeHawkSpawner(id, anchors, { tag, ...activateOn(quest, flag), ...extra });

/** The scout is a shipped spearman (not a K6b kind): the same lower-block, never-refilled, leashed shape. */
const common = { band: 'dragonspine', block: 'dragonspine-lower' as const, respawn: 'never' as const, leash: true };

/** Quest-scoped groups of the seven lower Dragonspine quests, on K4's `dragonspine.spawn.*` anchors. */
export const DRAGONSPINE_SPAWNERS: readonly SpawnerDef[] = [
  // M28: the hunter scout on the lower trail (a shipped spearman), then the crag: six hawks and an ogre, one group
  { id: 'dragonspine.q.m28.scout', tag: M28_SCOUT_TAG, enemy: 'hunter-spearman', count: 1, anchor: 'dragonspine.spawn.m28.scout', activation: { quest: 'm28', flag: M28_SCOUT_FLAG }, ...common },
  hawks('dragonspine.q.m28.crag', M28_CRAG_TAG, [...range('dragonspine.spawn.m28.hawk-', 1, 6), 'dragonspine.spawn.m28.ogre'], 'm28', M28_CRAG_FLAG, {
    memberKinds: [HAWK, HAWK, HAWK, HAWK, HAWK, HAWK, OGRE],
    // K6b's crag balance: two at a time, the ogre blusters first, no stoop beside it, 0.75 damage
    options: M28_CRAG_OPTIONS,
  }),
  // R15: two hawks at each stoop anchor, armed one group per haul (group N while haul N is out)
  ...[1, 2, 3].map((n) => hawks(`dragonspine.q.r15.stoop.${n}`, R15_STOOP_TAG, [`dragonspine.spawn.r15.stoop-${n}`], 'r15', R15_STOOP_FLAGS[n - 1]!, { count: 2 })),
  // M29: two hawks at the woodpile
  hawks('dragonspine.q.m29.hawks', M29_HAWKS_TAG, range('dragonspine.spawn.shelter.hawk-', 1, 2), 'm29', M29_HAWKS_FLAG),
  // R16: the mouth pack, an ogre and four hawks
  cragOgreSpawner('dragonspine.q.r16.pack', ['dragonspine.spawn.cave.ogre', ...range('dragonspine.spawn.cave.hawk-', 1, 4)], {
    tag: R16_PACK_TAG, memberKinds: [OGRE, HAWK, HAWK, HAWK, HAWK], ...activateOn('r16', R16_PACK_FLAG),
  }),
  // M30: an ogre and three hawks on the anchors, two more hawks on the ring round the first
  hawks('dragonspine.q.m30.shoulder', M30_PACK_TAG, [...range('dragonspine.spawn.anvil.hawk-', 1, 3), 'dragonspine.spawn.anvil.ogre'], 'm30', M30_PACK_FLAG, {
    count: 6, anchor: 'dragonspine.spawn.anvil.hawk-1', memberKinds: [HAWK, HAWK, HAWK, OGRE, HAWK, HAWK],
  }),
  // R17: two hawks at each of two shrines
  ...(['a', 'b'] as const).map((ab, i) => hawks(`dragonspine.q.r17.hawks.${ab}`, R17_HAWK_TAGS[i], [`dragonspine.spawn.wayside.hawk-${ab}`], 'r17', R17_HAWK_FLAGS[i], { count: 2 })),
  // R18: the nest's two parents (K6b's r18ParentsSpawner: ten times the health, they circle the nest and stoop only near it). The
  // quest spawns, despawns and resets this group; K6b's own 'dragonspine.r18.parents' is never spawned (one parent group at a time).
  // The stoop is softened to PARENT_DAMAGE_SCALE through the spawner options, which merge with K6b's tuning.
  r18ParentsSpawner('dragonspine.q.r18.parents', { tag: R18_PARENTS_TAG, options: { damageScale: PARENT_DAMAGE_SCALE } }),
];
