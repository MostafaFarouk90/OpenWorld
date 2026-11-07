// Act 5 dialogue (N10 owns this file, coordinator ruling 4): each Act 5 block adds one wrapper and one string table here,
// composed in play order: the Rim block (N10) goes inside the Foundry block (N11), so the Foundry's extensions find the Rim's
// trees (Alric's above all).
import type { DialogueDef } from '../../../quests/types';
import { RIM_A5_DIALOGUE_STRINGS, withRimA5 } from './rim';
import { FOUNDRY_A5_DIALOGUE_STRINGS, withFoundryA5 } from './foundry';

/** Every Act 5 block's tree changes, in play order. */
export const withAct5 = (defs: DialogueDef[]): DialogueDef[] => withFoundryA5(withRimA5(defs));
export const ACT5_DIALOGUE_STRINGS: Record<string, string> = { ...RIM_A5_DIALOGUE_STRINGS, ...FOUNDRY_A5_DIALOGUE_STRINGS };
