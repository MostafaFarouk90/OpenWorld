// v0.8: every spawner group the enemies plugin registers, in registration order (moved here from enemies.plugin.ts so
// lints can read the full list). Act 4 threads append their lists here (one import line each).
import { ACT2_SPAWNERS } from './act2Spawners';
import { ACT3_SPAWNERS } from './act3Spawners';
import { BRIGHTWATER_SPAWNERS } from './brightwaterSpawners';
import { DENSITY_SPAWNERS_A } from './densitySpawners';
import { SIDE_SPAWNERS } from './sideSpawners';
import { HARROWMARK_SPAWNERS } from './harrowmarkSpawners';
import { SLICE_SPAWNERS } from './spawnerDefs';
import { ACT2_SPAWNERS_A12 } from '../quests/content/act2/spawners';
import { OLDSMOKE_SPAWNERS } from '../quests/content/act2/oldsmoke/all';
import { ACT3_SPAWNERS as ACT3_QUEST_SPAWNERS } from '../quests/content/act3';
import { WYRM_SPAWNERS } from './wyrm/spawners';
import { ACT3_DRAGON_SPAWNERS } from './wyrm/large/lodgeWyrms';
import { SKARL_SPAWNERS } from '../bosses/skarl/spawners';
import { WAVE_SPAWNERS } from '../waves/spawners';
import { ACT4_HARROWMARK_SPAWNERS } from '../harrowmark/act4/spawners';
import { ACT4_QUEST_SPAWNERS } from '../quests/content/act4';
import { WASTE_SPAWNERS } from './waste/spawners';
import type { SpawnerDef } from './types';

export const ALL_SPAWNERS: readonly SpawnerDef[] = [
  ...SLICE_SPAWNERS,
  ...BRIGHTWATER_SPAWNERS,
  ...HARROWMARK_SPAWNERS,
  ...DENSITY_SPAWNERS_A,
  ...SIDE_SPAWNERS,
  ...WYRM_SPAWNERS,
  ...ACT2_SPAWNERS,
  ...WAVE_SPAWNERS,
  ...ACT2_SPAWNERS_A12,
  ...OLDSMOKE_SPAWNERS,
  ...ACT3_QUEST_SPAWNERS,
  ...ACT3_SPAWNERS,
  ...ACT3_DRAGON_SPAWNERS,
  ...SKARL_SPAWNERS,
  ...ACT4_HARROWMARK_SPAWNERS,
  ...ACT4_QUEST_SPAWNERS,
  ...WASTE_SPAWNERS,
];
