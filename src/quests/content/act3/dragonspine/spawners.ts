import type { SpawnerDef, EnemyKind } from '../../../../enemies/types';
import { R15_HAULING, R15_STOOP_TAG } from './r15.quest';
import { M28_CRAG_FLAG, M28_CRAG_TAG, M28_SCOUT_FLAG, M28_SCOUT_TAG } from './m28.quest';
import { M29_HAWKS_FLAG, M29_HAWKS_TAG } from './m29.quest';
import { R16_PACK_FLAG, R16_PACK_TAG } from './r16.quest';
import { M30_PACK_FLAG, M30_PACK_TAG } from './m30.quest';
import { R17_HAWK_FLAGS, R17_HAWK_TAGS } from './r17.quest';
import { R18_PARENTS_TAG } from './r18.quest';

// The two Dragonspine kinds exist only as type names until K6b PR 2 adds their defs; a spawner naming them warns once and spawns
// nothing, and the director reads such a group as gone. The helpers K6b exports (`rimeHawkSpawner`, `cragOgreSpawner`,
// `r18ParentsSpawner` in src/enemies/act3Spawners.ts) are the swap target: replace the bodies below with them in this file only.
const HAWK = 'rime-hawk' as EnemyKind;
const OGRE = 'crag-ogre' as EnemyKind;

const range = (prefix: string, from: number, to: number): string[] => Array.from({ length: to - from + 1 }, (_, i) => `${prefix}${from + i}`);
/** Every quest group sits on the lower Dragonspine block, never refills, and activates on a flag the director writes when its step is current. */
const common = { band: 'dragonspine', block: 'dragonspine-lower' as const, respawn: 'never' as const, leash: true };

const hawks = (id: string, tag: string, anchorPrefix: string, from: number, to: number, quest: string, flag: string): SpawnerDef => ({
  id, tag, enemy: HAWK, count: to - from + 1, anchor: `${anchorPrefix}${from}`, memberAnchors: range(anchorPrefix, from, to), activation: { quest, flag }, ...common,
});

/** Quest-scoped groups of the seven lower Dragonspine quests, on K4's `dragonspine.spawn.*` anchors. */
export const DRAGONSPINE_SPAWNERS: readonly SpawnerDef[] = [
  // M28: the hunter scout on the lower trail (a shipped spearman), then the crag: six hawks and an ogre, one group
  { id: 'dragonspine.q.m28.scout', tag: M28_SCOUT_TAG, enemy: 'hunter-spearman', count: 1, anchor: 'dragonspine.spawn.m28.scout', activation: { quest: 'm28', flag: M28_SCOUT_FLAG }, ...common },
  {
    id: 'dragonspine.q.m28.crag', tag: M28_CRAG_TAG, enemy: HAWK, count: 7, anchor: 'dragonspine.spawn.m28.hawk-1',
    memberAnchors: [...range('dragonspine.spawn.m28.hawk-', 1, 6), 'dragonspine.spawn.m28.ogre'], memberKinds: [HAWK, HAWK, HAWK, HAWK, HAWK, HAWK, OGRE],
    activation: { quest: 'm28', flag: M28_CRAG_FLAG }, ...common,
  },
  // R15: two hawks at each stoop anchor, only while a sled is hauled
  ...[1, 2, 3].map((n) => ({
    id: `dragonspine.q.r15.stoop.${n}`, tag: R15_STOOP_TAG, enemy: HAWK, count: 2, anchor: `dragonspine.spawn.r15.stoop-${n}`,
    activation: { quest: 'r15', flag: R15_HAULING }, ...common,
  }) as SpawnerDef),
  // M29: two hawks at the woodpile
  hawks('dragonspine.q.m29.hawks', M29_HAWKS_TAG, 'dragonspine.spawn.shelter.hawk-', 1, 2, 'm29', M29_HAWKS_FLAG),
  // R16: the mouth pack, an ogre and four hawks
  {
    id: 'dragonspine.q.r16.pack', tag: R16_PACK_TAG, enemy: OGRE, count: 5, anchor: 'dragonspine.spawn.cave.ogre',
    memberAnchors: ['dragonspine.spawn.cave.ogre', ...range('dragonspine.spawn.cave.hawk-', 1, 4)], memberKinds: [OGRE, HAWK, HAWK, HAWK, HAWK],
    activation: { quest: 'r16', flag: R16_PACK_FLAG }, ...common,
  },
  // M30: an ogre and three hawks on the anchors, two more hawks on the ring round the first
  {
    id: 'dragonspine.q.m30.shoulder', tag: M30_PACK_TAG, enemy: HAWK, count: 6, anchor: 'dragonspine.spawn.anvil.hawk-1',
    memberAnchors: [...range('dragonspine.spawn.anvil.hawk-', 1, 3), 'dragonspine.spawn.anvil.ogre'], memberKinds: [HAWK, HAWK, HAWK, OGRE, HAWK, HAWK],
    activation: { quest: 'm30', flag: M30_PACK_FLAG }, ...common,
  },
  // R17: two hawks at each of two shrines
  ...(['a', 'b'] as const).map((ab, i) => ({
    id: `dragonspine.q.r17.hawks.${ab}`, tag: R17_HAWK_TAGS[i], enemy: HAWK, count: 2, anchor: `dragonspine.spawn.wayside.hawk-${ab}`,
    activation: { quest: 'r17', flag: R17_HAWK_FLAGS[i] }, ...common,
  }) as SpawnerDef),
  // R18: the nest's two parents (K6b: six times the health, they circle and attack only if Cael is seen); the quest spawns, despawns and resets them
  {
    id: 'dragonspine.q.r18.parents', tag: R18_PARENTS_TAG, enemy: HAWK, count: 2, anchor: 'dragonspine.spawn.hawk-cliffs.parent-1',
    memberAnchors: ['dragonspine.spawn.hawk-cliffs.parent-1', 'dragonspine.spawn.hawk-cliffs.parent-2'], activation: 'manual', ...common,
  },
];
