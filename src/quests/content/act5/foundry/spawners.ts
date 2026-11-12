// The Foundry quests' own spawner groups (the ambient groups are N5's). Every group names its `caldera-*` area (the Act 5 cap
// and the x 3.0 kill XP), is armed by a flag the director writes when its step is current, never refills, and leashes.
// Warhost groups follow N5's README: one role a def, a line shared by its defs, at least two shield members a line.
import type { EnemyKind, SpawnerDef } from '../../../../enemies/types';
import type { AreaId } from '../../../../region/areas';
import { D09_GUARDS_ARM, D09_PATROL_ARM, D10_ADDS_ARM, M53_BROKEN_ARM, M54_THRALLS_ARM, R28_RISEN_ARM } from './flags';
import { M54_THRALLS } from './m54.quest';
import { D10_ADDS } from './d10.quest';
import { FA } from './anchors';
import { R28_GROUP, R28_RISERS } from './r28.quest';
import { M53_GROUPS } from './m53.quest';
import { D09_GROUPS } from './d09.quest';

const WARHOST: EnemyKind = 'warhost-soldier' as EnemyKind;
const SOLDIER: EnemyKind = 'blighted-soldier';
const WRAITH: EnemyKind = 'ash-wraith';
const GOLEM: EnemyKind = 'cinder-golem';
const HOUND: EnemyKind = 'ember-hound';
const H = (s: string): string => `caldera.int.hammer.${s}`;

type Extra = Partial<SpawnerDef>;
const group = (id: string, enemy: EnemyKind, anchors: readonly string[], flag: string, quest: string, area: AreaId, extra: Extra = {}): SpawnerDef => ({
  id, tag: id, enemy, count: anchors.length, anchor: anchors[0]!, memberAnchors: anchors, band: 'caldera', area,
  activation: { quest, flag }, respawn: 'never', leash: true, ...extra,
});
const FD = (s: string): string => `caldera.int.foundry.${s}`;

/** D09's Grisel guards in two pairs: Wenna turns both pairs (Spy, Grisel 25+), one pair (Spy, below 25), or none (Confront). */
export const D09_GUARD_PAIRS = [`${D09_GROUPS.guards}-a`, `${D09_GROUPS.guards}-b`] as const;
/** Arm flags per pair (the director arms only the pairs Wenna did not turn). */
export const D09_GUARD_PAIR_ARM = (i: 0 | 1): string => `${D09_GUARDS_ARM}.${i === 0 ? 'a' : 'b'}`;
/** The floor 1 and vat gallery patrols: a line of two shields and a pike, and a torch-bearer pair, each. */
export const D09_PATROL_IDS = [`${D09_GROUPS.patrol}.shield`, `${D09_GROUPS.patrol}.pike`, `${D09_GROUPS.patrol}.torch`] as const;
export const D09_VAT_IDS = [`${D09_GROUPS.vatPatrol}.shield`, `${D09_GROUPS.vatPatrol}.pike`, `${D09_GROUPS.vatPatrol}.torch`] as const;
/** The Act 5 pacing pass: Vey's household, two shields in the gallery's east aisle, armed with the guards on every road. */
export const D09_HOUSEHOLD = 'd09.household';
/** M53's pickets: a two-shield line (Spy); the loyalists (Confront) are six Footmen in Grisel green. */
export const M53_PICKET_IDS = [`${M53_GROUPS.pickets}.shield`] as const;

const foes = (n0: number, n: number): string[] => Array.from({ length: n }, (_, i) => FA.m53Foe(n0 + i));

export const FOUNDRY_A5_Q_SPAWNERS: readonly SpawnerDef[] = [
  // R28: one stoker-skinned wraith rises at pyres 2 and 4 when the token is laid (released or killed, it stays down)
  ...R28_RISERS.map((n) => group(R28_GROUP(n), WRAITH, [FA.risen(n)], R28_RISEN_ARM(n), 'r28', 'caldera-rim', { skin: 'wraith-stoker' })),
  // M53: F1 Confront, Aldous's loyalists break the truce; Spy, two shield pickets
  group(M53_GROUPS.loyalists, SOLDIER, foes(1, 6), M53_BROKEN_ARM, 'm53', 'caldera-foundry', {
    skin: 'footman-grisel',
  }),
  group(M53_PICKET_IDS[0], WARHOST, foes(3, 2), `${M53_BROKEN_ARM}.pickets`, 'm53', 'caldera-foundry', { role: 'shield', line: M53_GROUPS.pickets }),
  // D09 floor 1: the slag foundry's patrol on N2's loop
  group(D09_PATROL_IDS[0], WARHOST, [FD('patrol.1'), FD('patrol.2')], D09_PATROL_ARM, 'd09', 'caldera-foundry', { role: 'shield', line: D09_GROUPS.patrol }),
  group(D09_PATROL_IDS[1], WARHOST, [FD('patrol.3'), FD('patrol.4')], D09_PATROL_ARM, 'd09', 'caldera-foundry', { role: 'pike', line: D09_GROUPS.patrol }),
  group(D09_PATROL_IDS[2], WARHOST, [FD('patrol.5'), FD('patrol.6')], D09_PATROL_ARM, 'd09', 'caldera-foundry', { role: 'torch', line: D09_GROUPS.patrol }),
  // D09 floor 2: the vat gallery's patrol (armed with the guards) and the Grisel guards in two pairs
  group(D09_VAT_IDS[0], WARHOST, [FD('vat.patrol.1'), FD('vat.patrol.2')], D09_GUARDS_ARM, 'd09', 'caldera-foundry', { role: 'shield', line: D09_GROUPS.vatPatrol }),
  group(D09_VAT_IDS[1], WARHOST, [FD('vat.patrol.3'), FD('vat.patrol.4')], D09_GUARDS_ARM, 'd09', 'caldera-foundry', { role: 'pike', line: D09_GROUPS.vatPatrol }),
  group(D09_VAT_IDS[2], WARHOST, [FD('vat.patrol.5'), FD('vat.patrol.6')], D09_GUARDS_ARM, 'd09', 'caldera-foundry', { role: 'torch', line: D09_GROUPS.vatPatrol }),
  group(D09_GUARD_PAIRS[0], SOLDIER, [FD('guard.1'), FD('guard.2')], D09_GUARD_PAIR_ARM(0), 'd09', 'caldera-foundry', { skin: 'footman-grisel' }),
  group(D09_GUARD_PAIRS[1], SOLDIER, [FD('guard.3'), FD('guard.4')], D09_GUARD_PAIR_ARM(1), 'd09', 'caldera-foundry', { skin: 'footman-grisel' }),
  // the Act 5 pacing pass: Vey's household pair (a line of two shields), armed with the guards whatever Wenna turned
  group(`${D09_HOUSEHOLD}.shield`, WARHOST, [FA.d09Household(1), FA.d09Household(2)], D09_GUARDS_ARM, 'd09', 'caldera-foundry', { role: 'shield', line: D09_HOUSEHOLD }),
  // M54: eight forge-thralls wake along the approach (N2's four thrall spots, two of mine by the hall gate, two mid-approach
  // since the Act 5 pacing pass)
  group(M54_THRALLS, GOLEM, [...[1, 2, 3, 4].map((n) => H(`thrall.${n}`)), ...[5, 6, 7, 8].map(FA.m54Thrall)], M54_THRALLS_ARM, 'm54', 'caldera-foundry', { skin: 'golem-lava' }),
  // D10: before the hall's last door, eight thralls and nine forge-fire hounds (six until the Act 5 pacing pass)
  group(D10_ADDS.thralls, GOLEM, [1, 2, 3, 4, 5, 6, 7, 8].map(FA.d10Add), D10_ADDS_ARM, 'd10', 'caldera-foundry', { skin: 'golem-lava' }),
  group(D10_ADDS.fire, HOUND, [9, 10, 11, 12, 13, 14, 15, 16, 17].map(FA.d10Add), D10_ADDS_ARM, 'd10', 'caldera-foundry'),
];
