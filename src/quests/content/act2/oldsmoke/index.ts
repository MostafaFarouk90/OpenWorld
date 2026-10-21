import type { QuestDef } from '../../../types';
import { m16 } from './m16.quest';
import { r09 } from './r09.quest';
import { r10 } from './r10.quest';
import { m21 } from './m21.quest';
import { m22 } from './m22.quest';
import './items';

/** The Oldsmoke and return quests built so far (A13); the mine quests join when A4's mines are on main. */
export const OLDSMOKE_QUEST_DEFS: QuestDef[] = [m16, r09, r10, m21, m22];
export const OLDSMOKE_QUEST_IDS = OLDSMOKE_QUEST_DEFS.map((q) => q.id);
export { OLDSMOKE_PROPS } from './props';
export { OLDSMOKE_CARRY } from './carry';
export { OLDSMOKE_OBJECTIVE_FLAGS } from './objectiveFlags';
export { OLDSMOKE_NOTE_LIST } from './notes';
export { OLDSMOKE_SPAWNERS } from './spawners';
export { OLDSMOKE_TRIGGERS } from './triggers';
export { OLDSMOKE_QUEST_STRINGS } from './strings';
export { OLDSMOKE_QUEST_ITEMS, OLDSMOKE_QUEST_ITEM_STRINGS } from './items';
