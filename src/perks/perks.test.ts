// v0.8 item 17: the perks port (decay product, Release minimum) and Keeper's Understanding as a perk.
import { describe, expect, it, vi } from 'vitest';
import { Perks } from './Perks';

describe('Perks', () => {
  it('the decay scale is the product of active perks; inactive ones and bad values read 1', () => {
    const p = new Perks(vi.fn());
    let on = true;
    p.register({ id: 'a', active: () => on, burnDecayScale: () => 2 });
    p.register({ id: 'b', active: () => true, burnDecayScale: () => 1.5 });
    p.register({ id: 'c', active: () => true, burnDecayScale: () => Number.NaN });
    expect(p.burnDecayScale()).toBe(3);
    on = false;
    expect(p.burnDecayScale()).toBe(1.5);
    expect(p.active()).toEqual(['b', 'c']);
  });
  it('the Release cost is the minimum over active perks, never below 0; the Walker Tattoo spares bosses', () => {
    const p = new Perks(vi.fn());
    expect(p.releaseBurnCost(10)).toBe(10);
    const off = p.register({ id: 'walker-tattoo', active: () => true, releaseBurnCost: (base, c) => (c.isBoss ? base : 5) });
    expect(p.releaseBurnCost(10, { isBoss: false })).toBe(5);
    expect(p.releaseBurnCost(20, { isBoss: true })).toBe(20);
    p.register({ id: 'neg', active: () => true, releaseBurnCost: () => -3 });
    expect(p.releaseBurnCost(10)).toBe(0);
    off();
  });
  it('a duplicate id throws; a throwing active() reads inactive with a warning; the undo removes', () => {
    const warn = vi.fn();
    const p = new Perks(warn);
    const off = p.register({ id: 'x', active: () => { throw new Error('no'); }, burnDecayScale: () => 9 });
    expect(() => p.register({ id: 'x', active: () => true })).toThrow();
    expect(p.burnDecayScale()).toBe(1);
    expect(warn).toHaveBeenCalled();
    off();
    expect(() => p.register({ id: 'x', active: () => true })).not.toThrow();
  });
});
