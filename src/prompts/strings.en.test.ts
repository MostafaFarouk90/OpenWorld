import { describe, expect, it } from 'vitest';
import { MECHANICS } from './PromptManager';
import { PROMPT_STRINGS_EN } from './strings.en';

describe('PROMPT_STRINGS_EN', () => {
  it('has a prompt for every mechanic and the extras', () => {
    for (const m of MECHANICS) expect(PROMPT_STRINGS_EN[`prompt.${m}`], m).toBeTruthy();
    expect(PROMPT_STRINGS_EN['prompt.dodge.rebindOffer']).toBeTruthy();
    expect(PROMPT_STRINGS_EN['prompt.hintsToggle']).toBeTruthy();
    expect(PROMPT_STRINGS_EN['prompt.sprint']).toBe('Hold {key} to sprint');
    expect(PROMPT_STRINGS_EN['prompt.wardstone-strike']).toBe('Strike on the beat');
  });
});
