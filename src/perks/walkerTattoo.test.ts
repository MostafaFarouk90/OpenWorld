// Act 4 L7 (Q13): the Walker Tattoo on the real Perks service, beside Keeper's Understanding's shape.
import { describe, expect, it, vi } from 'vitest';
import { MERCY } from '../enemies/tuning';
import { Perks } from './Perks';
import { WALKER_TATTOO, walkerTattoo } from './walkerTattoo';

const flags = (f: Record<string, unknown>) => ({ getFlag: (k: string) => f[k] });

describe('the Walker Tattoo', () => {
  it('a regular Release costs 10 before M43 and 5 after; a boss Release stays 20 both ways', () => {
    const f: Record<string, unknown> = {};
    const p = new Perks(vi.fn());
    p.register(walkerTattoo(flags(f)));
    expect(MERCY.releaseBurn).toBe(10);
    expect(p.releaseBurnCost(MERCY.releaseBurn, { isBoss: false })).toBe(10);
    expect(p.releaseBurnCost(20, { isBoss: true })).toBe(20);
    f[WALKER_TATTOO.flag] = true;
    expect(p.releaseBurnCost(MERCY.releaseBurn, { isBoss: false })).toBe(5);
    expect(p.releaseBurnCost(20, { isBoss: true })).toBe(20);
    expect(p.active()).toEqual(['walker-tattoo']);
  });
  it('never raises a cheaper cost and reads the flag live (a load needs no rebind)', () => {
    const f: Record<string, unknown> = { [WALKER_TATTOO.flag]: true };
    const p = new Perks(vi.fn());
    p.register(walkerTattoo(flags(f)));
    expect(p.releaseBurnCost(3, { isBoss: false })).toBe(3);
    f[WALKER_TATTOO.flag] = undefined;
    expect(p.releaseBurnCost(10, { isBoss: false })).toBe(10);
  });
  it('only a true flag counts', () => {
    const p = new Perks(vi.fn());
    p.register(walkerTattoo(flags({ [WALKER_TATTOO.flag]: 'yes' })));
    expect(p.releaseBurnCost(10, { isBoss: false })).toBe(10);
  });
  it('touches no Burn decay (Keeper\'s Understanding keeps it alone)', () => {
    const p = new Perks(vi.fn());
    p.register(walkerTattoo(flags({ [WALKER_TATTOO.flag]: true })));
    p.register({ id: 'keeper', active: () => true, burnDecayScale: () => 2 });
    expect(p.burnDecayScale()).toBe(2);
    expect(p.releaseBurnCost(10, { isBoss: false })).toBe(5);
  });
});
