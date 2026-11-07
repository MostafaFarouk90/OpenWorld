// v0.9 items 4, 5, 7 and 10: the lava floor rule and the safe lip, vents, the siege's shared constants, the boss arena
// service and the world tint service.
import { describe, expect, it, vi } from 'vitest';
import { HAZE_FLAG, LAVA_DAMAGE_PCT_PER_S, LAVA_HEALTH_FLOOR, inLava, lavaDamage, nearestSafeLip, onLavaShape, ventStateAt, VENT_CLOSED_S, VENT_OPEN_S } from './lava';
import { ALLY_SQUAD_ROLES, ASSIST_WINDOW_S, SIEGE_MAX_ALIVE, SIEGE_ORDER_IDS, assistWindowS } from './siege';
import { BossArenas } from '../bosses/arena';
import { WorldTint } from './worldTint';

describe('item 4: the lava floor rule', () => {
  it('burns 15% of max a second', () => {
    expect(LAVA_DAMAGE_PCT_PER_S).toBe(15);
    expect(lavaDamage(100, 100, 1)).toBeCloseTo(85, 9);
    expect(lavaDamage(100, 100, 1 / 60)).toBeCloseTo(99.75, 9);
  });
  it('never takes health under 10% of max and never kills, however long', () => {
    let h = 100;
    for (let i = 0; i < 60 * 60; i++) h = lavaDamage(h, 100, 1 / 60);
    expect(h).toBeCloseTo(100 * LAVA_HEALTH_FLOOR, 9);
    expect(lavaDamage(10, 100, 5)).toBe(10);
    expect(lavaDamage(3, 100, 1)).toBe(3); // already under the floor: lava never heals, never lowers
    expect(lavaDamage(11, 100, 10)).toBe(10);
  });
  it('bad input changes nothing', () => {
    expect(lavaDamage(50, 0, 1)).toBe(50);
    expect(lavaDamage(50, 100, -1)).toBe(50);
    expect(lavaDamage(50, 100, NaN)).toBe(50);
    expect(lavaDamage(50, 100, 1, 0)).toBe(50);
  });
  it('throws to the nearest safe lip (ties keep list order); none for an empty list', () => {
    const lips = [{ x: 0, y: 1, z: 10 }, { x: 10, y: 1, z: 0 }, { x: 0, y: 1, z: -10 }];
    expect(nearestSafeLip({ x: 1, z: 8 }, lips)).toBe(lips[0]);
    expect(nearestSafeLip({ x: 9, z: 1 }, lips)).toBe(lips[1]);
    expect(nearestSafeLip({ x: 0, z: 0 }, lips)).toBe(lips[0]); // a tie: the first
    expect(nearestSafeLip({ x: 0, z: 0 }, [])).toBeUndefined();
  });
  it('the shapes: box, circle and ribbon; feet below the surface are in', () => {
    expect(onLavaShape({ kind: 'box', x0: 0, z0: 0, x1: 10, z1: 10 }, 10, 5)).toBe(true);
    expect(onLavaShape({ kind: 'circle', x: 0, z: 0, r: 5 }, 3, 4)).toBe(true);
    expect(onLavaShape({ kind: 'circle', x: 0, z: 0, r: 5 }, 4, 4)).toBe(false);
    const ribbon = { kind: 'ribbon' as const, points: [[0, 0], [20, 0], [20, 20]] as const, halfWidth: 2 };
    expect(onLavaShape(ribbon, 10, 1.5)).toBe(true);
    expect(onLavaShape(ribbon, 21.5, 10)).toBe(true);
    expect(onLavaShape(ribbon, 10, 3)).toBe(false);
    const def = { id: 'l', shape: ribbon, surfaceY: 5, damagePctPerS: 15, safeLips: [] };
    expect(inLava(def, { x: 10, y: 4.9, z: 0 })).toBe(true);
    expect(inLava(def, { x: 10, y: 5.1, z: 0 })).toBe(false);
    expect(HAZE_FLAG).toBe('caldera.haze');
  });
  it('vents: open 6 s then closed 10 s; a held wheel keeps them shut', () => {
    const v = { openS: VENT_OPEN_S, closedS: VENT_CLOSED_S };
    expect([0, 5.9, 6, 15.9, 16, 22].map((t) => ventStateAt(v, t))).toEqual(['open', 'open', 'closed', 'closed', 'open', 'closed']);
    expect(ventStateAt(v, 1, true)).toBe('closed');
    expect(ventStateAt({ openS: 0, closedS: 0 }, 1)).toBe('closed');
  });
});

describe('item 5: the siege constants', () => {
  it('the alive cap of 12 (the spike ruling) and the 8 s assist window', () => {
    expect(SIEGE_MAX_ALIVE).toBe(12);
    expect(ASSIST_WINDOW_S).toBe(8);
    expect(assistWindowS).toBe(ASSIST_WINDOW_S);
    expect(ALLY_SQUAD_ROLES).toEqual(['archers', 'pikes', 'melee', 'sappers', 'healers']);
    expect(SIEGE_ORDER_IDS).toContain('hold');
  });
});

describe('item 7: the boss arena service', () => {
  const kit = () => {
    const log: string[] = [];
    const piece = (id: string) => ({ apply: (s: string) => log.push(`${id}=${s}`), reset: () => log.push(`${id} reset`) });
    return { log, pieces: { floor: piece('floor'), lava: piece('lava') } };
  };
  it('sets pieces, resets on boss.ended for its own boss and on load, and refuses a duplicate', () => {
    const emit = vi.fn();
    const a = new BossArenas({ warn: () => {}, emit });
    const k = kit();
    const off = a.register('anvil', { bossId: 'ulthred', pieces: k.pieces });
    expect(() => a.register('anvil', { bossId: 'ulthred', pieces: {} })).toThrow(/already/);
    expect(a.set('anvil', 'lava', 'risen-1')).toBe(true);
    expect(a.state('anvil', 'lava')).toBe('risen-1');
    a.onBossEnded('vey'); // another boss: nothing
    expect(k.log).toEqual(['lava=risen-1']);
    a.onBossEnded('ulthred');
    expect(k.log).toEqual(['lava=risen-1', 'floor reset', 'lava reset']);
    expect(a.state('anvil', 'lava')).toBeUndefined();
    a.set('anvil', 'floor', 'cracked');
    a.onLoaded();
    expect(a.state('anvil', 'floor')).toBeUndefined();
    expect(emit).toHaveBeenCalledWith({ kind: 'reset', arenaId: 'anvil' });
    off();
    expect(a.set('anvil', 'floor', 'x')).toBe(false);
  });
  it('an unknown piece warns once; a reset that throws warns and the rest still reset', () => {
    const warn = vi.fn();
    const a = new BossArenas({ warn });
    const log: string[] = [];
    a.register('a', { bossId: 'b', pieces: { bad: { apply: () => {}, reset: () => { throw new Error('x'); } }, ok: { apply: () => {}, reset: () => log.push('ok') } } });
    expect(a.set('a', 'nope', 's')).toBe(false);
    expect(a.set('a', 'nope', 's')).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    a.reset('a');
    expect(log).toEqual(['ok']);
    expect(warn).toHaveBeenCalledTimes(2);
  });
  it('phaseTeleport goes through the safe teleport; false without an anchor or a teleport', async () => {
    const tp = vi.fn(async () => ({ ok: true }));
    const a = new BossArenas({ warn: () => {}, anchor: (id) => (id === 'caldera.anvil.mouth' ? { position: { x: 1, y: 2, z: 3 }, yaw: 0.5 } : undefined), safeTeleport: tp });
    a.register('anvil', { bossId: 'ulthred', pieces: {} });
    expect(await a.phaseTeleport('anvil', 'caldera.anvil.mouth')).toBe(true);
    expect(tp).toHaveBeenCalledWith({ x: 1, y: 2, z: 3 }, 0.5);
    expect(await a.phaseTeleport('anvil', 'nowhere')).toBe(false);
    expect(await a.phaseTeleport('other', 'caldera.anvil.mouth')).toBe(false);
    const headless = new BossArenas({ warn: () => {}, anchor: () => ({ position: { x: 0, y: 0, z: 0 }, yaw: 0 }) });
    headless.register('x', { bossId: 'b', pieces: {} });
    expect(await headless.phaseTeleport('x', 'any')).toBe(false);
  });
});

describe('item 10: the world tint service', () => {
  it('remembers the key, tells attached looks once per change, and undoes', () => {
    const t = new WorldTint();
    const look = vi.fn();
    const off = t.attach(look);
    expect(look).toHaveBeenLastCalledWith(null);
    t.set('rekindle');
    t.set('rekindle');
    expect(look).toHaveBeenCalledTimes(2);
    expect(t.current).toBe('rekindle');
    off();
    t.set('let-it-die');
    expect(look).toHaveBeenCalledTimes(2);
    expect(t.current).toBe('let-it-die');
  });
});
