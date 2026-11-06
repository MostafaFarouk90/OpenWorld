// v0.8 item 10, Rook's line: `{ grantMasterBook: 'knight' }` on a dialogue line of an NPC who is not a trainer validates
// and stays idempotent (L7's Rook takes the Knight desk after Gaut retires).
import { describe, expect, it } from 'vitest';
import { validateDialogueEffects } from '../dialogue/validate';
import { createEffectRunner } from '../quests/effects';
import type { EffectEnv } from '../quests/ports';
import type { FlagValue } from '../quests/types';

describe("Rook's master book line", () => {
  it('validates on any dialogue line, and a second run grants nothing more', () => {
    expect(validateDialogueEffects([{ grantMasterBook: 'knight' }], 'npc-rook line 3')).toEqual([]);
    const flags = new Map<string, FlagValue>();
    const emitted: string[] = [];
    const env: EffectEnv = {
      state: { getFlag: (k) => flags.get(k), setFlag: (k, v) => void flags.set(k, v), clearFlag: (k) => void flags.delete(k), favour: () => 0, favourBand: () => 'cold', addFavour: () => 0 },
      quests: { state: () => 'inactive', objectiveDone: () => false, start: () => true, complete: () => true, completeObjective: () => true },
      bus: { on: () => () => {}, emit: (t) => void emitted.push(t) },
      sourceId: 'dialogue',
    };
    const run = createEffectRunner(env);
    expect(run.run([{ grantMasterBook: 'knight' }])[0].ok).toBe(true);
    expect(run.run([{ grantMasterBook: 'knight' }])[0].ok).toBe(true);
    expect(flags.get('trainer.knight.masterBook')).toBe(true);
    expect(emitted.filter((t) => t === 'trainer.masterBook')).toHaveLength(1);
  });
});
