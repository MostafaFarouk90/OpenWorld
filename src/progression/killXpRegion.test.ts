import { describe, expect, it } from 'vitest';
import { Progression } from './Progression';
import { fakeActor } from './testkit';
import { killXp } from './tuning';
import { KillXpRegionFactor } from '../core/scalePorts';

function make(factor?: KillXpRegionFactor | (() => never)) {
  const warnings: string[] = [];
  const p = new Progression({
    emit: () => {},
    logger: { warn: (m) => warnings.push(m) },
    actor: () => fakeActor(),
    killXpRegionFactor: factor === undefined ? undefined : () => (typeof factor === 'function' ? { factor: factor as never } : factor),
  });
  return { p, warnings };
}
const kill = (id: string, regionId?: string | null) => ({ actorId: id, kind: 'ash-wraith', team: 'hostile', level: 3, killerId: 'player', regionId });
const base = killXp('ash-wraith', 3, 1);

describe('kill XP region factor (v0.7 item 27)', () => {
  it('base value is positive (the tests below mean something)', () => {
    expect(base).toBeGreaterThan(0);
  });

  it('no port, an identity port, a null region and an unknown region all pay the base value', () => {
    expect(make().p.onKill(kill('a'))).toBe(base);
    const port = new KillXpRegionFactor();
    port.set('greyfen', 1.8);
    expect(make(port).p.onKill(kill('a', null))).toBe(base);
    expect(make(port).p.onKill(kill('a', 'cinderreach'))).toBe(base);
    expect(make(new KillXpRegionFactor()).p.onKill(kill('a', 'greyfen'))).toBe(base);
  });

  it('a set factor of 1.8 scales kills, rounded once', () => {
    const port = new KillXpRegionFactor();
    port.set('greyfen', 1.8);
    expect(make(port).p.onKill(kill('a', 'greyfen'))).toBe(killXp('ash-wraith', 3, 1, 1.8));
    expect(Math.abs(killXp('ash-wraith', 3, 1, 1.8) - base * 1.8)).toBeLessThanOrEqual(1);
    expect(killXp('ash-wraith', 3, 1, 1.8)).toBeGreaterThan(base);
  });

  it('mercy pays 60% (floor) of the scaled value, and the kill after it pays the remainder of the same value', () => {
    const port = new KillXpRegionFactor();
    port.set('dragonspine', 1.8);
    const { p } = make(port);
    const scaled = killXp('ash-wraith', 3, 1, 1.8);
    const mercy = p.onMercy({ actorId: 'm', kind: 'ash-wraith', level: 3, regionId: 'dragonspine' });
    expect(mercy).toBe(Math.floor(scaled * 0.6));
    expect(p.onKill({ ...kill('m', 'dragonspine') })).toBe(scaled - mercy);
  });

  it('a port that throws, or returns junk, reads as 1', () => {
    const thrower = make((() => { throw new Error('x'); }) as never);
    expect(thrower.p.onKill(kill('a', 'greyfen'))).toBe(base);
    expect(thrower.warnings.length).toBe(1);
    for (const bad of [NaN, -2, 0, Infinity]) {
      expect(make((() => bad) as never).p.onKill(kill('a', 'greyfen'))).toBe(base);
    }
  });

  it('killXp keeps its three-argument behaviour', () => {
    expect(killXp('ash-wraith', 3, 1)).toBe(killXp('ash-wraith', 3, 1, 1));
    expect(killXp('dummy', 3, 1, 5)).toBe(0);
  });
});
