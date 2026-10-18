import { describe, expect, it, vi } from 'vitest';
import { Cooled } from './cooled';
import { Shrine } from './shrine';

function make(burn = 0, hp = 50, max = 100) {
  const s = { burn, hp, max, flags: new Map<string, boolean>(), cleared: 0 };
  const events: string[] = [];
  const cooled = new Cooled({
    addMaxHealthModifier: () => () => {},
    refreshMaxHealth: () => {},
    emitApplied: () => {},
    emitRemoved: () => {},
  });
  const reveal = vi.fn();
  const topUpHealth = vi.fn(() => void (s.hp = s.max));
  const shrine = new Shrine(
    {
      setFlag: (k, v) => void s.flags.set(k, v),
      emitRekindled: (id) => void events.push(`rekindled:${id}`),
      topUpHealth,
      heal: (n) => void (s.hp = Math.min(s.max, s.hp + n)),
      maxHealth: () => s.max,
      burn: () => s.burn,
      clearBurn: () => {
        s.burn = 0;
        s.cleared++;
      },
      reveal,
    },
    cooled,
  );
  return { s, shrine, cooled, events, reveal, topUpHealth };
}

describe('Shrine', () => {
  it('rekindling sets the flag, announces and reveals', () => {
    const t = make();
    t.shrine.onRekindled();
    expect(t.s.flags.get('shrine.quenchstone.lit')).toBe(true);
    expect(t.events).toEqual(['rekindled:quenchstone']);
    expect(t.reveal).toHaveBeenCalledOnce();
  });
  it('rest applies Cooled and tops health up after it', () => {
    const t = make();
    t.shrine.onRest();
    expect(t.cooled.active).toBe(true);
    expect(t.topUpHealth).toHaveBeenCalledOnce();
    expect(t.s.hp).toBe(100);
  });
  it('a second rest refreshes Cooled without stacking', () => {
    const t = make();
    t.shrine.onRest();
    t.cooled.update(500);
    t.shrine.onRest();
    expect(t.cooled.secondsLeft()).toBe(1200);
  });
  it('the basin heals 8% a second and clears Burn once on entry', () => {
    const t = make(40, 50);
    t.shrine.basinTick(1, true);
    expect(t.s.hp).toBeCloseTo(58);
    expect(t.s.burn).toBe(0);
    expect(t.s.cleared).toBe(1);
  });
  it('the basin does not hammer clearBurn every tick and skips it at Burn 0', () => {
    const t = make(0, 50);
    for (let i = 0; i < 120; i++) t.shrine.basinTick(1 / 60, true);
    expect(t.s.cleared).toBe(0);
    const u = make(30, 50);
    for (let i = 0; i < 60; i++) {
      u.shrine.basinTick(1 / 60, true);
      u.s.burn = 5;
    }
    expect(u.s.cleared).toBeLessThanOrEqual(3);
  });
  it('the basin does nothing when inactive and re-clears on re-entry', () => {
    const t = make(40, 50);
    t.shrine.basinTick(1, false);
    expect(t.s.hp).toBe(50);
    t.shrine.basinTick(0.1, true);
    t.s.burn = 20;
    t.shrine.basinTick(0.1, false);
    t.shrine.basinTick(0.1, true);
    expect(t.s.cleared).toBe(2);
  });
  it('the basin never overheals', () => {
    const t = make(0, 99);
    t.shrine.basinTick(5, true);
    expect(t.s.hp).toBe(100);
  });
});
