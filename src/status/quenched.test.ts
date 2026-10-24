import { describe, expect, it } from 'vitest';
import { QUENCHED_AURA } from './quenched';
import { Burn } from '../spells/Burn';

describe('quenched aura', () => {
  it('is the Q13 constant', () => {
    expect(QUENCHED_AURA).toEqual({ id: 'quenched', burnGainScale: 0.75 });
  });
  it('scales Burn gains through the hook, not losses, and lifts with the undo', () => {
    const b = new Burn();
    const undo = b.setGainScale(() => QUENCHED_AURA.burnGainScale);
    expect(b.add(20, 'test')).toBe(15);
    expect(b.add(-5, 'test')).toBe(-5);
    undo();
    expect(b.add(20, 'test')).toBe(20);
  });
});
