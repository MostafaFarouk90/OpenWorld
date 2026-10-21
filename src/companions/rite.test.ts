import { describe, expect, it, vi } from 'vitest';
import { GameEvents } from '../core/events';
import { createRite, riteFlag } from './rite';

function make(o: { joined?: boolean; scars?: number; spells?: boolean } = {}) {
  const flags = new Map<string, unknown>();
  const events = new GameEvents(() => {});
  const performed: unknown[] = [];
  events.on('rite.performed', (p) => performed.push(p));
  const spells = { scars: o.scars ?? 2, removeScars: vi.fn((n: number) => {
    const r = Math.min(n, spells.scars);
    spells.scars -= r;
    return r;
  }) };
  let joined = o.joined ?? true;
  const rite = createRite({
    events,
    getFlag: (k) => flags.get(k),
    setFlag: (k, v) => void flags.set(k, v),
    joined: () => joined,
    spells: () => (o.spells === false ? undefined : spells),
  });
  return { rite, flags, spells, performed, setJoined: (j: boolean) => (joined = j) };
}

describe('the Hearth Rite (A5)', () => {
  it('once per act: removes one Scar, spends the act flag, refused the second time', () => {
    const t = make();
    t.flags.set('story.gate.a2', true);
    expect(t.rite.act()).toBe(2);
    expect(t.rite.available()).toBe(true);
    expect(t.rite.perform()).toBe(true);
    expect(t.spells.scars).toBe(1);
    expect(t.flags.get(riteFlag(2))).toBe(true);
    expect(t.performed).toEqual([{ act: 2, removed: 1 }]);
    expect(t.rite.refusal()).toBe('spent');
    expect(t.rite.perform()).toBe(false);
    expect(t.spells.scars).toBe(1);
  });

  it('allowed again in a new act', () => {
    const t = make();
    t.flags.set('story.gate.a2', true);
    t.rite.perform();
    t.flags.set('story.gate.a3', true);
    expect(t.rite.act()).toBe(3);
    expect(t.rite.perform()).toBe(true);
    expect(t.flags.get(riteFlag(3))).toBe(true);
    expect(t.spells.scars).toBe(0);
  });

  it('refused at 0 Scars without spending the flag; refused before she joins or without the spells service', () => {
    const t = make({ scars: 0 });
    expect(t.rite.refusal()).toBe('no-scars');
    expect(t.rite.perform()).toBe(false);
    expect(t.flags.has(riteFlag(1))).toBe(false);
    expect(t.spells.removeScars).not.toHaveBeenCalled();
    const u = make();
    u.setJoined(false);
    expect(u.rite.refusal()).toBe('not-joined');
    expect(u.rite.perform()).toBe(false);
    expect(make({ spells: false }).rite.refusal()).toBe('no-spells');
  });
});
