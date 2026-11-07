// Act 5's dialogue blocks, composed in play order: the Rim block (N10) goes inside the Foundry block (N11), so the Foundry's
// extensions find the Rim's trees (Alric's above all). Each block adds one line here.
import type { DialogueDef } from '../../../quests/types';
import { FOUNDRY_A5_DIALOGUE_STRINGS, withFoundryA5 } from './foundry';

export function withAct5(defs: DialogueDef[]): DialogueDef[] {
  return withFoundryA5(defs);
}

export const ACT5_DIALOGUE_STRINGS: Record<string, string> = { ...FOUNDRY_A5_DIALOGUE_STRINGS };
