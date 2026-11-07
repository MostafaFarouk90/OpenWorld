// Act 5 dialogue (N10 owns this file, coordinator ruling 4): each Act 5 block adds one wrapper and one string table here (N10's
// Rim; N11's Foundry next), so the two shared indexes take one line each.
import type { DialogueDef } from '../../../quests/types';
import { RIM_A5_DIALOGUE_STRINGS, withRimA5 } from './rim';

/** Every Act 5 block's tree changes, in play order. */
export const withAct5 = (defs: DialogueDef[]): DialogueDef[] => withRimA5(defs);
export const ACT5_DIALOGUE_STRINGS: Record<string, string> = { ...RIM_A5_DIALOGUE_STRINGS };
