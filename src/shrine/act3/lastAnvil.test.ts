import { describe, expect, it } from 'vitest';
import { LastAnvilSteps } from './lastAnvil';
import { WAYSTONE_LOCKS } from '../../waystones/tuning';

function setup(m30 = 'active') {
  const flags = new Set<string>();
  const state = { m30 };
  const steps = new LastAnvilSteps({
    getBool: (k) => flags.has(k),
    setFlag: (k, v) => void (v ? flags.add(k) : flags.delete(k)),
    questState: (id) => (id === 'm30' ? state.m30 : 'inactive'),
  });
  return { steps, flags, state };
}

describe('Last Anvil steps', () => {
  it('refuse before M30 (inactive or failed)', () => {
    for (const s of ['inactive', 'failed']) {
      const t = setup(s);
      expect(t.steps.canDo('sweep')).toBe(false);
      expect(t.steps.doStep('sweep')).toBe(false);
      expect(t.flags.size).toBe(0);
    }
  });

  it('refuse out of order', () => {
    const t = setup();
    expect(t.steps.doStep('relight')).toBe(false);
    expect(t.steps.doStep('sound')).toBe(false);
    expect(t.flags.size).toBe(0);
    expect(t.steps.doStep('sweep')).toBe(true);
    expect(t.steps.doStep('sound')).toBe(false);
    expect(t.steps.doStep('relight')).toBe(true);
    expect(t.steps.doStep('sound')).toBe(true);
    expect([...t.flags]).toEqual(['world.last-anvil.swept', 'world.last-anvil.relit', 'world.last-anvil.sounded']);
  });

  it('a step is done once; M30 completed still allows the remaining steps', () => {
    const t = setup('completed');
    expect(t.steps.doStep('sweep')).toBe(true);
    expect(t.steps.doStep('sweep')).toBe(false);
    expect(t.steps.canDo('relight')).toBe(true);
  });

  it('the stone gate reads the derived open flag: closed until sounded, open once sounded or once the shrine is lit', () => {
    expect(WAYSTONE_LOCKS['last-anvil']).toBe('shrine.last-anvil.open');
    const t = setup();
    t.steps.deriveOpen();
    expect(t.flags.has('shrine.last-anvil.open')).toBe(false);
    for (const s of ['sweep', 'relight'] as const) t.steps.doStep(s);
    t.steps.deriveOpen();
    expect(t.flags.has('shrine.last-anvil.open')).toBe(false);
    t.steps.doStep('sound');
    t.steps.deriveOpen();
    expect(t.flags.has('shrine.last-anvil.open')).toBe(true);
    const u = setup('inactive');
    u.flags.add('shrine.last-anvil.lit');
    u.steps.deriveOpen();
    expect(u.flags.has('shrine.last-anvil.open')).toBe(true);
  });
});
