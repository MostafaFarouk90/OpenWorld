// The Rim quests' own spawner groups (the ambient Caldera groups are N5's, src/enemies/act5/spawners.ts). Every group names its
// `caldera-*` area (v0.9's cap at P + 3 and the x 3.0 kill factor by area), is armed by a flag the director writes when its step
// is current, never refills, and leashes. Kinds and skins are N5's (`warhost-soldier` roles and a shared `line`, the
// `wraith-stoker` and `golem-lava` skins).
import type { AreaId } from '../../../../region/areas';
import type { EnemyKind, SpawnerDef } from '../../../../enemies/types';
import { Q } from './ids';
import { M47_GROUPS } from './m47.quest';
import { M48_GROUPS } from './m48.quest';
import { R26_AMBUSH, R26_AMBUSH_ARM } from './r26.quest';
import { R29_DEAD, R29_DEAD_ARM, R29_POSTS } from './r29.quest';
import { M50_GNATS, M50_GOLEMS, M50_GOLEMS_ARM } from './m50.quest';
import { M51_SCOUTS, M51_SCOUTS_ARM, M51_SCOUTS_LINE } from './m51.quest';

const WRAITH: EnemyKind = 'ash-wraith';
const GNATS: EnemyKind = 'cinder-gnat-swarm';
const GOLEM: EnemyKind = 'cinder-golem';
const WARHOST = 'warhost-soldier' as EnemyKind;
const BAND = 'caldera';

export const M47_ARM = { knot1: 'story.m47.knot1Armed', knot2: 'story.m47.knot2Armed' } as const;
export const M48_ARM = { golems: 'story.m48.golemsArmed', gnats: 'story.m48.gnatsArmed' } as const;
export const M50_GNATS_ARM = M50_GOLEMS_ARM(3);

const ids = (prefix: string, n: number): string[] => Array.from({ length: n }, (_, i) => `${prefix}.${i + 1}`);
const group = (id: string, enemy: EnemyKind, anchors: string[], flag: string, quest: string, area: AreaId, extra: Partial<SpawnerDef> = {}): SpawnerDef => ({
  id, tag: id, enemy, count: anchors.length, anchor: anchors[0]!, memberAnchors: anchors, band: BAND, area,
  activation: { quest, flag }, respawn: 'never', leash: true, ...extra,
});

export const RIM_A5_Q_SPAWNERS: readonly SpawnerDef[] = [
  // M47: a knot of stoker wraiths and a gnat swarm below the hairpin, another above it
  group(M47_GROUPS.knot1, WRAITH, ids(`${Q}.m47.knot1`, 3), M47_ARM.knot1, 'm47', 'caldera-rim', { skin: 'wraith-stoker', memberKinds: [WRAITH, WRAITH, GNATS] }),
  group(M47_GROUPS.knot2, WRAITH, ids(`${Q}.m47.knot2`, 3), M47_ARM.knot2, 'm47', 'caldera-rim', { skin: 'wraith-stoker', memberKinds: [WRAITH, GNATS, WRAITH] }),
  // M48: lava-crust golems on the second terrace, gnats on the fifth
  group(M48_GROUPS.golems, GOLEM, ids(`${Q}.m48.golems`, 4), M48_ARM.golems, 'm48', 'caldera-stair', { skin: 'golem-lava' }),
  group(M48_GROUPS.gnats, GNATS, ids(`${Q}.m48.gnats`, 4), M48_ARM.gnats, 'm48', 'caldera-stair'),
  // R26 (fast road): stoker wraiths on the lower leg, Warhost outriders (a shield line of four) on the upper
  group(R26_AMBUSH[0], WRAITH, ids(`${Q}.r26.ambush1`, 4), R26_AMBUSH_ARM(1), 'r26', 'caldera-rim', { skin: 'wraith-stoker' }),
  group(R26_AMBUSH[1], WARHOST, ids(`${Q}.r26.ambush2`, 4), R26_AMBUSH_ARM(2), 'r26', 'caldera-rim', { role: 'shield', line: R26_AMBUSH[1] }),
  // R29: two of the stokers' dead at each post (Release is the natural mercy)
  ...R29_POSTS.map((n) => group(R29_DEAD(n), WRAITH, ids(`${Q}.r29.dead.${n}`, 2), R29_DEAD_ARM(n), 'r29', 'caldera-rim', { skin: 'wraith-stoker' })),
  // M50: the Cooling Hall's golems (N2's plinths in chambers 2 and 3 and the forge) and the third chamber's gnats
  ...([2, 3, 4] as const).map((c) => group(M50_GOLEMS(c), GOLEM, ids(`caldera.int.cooling.golem.${c}`, 2), M50_GOLEMS_ARM(c), 'm50', 'caldera-stair', { skin: 'golem-lava' })),
  group(M50_GNATS, GNATS, ids(`${Q}.m50.gnats`, 1), M50_GNATS_ARM, 'm50', 'caldera-stair'),
  // M51: Vey's scouts on the east terraces, one shield line (two shields, two pikes)
  group(M51_SCOUTS[0], WARHOST, ids(`${Q}.m51.scouts`, 4).slice(0, 2), M51_SCOUTS_ARM, 'm51', 'caldera-terraces', { role: 'shield', line: M51_SCOUTS_LINE }),
  group(M51_SCOUTS[1], WARHOST, ids(`${Q}.m51.scouts`, 4).slice(2), M51_SCOUTS_ARM, 'm51', 'caldera-terraces', { role: 'pike', line: M51_SCOUTS_LINE }),
];
