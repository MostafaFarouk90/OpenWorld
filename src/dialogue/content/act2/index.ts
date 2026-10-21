// The Act 2 Cinderreach dialogue (A12): new trees plus extensions of three Act 1 trees, with their strings.
import type { DialogueDef } from '../../../quests/types';
import { ALDOUS } from './oldsmoke/aldous.dialogue';
import { WENNA } from './oldsmoke/wenna.dialogue';
import { STEWARD_TREES } from './oldsmoke/stewards.dialogue';
import { SLAGG } from './oldsmoke/slagg.dialogue';
import { MINER_TREES } from './oldsmoke/miners.dialogue';
import { SCENE_M22_COUNCIL, SCENE_M22_BANNER, GRISEL_STEWARD, EDRIC_A2, WYSTAN_A2 } from './oldsmoke/m22.dialogue';
import { npcEdric } from '../npc-edric.dialogue';
import { npcWystan } from '../npc-wystan.dialogue';
import { npcGaut } from '../npc-gaut.dialogue';
import { npcAelfreda } from '../npc-aelfreda.dialogue';
import { npcPennard } from '../npc-pennard.dialogue';
import { extendTree, type BuiltTree } from './build';
import { ACT2_NOTE_DIALOGUES } from './notes.dialogue';
import { ACT2_NOTE_LIST } from '../../../quests/content/act2/notes';
import { GAUT_A2 } from './gaut.a2.dialogue';
import { OSGAR } from './osgar.dialogue';
import { BRAND } from './brand.dialogue';
import { CARTER_BOUND, CORWIN, SCENE_D03_PRISONER, REDMANE } from './camp.dialogue';
import { MAUD } from './maud.dialogue';
import { HOUSEHOLD_1, HOUSEHOLD_2, HOUSEHOLD_3, HOUSEHOLD_4 } from './households.dialogue';
import { BEORNWYN } from './beornwyn.dialogue';
import { PENNARD_A2 } from './pennard.a2.dialogue';
import { KETTA } from './ketta.dialogue';
import { PELL, OSRIC } from './pell.dialogue';
import { HROLF } from './hrolf.dialogue';
import { SCENE_R11_DEN, SCENE_R11_AXE } from './scenes.dialogue';
import { EALDRED, WYNNE } from './kin.dialogue';
import { AELFREDA_A2 } from './aelfreda.a2.dialogue';
import { LANTERN_KEEPER } from './keeper.dialogue';

const NEW_TREES: BuiltTree[] = [
  OSGAR, BRAND, CARTER_BOUND, CORWIN, SCENE_D03_PRISONER, REDMANE, MAUD, HOUSEHOLD_1, HOUSEHOLD_2, HOUSEHOLD_3, HOUSEHOLD_4,
  BEORNWYN, KETTA, PELL, OSRIC, HROLF, SCENE_R11_DEN, SCENE_R11_AXE, EALDRED, WYNNE, LANTERN_KEEPER,
  // Act 2 Phase D (A13): Deepgate and the Council
  ALDOUS, WENNA, ...STEWARD_TREES, SLAGG, ...MINER_TREES, SCENE_M22_COUNCIL, SCENE_M22_BANNER, GRISEL_STEWARD,
];
const EXTENDED = [extendTree(npcGaut, GAUT_A2), extendTree(npcAelfreda, AELFREDA_A2), extendTree(npcPennard, PENNARD_A2), extendTree(npcEdric, EDRIC_A2), extendTree(npcWystan, WYSTAN_A2)];

/** Dialogue ids the Act 2 files replace (Act 1 trees with the Act 2 extension merged in). */
export const ACT2_EXTENDED_IDS: readonly string[] = EXTENDED.map((e) => e.def.id);

/** New trees plus the readable notes. */
export const ACT2_DIALOGUES: DialogueDef[] = [...NEW_TREES.map((t) => t.def), ...ACT2_NOTE_DIALOGUES];
/** The extended Act 1 trees, to be swapped in for the Act 1 originals. */
export const ACT2_EXTENDED_DIALOGUES: DialogueDef[] = EXTENDED.map((e) => e.def);
export const ACT2_DIALOGUE_STRINGS: Record<string, string> = Object.assign(
  {}, ...ACT2_NOTE_LIST.map((n) => Object.fromEntries(n.lines.map((t, i) => [`dialogue.${n.id}.${i + 1}`, t]))), ...NEW_TREES.map((t) => t.strings), ...EXTENDED.map((e) => e.strings),
);
