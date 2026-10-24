import { describe, expect, it, vi } from 'vitest';
import { MovementModes } from './MovementModes';
import { MOVEMENT_MODE_RULES, type MovementMode } from './types';
import { WaystoneNetwork, type AnchorLike, type NetworkPorts, type WaystoneContext } from '../waystones/WaystoneNetwork';
import { SafeTeleport } from '../waystones/SafeTeleport';
import { mountRefusal, type MountState } from '../mount/rules';
import { saveSafePoint } from '../save/save.plugin';

const make = () => {
  const emit = vi.fn();
  const warn = vi.fn();
  return { m: new MovementModes({ emit, warn }), emit, warn };
};
const pt = (x = 1) => ({ position: { x, y: 2, z: 3 }, yaw: 0.5 });

describe('MOVEMENT_MODE_RULES (plan item 25)', () => {
  const rows: [MovementMode, string, string, string, string][] = [
    ['walk', 'position', 'allowed', 'allowed', 'follow'],
    ['glide', 'safePoint', 'refused', 'refused', 'hidden'],
    ['ferry', 'safePoint', 'refused', 'refused', 'hidden'],
    ['dive', 'safePoint', 'refused', 'refused', 'hidden'],
    ['haul', 'position', 'allowed', 'refused', 'follow'],
  ];
  it.each(rows)('%s', (mode, save, fastTravel, mount, companions) => {
    expect(MOVEMENT_MODE_RULES[mode]).toEqual({ save, fastTravel, mount, companions });
  });
  it('has exactly the five modes', () => {
    expect(Object.keys(MOVEMENT_MODE_RULES).sort()).toEqual(['dive', 'ferry', 'glide', 'haul', 'walk']);
  });
});

describe('MovementModes', () => {
  it('starts in walk with no safe point', () => {
    const { m } = make();
    expect(m.current).toBe('walk');
    expect(m.safePoint).toBeNull();
    expect(m.rule()).toBe(MOVEMENT_MODE_RULES.walk);
  });
  it('set emits on a change, with the previous mode', () => {
    const { m, emit } = make();
    m.set('glide', pt());
    expect(emit).toHaveBeenCalledWith('glide', 'walk');
    expect(m.current).toBe('glide');
    expect(m.saveOverride()).toEqual(pt());
  });
  it('does not emit on the same mode', () => {
    const { m, emit } = make();
    m.set('glide', pt());
    m.set('glide', pt(9));
    expect(emit).toHaveBeenCalledTimes(1);
    expect(m.safePoint?.position.x).toBe(9);
  });
  it('walk clears the safe point', () => {
    const { m } = make();
    m.set('dive', pt());
    m.set('walk', pt());
    expect(m.safePoint).toBeNull();
    expect(m.saveOverride()).toBeNull();
  });
  it('drops a non-finite safe point with a warning but still enters the mode', () => {
    const { m, warn } = make();
    m.set('ferry', { position: { x: NaN, y: 0, z: 0 }, yaw: 0 });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(m.current).toBe('ferry');
    expect(m.safePoint).toBeNull();
    m.set('dive', { position: { x: 0, y: 0, z: 0 }, yaw: Infinity });
    expect(warn).toHaveBeenCalledTimes(2);
    expect(m.safePoint).toBeNull();
  });
  it('ignores an unknown mode with a warning', () => {
    const { m, emit, warn } = make();
    m.set('swim' as MovementMode);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(emit).not.toHaveBeenCalled();
    expect(m.current).toBe('walk');
    m.set('toString' as MovementMode);
    expect(m.current).toBe('walk');
  });
  it('haul keeps the live position (no override even with a point)', () => {
    const { m } = make();
    m.set('haul', pt());
    expect(m.saveOverride()).toBeNull();
  });
});

describe('fast travel refusal', () => {
  const A = (id: string, x: number, tags = ['waystone']): AnchorLike => ({ id, position: { x, y: 0, z: 0 }, yaw: 0, tags });
  function net(movementRefuses?: boolean) {
    const anchors = [A('waystone.a', 0), A('waystone.b', 100)];
    const ctx: WaystoneContext = { dead: false, cutscene: false, dialogue: false, hostileAggro: false, heartshard: true, allowRestInCombat: false, movementRefuses };
    let feet = { x: 0, y: 0, z: 0 };
    const teleport = new SafeTeleport({
      place: (f) => (feet = { ...f }),
      freeze: () => () => undefined,
      ready: () => true,
      groundedBelow: () => true,
      chunksResident: () => true,
      fade: () => undefined,
      heightAt: () => 0,
    });
    const ports: NetworkPorts = {
      anchors: { withTag: (t) => anchors.filter((a) => a.tags?.includes(t)), find: (id) => anchors.find((a) => a.id === id) },
      emit: () => undefined,
      setFlag: () => undefined,
      context: () => ctx,
      restoreVitals: vi.fn(),
      requestSave: vi.fn(),
      toast: vi.fn(),
      playerFeet: () => feet,
      teleport,
      log: vi.fn(),
    };
    const n = new WaystoneNetwork(ports);
    n.applyPreLit();
    n.rekindle('a');
    n.rekindle('b');
    return { n, ctx, pump: async (p: Promise<unknown>) => { for (let i = 0; i < 400; i++) teleport.update(1 / 60); return p; } };
  }
  it('is refused with reason movement', async () => {
    const t = net(true);
    expect(await t.n.travel('b')).toEqual({ ok: false, reason: 'movement' });
  });
  it('is allowed when the mode does not refuse (or the flag is absent)', async () => {
    for (const v of [false, undefined]) {
      const t = net(v);
      await expect(t.pump(t.n.travel('b'))).resolves.toEqual({ ok: true });
    }
  });
  it('earlier refusals still win over movement', async () => {
    const t = net(true);
    expect(await t.n.travel('zzz')).toEqual({ ok: false, reason: 'unknown' });
    t.ctx.dead = true;
    expect(await t.n.travel('b')).toEqual({ ok: false, reason: 'dead' });
  });
});

describe('mountRefusal', () => {
  const ok: MountState = { available: true, indoors: false, travelling: false, stealth: false, chase: false, aggro: false, busy: false };
  it('allows with no movement refusal, refuses with movement', () => {
    expect(mountRefusal(ok)).toBeNull();
    expect(mountRefusal({ ...ok, movement: false })).toBeNull();
    expect(mountRefusal({ ...ok, movement: true })).toBe('movement');
  });
  it('every earlier reason wins over movement, in order', () => {
    const order: [keyof MountState, string][] = [
      ['available', 'unavailable'], ['indoors', 'interior'], ['travelling', 'travel'], ['stealth', 'stealth'],
      ['chase', 'chase'], ['aggro', 'combat'], ['busy', 'busy'],
    ];
    for (const [k, r] of order) {
      const s: MountState = { ...ok, movement: true, [k]: k === 'available' ? false : true };
      expect(mountRefusal(s)).toBe(r);
    }
  });
});

describe('save hook', () => {
  const grounded = { x: 5, y: 6, z: 7, yaw: 1 };
  it('walk and haul store the last grounded position', () => {
    for (const mode of ['walk', 'haul'] as const) {
      const { m } = make();
      m.set(mode, pt());
      expect(saveSafePoint(m, grounded)).toEqual(grounded);
    }
  });
  it('glide, ferry and dive store the safe point', () => {
    for (const mode of ['glide', 'ferry', 'dive'] as const) {
      const { m } = make();
      m.set(mode, pt(40));
      expect(saveSafePoint(m, grounded)).toEqual({ x: 40, y: 2, z: 3, yaw: 0.5 });
    }
  });
  it('never refuses: a safePoint mode without a point falls back to grounded, then to undefined', () => {
    const { m } = make();
    m.set('glide');
    expect(saveSafePoint(m, grounded)).toEqual(grounded);
    expect(saveSafePoint(m, null)).toBeUndefined();
    expect(saveSafePoint(undefined, grounded)).toEqual(grounded);
  });
});
