import type { SpawnerDef, EnemyKind } from '../../../../enemies/types';
import { HUNTER_PACK_KINDS, HUNTER_PACK_LEADER_SLOT } from '../../../../enemies/hunters/def';
import { M31_HAWKS_FLAG, M31_HAWKS_TAG } from './m31.quest';
import { M33_PACKS_FLAG, M33_PACK_A_TAG, M33_PACK_B_TAG } from './m33.quest';
import { D06_ARM_FLAG, D06_GROUP, D06_HUNTERS_TAG } from './d06.quest';

const HAWK = 'rime-hawk' as EnemyKind;
const SPEAR = 'hunter-spearman' as EnemyKind;
const HARP = 'hunter-harpooner' as EnemyKind;
const range = (prefix: string, from: number, to: number): string[] => Array.from({ length: to - from + 1 }, (_, i) => `${prefix}${from + i}`);

/** The summit's quest groups are on the `dragonspine-summit` area (Q9: never more than three levels above the player), quest-armed, never refilled, leashed. */
const common = { band: 'dragonspine', area: 'dragonspine-summit' as const, respawn: 'never' as const, leash: true };

/** Quest-scoped groups of the five summit quests, on K4's `dragonspine.spawn.*` anchors. */
export const SUMMIT_SPAWNERS: readonly SpawnerDef[] = [
  // M31: four hawks along the roost climb
  {
    id: 'dragonspine.q.m31.hawks', tag: M31_HAWKS_TAG, enemy: HAWK, count: 4, anchor: 'dragonspine.spawn.roost.hawk-1',
    memberAnchors: range('dragonspine.spawn.roost.hawk-', 1, 4), activation: { quest: 'm31', flag: M31_HAWKS_FLAG }, ...common,
  },
  // M33: Skyhold's two hunter packs of four (a spearmen's three and a harpooner), one by anchors 1 to 3 and one by 4 to 6
  {
    id: 'dragonspine.q.m33.pack-a', tag: M33_PACK_A_TAG, enemy: SPEAR, memberKinds: HUNTER_PACK_KINDS, leaderSlot: HUNTER_PACK_LEADER_SLOT, count: 4,
    anchor: 'dragonspine.spawn.skyhold.pack-a-1', memberAnchors: range('dragonspine.spawn.skyhold.pack-a-', 1, 4), activation: { quest: 'm33', flag: M33_PACKS_FLAG }, ...common,
  },
  {
    id: 'dragonspine.q.m33.pack-b', tag: M33_PACK_B_TAG, enemy: SPEAR, memberKinds: HUNTER_PACK_KINDS, leaderSlot: HUNTER_PACK_LEADER_SLOT, count: 4,
    anchor: 'dragonspine.spawn.skyhold.pack-b-1', memberAnchors: range('dragonspine.spawn.skyhold.pack-b-', 1, 4), activation: { quest: 'm33', flag: M33_PACKS_FLAG }, ...common,
  },
  // D06: the courtyard's eight hunters and the four wall harpooners, one group of twelve armed by the winch
  {
    id: D06_GROUP, tag: D06_HUNTERS_TAG, enemy: SPEAR, count: 12, anchor: 'dragonspine.spawn.aerie.hunter-1',
    memberKinds: [...Array.from({ length: 8 }, () => SPEAR), ...Array.from({ length: 4 }, () => HARP)],
    memberAnchors: [...range('dragonspine.spawn.aerie.hunter-', 1, 8), ...range('dragonspine.spawn.aerie.harpooner-', 1, 4)],
    activation: { quest: 'd06', flag: D06_ARM_FLAG }, ...common,
  },
];
