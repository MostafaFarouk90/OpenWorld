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

  it('names attacks 2 to 4 slice, chop and stab and carries one {key} per keyed prompt', () => {
    expect(PROMPT_STRINGS_EN['prompt.attack2']).toMatch(/slice/);
    expect(PROMPT_STRINGS_EN['prompt.attack3']).toMatch(/chop/);
    expect(PROMPT_STRINGS_EN['prompt.attack4']).toMatch(/stab/);
    for (const m of MECHANICS) {
      const n = (PROMPT_STRINGS_EN[`prompt.${m}`].match(/\{key\}/g) ?? []).length;
      expect(n, m).toBeLessThanOrEqual(1);
    }
    expect(PROMPT_STRINGS_EN['prompt.lockSwap']).not.toContain('{key}');
  });
});
