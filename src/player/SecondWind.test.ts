import { describe, expect, it } from 'vitest';
import { createSecondWind } from './SecondWind';
import { SECOND_WIND } from './tuning';
import type { ActorLike, InvulnerabilityGate } from './types';

function setup(opts: { hostiles?: string[]; throwOn?: string } = {}) {
  const actor = { id: 'knight', health: 0, maxHealth: 100 } as unknown as ActorLike & { health: number };
  const sources = new Set<string>();
  const invuln: InvulnerabilityGate = {
    add: (s) => void sources.add(s),
    remove: (s) => void sources.delete(s),
    has: (s) => sources.has(s),
    get active() {
      return sources.size > 0;
    },
  };
  const staggerCalls: Array<[string, string, number]> = [];
  const fired: Array<{ charges: number; staggered: string[] }> = [];
  const radii: number[] = [];
  const sw = createSecondWind({
    actor,
    invuln,
    hostilesNear: (r) => (radii.push(r), (opts.hostiles ?? []).map((id) => ({ id }))),
    stagger: (t, b, p) => {
      staggerCalls.push([t, b, p]);
      if (t === opts.throwOn) throw new Error('boom');
      return true;
    },
    heal: (h) => void (actor.health = h),
    onFired: (i) => void fired.push(i),
  });
  return { actor, sources, sw, staggerCalls, fired, radii };
}

describe('SecondWind', () => {
  it('starts armed with the default charges', () => {
    const { sw } = setup();
    expect(sw.armed).toBe(true);
    expect(sw.charges).toBe(SECOND_WIND.defaultCharges);
  });
  it('saves a lethal hit at exactly 0 once', () => {
    const { sw, actor, fired } = setup();
    expect(sw.handler(actor, {})).toBe(true);
    expect(actor.health).toBe(50);
    expect(sw.charges).toBe(0);
    expect(sw.armed).toBe(false);
    expect(fired).toEqual([{ charges: 0, staggered: [] }]);
  });
  it('saves overkill (health already below zero)', () => {
    const { sw, actor } = setup();
    actor.health = -45;
    expect(sw.handler(actor, {})).toBe(true);
    expect(actor.health).toBe(50);
  });
  it('never heals below 1 health', () => {
    const { sw, actor } = setup();
    (actor as { maxHealth: number }).maxHealth = 1;
    sw.handler(actor, {});
    expect(actor.health).toBe(1);
  });
  it('refuses a second lethal hit once the charge is spent', () => {
    const { sw, actor } = setup();
    sw.handler(actor, {});
    actor.health = 0;
    expect(sw.handler(actor, {})).toBe(false);
    expect(actor.health).toBe(0);
  });
  it('refuses when disarmed and works again after reArm', () => {
    const { sw, actor } = setup();
    sw.disarm();
    expect(sw.armed).toBe(false);
    expect(sw.handler(actor, {})).toBe(false);
    sw.reArm();
    expect(sw.armed).toBe(true);
    expect(sw.handler(actor, {})).toBe(true);
    sw.reArm(2);
    expect(sw.charges).toBe(2);
  });
  it('ignores other actors', () => {
    const { sw, actor } = setup();
    expect(sw.handler({ ...actor, id: 'wolf' } as ActorLike, {})).toBe(false);
    expect(sw.charges).toBe(1);
  });
  it('staggers only the hostiles the provider returns, in the burst radius', () => {
    const { sw, actor, staggerCalls, fired, radii } = setup({ hostiles: ['a', 'b'] });
    sw.handler(actor, {});
    expect(radii).toEqual([SECOND_WIND.burstRadius]);
    expect(staggerCalls).toEqual([
      ['a', 'knight', SECOND_WIND.burstPoise],
      ['b', 'knight', SECOND_WIND.burstPoise],
    ]);
    expect(fired[0].staggered).toEqual(['a', 'b']);
  });
  it('survives a throwing stagger', () => {
    const { sw, actor, staggerCalls, fired } = setup({ hostiles: ['a', 'b'], throwOn: 'a' });
    expect(sw.handler(actor, {})).toBe(true);
    expect(actor.health).toBe(50);
    expect(staggerCalls.length).toBe(2);
    expect(fired[0].staggered).toEqual(['b']);
  });
  it('grace invulnerability lasts exactly graceTicks', () => {
    const { sw, actor, sources } = setup();
    sw.handler(actor, {});
    expect(sources.has('secondWind')).toBe(true);
    for (let i = 0; i < SECOND_WIND.graceTicks - 1; i++) {
      sw.tickGrace();
      expect(sources.has('secondWind')).toBe(true);
    }
    sw.tickGrace();
    expect(sources.has('secondWind')).toBe(false);
    sw.tickGrace();
    expect(sources.size).toBe(0);
  });
  it('overlaps safely with another source', () => {
    const { sw, actor, sources } = setup();
    sources.add('dodge');
    sw.handler(actor, {});
    for (let i = 0; i < SECOND_WIND.graceTicks; i++) sw.tickGrace();
    expect([...sources]).toEqual(['dodge']);
  });
});
