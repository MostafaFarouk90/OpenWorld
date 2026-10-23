// The Oldsmoke aggregates: the surface quests (M16, R09, R10, M21, M22) and the mine quests (M17, R08, M18, M19, M20, D04)
// spread into the lists the rest of the game reads. Everything outside this folder imports these merged names.
import type { QuestDef } from '../../../types';
import type { CarryItemSpec } from '../../carry';
import type { Act2Note } from '../notes';
import type { ObjectiveFlag } from '../../../objectiveFlags';
import type { QuestPropSpec } from '../../../props';
import type { SpawnerDef } from '../../../../enemies/types';
import type { ItemDef } from '../../../../hud/ports';
import type { Q13Trigger } from './triggers';
import { m16 } from './m16.quest';
import { r09 } from './r09.quest';
import { r10 } from './r10.quest';
import { m21 } from './m21.quest';
import { m22 } from './m22.quest';
import { OLDSMOKE_PROPS as SURFACE_PROPS } from './props';
import { OLDSMOKE_CARRY as SURFACE_CARRY } from './carry';
import { OLDSMOKE_OBJECTIVE_FLAGS as SURFACE_FLAGS } from './objectiveFlags';
import { OLDSMOKE_NOTE_LIST as SURFACE_NOTES } from './notes';
import { OLDSMOKE_SPAWNERS as SURFACE_SPAWNERS } from './spawners';
import { OLDSMOKE_TRIGGERS as SURFACE_TRIGGERS } from './triggers';
import { OLDSMOKE_QUEST_STRINGS as SURFACE_STRINGS } from './strings';
import { OLDSMOKE_QUEST_ITEMS as SURFACE_ITEMS, OLDSMOKE_QUEST_ITEM_STRINGS as SURFACE_ITEM_STRINGS } from './items';
import { M17R08, m17, r08 } from './mines/m17r08.content';
import { M18M19, m18, m19 } from './mines/m18m19.content';
import { M20D04, m20, d04 } from './mines/m20d04.content';

const MINES = [M17R08, M18M19, M20D04] as const;

/** In play order (plan Part 7). */
export const OLDSMOKE_QUEST_DEFS: QuestDef[] = [m16, m17, r09, r08, m18, r10, m19, m20, m21, d04, m22];
export const OLDSMOKE_QUEST_IDS = OLDSMOKE_QUEST_DEFS.map((q) => q.id);
export const OLDSMOKE_PROPS: QuestPropSpec[] = [...SURFACE_PROPS, ...MINES.flatMap((m) => m.props)];
export const OLDSMOKE_CARRY: CarryItemSpec[] = [...SURFACE_CARRY, ...MINES.flatMap((m) => m.carry)];
export const OLDSMOKE_OBJECTIVE_FLAGS: ObjectiveFlag[] = [...SURFACE_FLAGS, ...MINES.flatMap((m) => m.flags)];
export const OLDSMOKE_NOTE_LIST: Act2Note[] = [...SURFACE_NOTES, ...MINES.flatMap((m) => m.notes)];
export const OLDSMOKE_SPAWNERS: readonly SpawnerDef[] = [...SURFACE_SPAWNERS, ...MINES.flatMap((m) => m.spawners)];
export const OLDSMOKE_TRIGGERS: Q13Trigger[] = [...SURFACE_TRIGGERS, ...MINES.flatMap((m) => m.triggers)];
export const OLDSMOKE_QUEST_STRINGS: Record<string, string> = Object.assign({}, SURFACE_STRINGS, ...MINES.map((m) => m.strings));
export const OLDSMOKE_QUEST_ITEMS: readonly ItemDef[] = [...SURFACE_ITEMS, ...MINES.flatMap((m) => m.items)];
export const OLDSMOKE_QUEST_ITEM_STRINGS: Record<string, string> = Object.assign({}, SURFACE_ITEM_STRINGS, ...MINES.map((m) => m.itemStrings));
