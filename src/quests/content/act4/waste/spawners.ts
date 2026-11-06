// The Waste quests' own spawner groups (the ambient groups are L5's, src/enemies/waste/spawners.ts). Every group keeps the
// Waste's band (31 to 35, capped at P + 3 at spawn by L0's rule; M42's are first arrivals, P + 2), is armed by a flag the
// director writes when its step is current, never refills, and leashes. Husks are the shipped Ash Wraith in L0's
// `wraith-husk` skin. The Act 4 kinds are L5's (`ACT4_ENEMY_KINDS`), named here through the reserved ids.
import type { EnemyKind, SpawnerDef } from '../../../../enemies/types';
import { W } from './ids';
import { L1 } from './siteIds';
import { M42_GROUPS } from './m42.quest';
import { M43_DANCE_SPAWNER, M43_PYRE_GROUP } from './m43.quest';
import { R10_DUEL_ENEMY } from '../../act2/r10duels/r10Duels';
import { M44_NEST_ARM, M44_NEST_GROUP } from './m44.quest';
import { R25_KNOT_ARM, R25_KNOT_GROUP } from './r25.quest';
import { R24_ARM, R24_GROUPS } from './r24.quest';
import { M45_GUARD_ARM, M45_GUARD_GROUP } from './m45.quest';
import { D08_ENTERED, D08_KNIGHTS } from './d08.quest';
import { M46_OUTRIDERS, M46_OUTRIDERS_ARM } from './m46.quest';

// L5 moves these ids into `EnemyKind` (v0.8 item 11); until its branch is stacked they are named through the reserved list.
const STRIDER = 'waste-strider' as EnemyKind;
const HUSK_KNIGHT = 'husk-knight' as EnemyKind;
const GNATS = 'cinder-gnat-swarm' as EnemyKind;
const WRAITH: EnemyKind = 'ash-wraith';
const BAND = 'ashen-waste';

export const M42_ARM = { striders: 'story.m42.stridersArmed', wraiths: 'story.m42.wraithsArmed' } as const;

const ids = (prefix: string, n: number): string[] => Array.from({ length: n }, (_, i) => `${prefix}.${i + 1}`);
const group = (id: string, enemy: EnemyKind, anchors: string[], flag: string, quest: string, extra: Partial<SpawnerDef> = {}): SpawnerDef => ({
  id, tag: id, enemy, count: anchors.length, anchor: anchors[0]!, memberAnchors: anchors, band: BAND,
  activation: { quest, flag }, respawn: 'never', leash: true, ...extra,
});

export const WASTE_A4_Q_SPAWNERS: readonly SpawnerDef[] = [
  // M42: the first arrivals on the crossing (they replace L5's arrival group on this line)
  group(M42_GROUPS.striders, STRIDER, ids(`${W}.m42.striders`, 3), M42_ARM.striders, 'm42', { firstArrival: true }),
  group(M42_GROUPS.wraiths, WRAITH, ids(`${W}.m42.wraiths`, 3), M42_ARM.wraiths, 'm42', { firstArrival: true, skin: 'wraith-husk' }),
  // M43: one wraith at each pyre, spawned by the director (a killed one rises again; a released one is laid to rest)
  ...[1, 2, 3].map((n): SpawnerDef => ({
    id: M43_PYRE_GROUP(n), tag: M43_PYRE_GROUP(n), enemy: WRAITH, count: 1, anchor: L1.pyre(n), band: BAND, skin: 'wraith-husk',
    activation: 'manual', ephemeral: true, respawn: 'never', leash: true,
  })),
  // M43: Hrodna in the ring (the trial's opponent, a yard veteran; her NPC stands in while the bout runs)
  {
    id: M43_DANCE_SPAWNER, tag: M43_DANCE_SPAWNER, enemy: R10_DUEL_ENEMY, count: 1, anchor: `${W}.m43.bout`,
    activation: 'manual', ephemeral: true, untauntable: true, leash: false, band: BAND, respawn: 'never',
  },
  // M44: the nest in the second house (L5 drops its own chapel nest)
  group(M44_NEST_GROUP, WRAITH, ids(`${W}.m44.nest`, 6), M44_NEST_ARM, 'm44', { skin: 'wraith-husk' }),
  // R25: the knot at the third family's hearth
  group(R25_KNOT_GROUP, WRAITH, ids(`${W}.r25.knot`, 5), R25_KNOT_ARM, 'r25', { skin: 'wraith-husk' }),
  // R24: the two attacks on the cart (striders, then husks), armed as the cart passes each point
  group(R24_GROUPS[0], STRIDER, ids(`${W}.r24.attack1`, 3), R24_ARM(1), 'r24'),
  group(R24_GROUPS[1], WRAITH, ids(`${W}.r24.attack2`, 3), R24_ARM(2), 'r24', { skin: 'wraith-husk' }),
  // M45: the guard by the strike stone: two gnat swarms and a golem
  group(M45_GUARD_GROUP, GNATS, ids(`${W}.m45.guard`, 3), M45_GUARD_ARM, 'm45', { memberKinds: [GNATS, GNATS, 'cinder-golem'] }),
  // D08: the two Husk Knights in the narthex, each with its husks round it
  group(D08_KNIGHTS[0], HUSK_KNIGHT, [`${W}.d08.knight-1.1`], D08_ENTERED, 'd08'),
  group(D08_KNIGHTS[1], WRAITH, ids(`${W}.d08.knight-1`, 4).slice(1), D08_ENTERED, 'd08', { skin: 'wraith-husk' }),
  group(D08_KNIGHTS[2], HUSK_KNIGHT, [`${W}.d08.knight-2.1`], D08_ENTERED, 'd08'),
  group(D08_KNIGHTS[3], WRAITH, ids(`${W}.d08.knight-2`, 3).slice(1), D08_ENTERED, 'd08', { skin: 'wraith-husk' }),
  // M46: the column's outriders on the road below the third cairn
  group(M46_OUTRIDERS[0], WRAITH, ids(`${W}.m46.outriders`, 2), M46_OUTRIDERS_ARM, 'm46', { skin: 'wraith-husk' }),
  group(M46_OUTRIDERS[1], STRIDER, ids(`${W}.m46.outriders`, 4).slice(2), M46_OUTRIDERS_ARM, 'm46'),
];
