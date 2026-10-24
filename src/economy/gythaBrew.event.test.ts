import { describe, expect, it } from 'vitest';
import { validateDialogueEffects } from '../dialogue/validate';
import { createEffectRunner } from '../quests/effects';
import type { BusPort, StatePort } from '../quests/ports';
import { EFFECT_EVENT_PATTERN } from '../quests/types';
import { validateEffects } from '../quests/validate';

describe('the Gytha brew event', () => {
  it('passes the effect event pattern and both validators; the old name does not', () => {
    expect(EFFECT_EVENT_PATTERN.test('npc.gytha.brew')).toBe(true);
    expect(EFFECT_EVENT_PATTERN.test('gytha.brew.salve')).toBe(false);
    expect(validateEffects([{ event: 'npc.gytha.brew' }])).toEqual([]);
    expect(validateDialogueEffects([{ event: 'npc.gytha.brew' }], 'x')).toEqual([]);
    expect(validateEffects([{ event: 'gytha.brew.salve' }]).length).toBeGreaterThan(0);
  });
  it('is emitted by the effect runner', () => {
    const emitted: string[] = [];
    const bus = { on: () => () => {}, emit: (t: string) => void emitted.push(t) } as unknown as BusPort;
    const runner = createEffectRunner({ state: {} as StatePort, quests: {} as never, bus, sourceId: 'test' } as never);
    runner.run([{ event: 'npc.gytha.brew' }] as never);
    expect(emitted).toEqual(['npc.gytha.brew']);
  });
});
