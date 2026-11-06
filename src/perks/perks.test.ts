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

describe("Keeper's Understanding boot order (fresh review finding 1)", () => {
  it('registers with perks once the service appears after the director, dropping the interim spells binding', async () => {
    const { installPerk, KEEPER_DECAY_SCALE, KEEPER_PERK_ID } = await import('../quests/content/act3/summit/director/reveal');
    const services = new Map<string, unknown>();
    const ticks: Array<() => void> = [];
    let spellsFn: (() => number) | null = null;
    services.set('spells', { setBurnDecayScale: (fn: () => number) => ((spellsFn = fn), () => { if (spellsFn === fn) spellsFn = null; }) });
    const ctx = { services: { get: (n: string) => services.get(n) }, player: { moving: true } };
    const kit = { ctx, flag: () => true, every: (_n: number, fn: () => void) => void ticks.push(fn) };
    const off = installPerk(kit as never);
    expect(spellsFn).not.toBeNull(); // no perks yet: bound to spells as before
    const p = new Perks(vi.fn());
    services.set('perks', p);
    for (const t of ticks) t();
    expect(spellsFn).toBeNull();
    expect(p.burnDecayScale()).toBe(KEEPER_DECAY_SCALE);
    expect(() => p.register({ id: KEEPER_PERK_ID, active: () => true })).toThrow(); // registered once
    for (const t of ticks) t();
    off();
    expect(p.burnDecayScale()).toBe(1);
  });
});
