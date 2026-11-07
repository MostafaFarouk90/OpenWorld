// Act 5 dialogue (N10 owns this file, coordinator ruling 4): each Act 5 block adds one wrapper and one string table here (N10's
// Rim, then N11's Foundry, whose extensions find the Rim's trees), so the two shared indexes take one line each.
import type { DialogueDef } from '../../../quests/types';
import { RIM_A5_DIALOGUE_STRINGS, withRimA5 } from './rim';
import { FOUNDRY_A5_DIALOGUE_STRINGS, withFoundryA5 } from './foundry';

/** Every Act 5 block's tree changes, in play order. */
export const withAct5 = (defs: DialogueDef[]): DialogueDef[] => withFoundryA5(withRimA5(defs));
export const ACT5_DIALOGUE_STRINGS: Record<string, string> = { ...RIM_A5_DIALOGUE_STRINGS, ...FOUNDRY_A5_DIALOGUE_STRINGS };
