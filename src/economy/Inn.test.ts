import { describe, expect, it, vi } from 'vitest';
import { Inn, INN, roomPrice, type InnPorts } from './Inn';

function make(over: Partial<{ room: boolean; price: 'forgiven' | 'collected' | undefined; gold: number; blocked: ReturnType<InnPorts['canRestNow']>; cooled: number }> = {}) {
  const s = {
    room: over.room ?? true,
    price: over.price,
    gold: over.gold ?? 100,
    blocked: over.blocked ?? null,
    cooled: over.cooled ?? 0,
    spent: [] as number[],
    rests: [] as string[],
    modifier: null as null | (() => number),
    applied: [] as number[],
    removed: 0,
    refreshed: 0,
    toppedUp: 0,
  };
  const ports: InnPorts = {
    roomRented: () => s.room,
    price: () => s.price,
    gold: () => s.gold,
    takeGold: (n) => {
      s.gold -= n;
      s.spent.push(n);
      return n;
    },
    canRestNow: () => s.blocked,
    restAt: (p) => {
      s.rests.push(p);
      return { ok: true };
    },
    cooledSeconds: () => s.cooled,
    cooledFactor: 1.1,
    addMaxHealthModifier: (_id, fn) => {
      s.modifier = fn;
      return () => {
        s.modifier = null;
      };
    },
    refreshMaxHealth: () => void s.refreshed++,
    topUp: () => void s.toppedUp++,
    emitApplied: (sec) => void s.applied.push(sec),
    emitRemoved: () => void s.removed++,
  };
  return { s, inn: new Inn(ports) };
}

describe('Inn price', () => {
  it('is 15 when unset or collected and 8 when forgiven', () => {
    expect(roomPrice(undefined)).toBe(15);
    expect(roomPrice('collected')).toBe(15);
    expect(roomPrice('forgiven')).toBe(8);
  });
});

describe('Inn rest', () => {
  it('charges once with reason inn, rests at the inn place and grants Hearty', () => {
    const { s, inn } = make({ price: 'forgiven' });
    expect(inn.rest()).toEqual({ ok: true, paid: 8 });
    expect(s.spent).toEqual([8]);
    expect(s.rests).toEqual([INN.placeId]);
    expect(s.applied).toEqual([INN.heartySeconds]);
    expect(s.toppedUp).toBe(1);
    expect(s.modifier?.()).toBeCloseTo(1.1);
  });

  it.each(['dead', 'cutscene', 'dialogue', 'in-combat'] as const)('refuses while %s and charges nothing', (blocked) => {
    const { s, inn } = make({ blocked });
    expect(inn.rest()).toEqual({ ok: false, reason: blocked });
    expect(s.spent).toEqual([]);
    expect(s.rests).toEqual([]);
    expect(inn.active).toBe(false);
  });

  it('refuses without a rented room and without gold', () => {
    const a = make({ room: false });
    expect(a.inn.rest()).toEqual({ ok: false, reason: 'no-room' });
    const b = make({ gold: 14 });
    expect(b.inn.rest()).toEqual({ ok: false, reason: 'no-gold' });
    expect(b.s.spent).toEqual([]);
    expect(make({ gold: 15 }).inn.rest().ok).toBe(true);
  });
});

describe('Hearty and Cooled', () => {
  it('never reaches 1.21: Cooled running leaves Hearty at 1.0', () => {
    const { s, inn } = make({ cooled: 600 });
    inn.rest();
    expect(s.modifier?.()).toBeCloseTo(1);
    expect(s.modifier!() * 1.1).toBeCloseTo(1.1);
  });

  it('Cooled starting or expiring mid-Hearty keeps the product at 1.1', () => {
    const { s, inn } = make();
    inn.rest();
    const product = () => s.modifier!() * (s.cooled > 0 ? 1.1 : 1);
    expect(product()).toBeCloseTo(1.1);
    s.cooled = 300;
    expect(product()).toBeCloseTo(1.1);
    s.cooled = 0;
    expect(product()).toBeCloseTo(1.1);
  });

  it('refreshes rather than stacks, and ends with a removal', () => {
    const { s, inn } = make();
    inn.rest();
    inn.update(100);
    inn.applyHearty(INN.heartySeconds); // Aldith's Stout
    expect(inn.secondsLeft()).toBe(INN.heartySeconds);
    inn.update(INN.heartySeconds + 1);
    expect(inn.active).toBe(false);
    expect(s.removed).toBe(1);
    expect(s.modifier).toBeNull();
  });

  it('a shorter stout does not shorten a running Hearty', () => {
    const { inn } = make();
    inn.rest();
    inn.applyHearty(60);
    expect(inn.secondsLeft()).toBe(INN.heartySeconds);
    inn.applyHearty(0);
    inn.applyHearty(-5);
    expect(inn.secondsLeft()).toBe(INN.heartySeconds);
  });
});

describe('Inn save', () => {
  it('saves the timer and health and restores them', () => {
    const { inn } = make();
    inn.rest();
    inn.update(120);
    const saved = JSON.parse(JSON.stringify(inn.serialize(77)));
    expect(saved).toEqual({ heartyRemaining: INN.heartySeconds - 120, health: 77 });
    const other = make();
    expect(other.inn.load(saved, 1)).toBe(77);
    expect(other.inn.secondsLeft()).toBe(INN.heartySeconds - 120);
    expect(other.s.applied).toHaveLength(1);
    expect(other.s.modifier?.()).toBeCloseTo(1.1);
  });

  it('saves nothing when Hearty is off and ignores corrupt data', () => {
    const { inn } = make();
    expect(inn.serialize(50)).toBeNull();
    for (const bad of [null, 'x', {}, { heartyRemaining: -1 }, { heartyRemaining: NaN }]) {
      expect(inn.load(bad, 1)).toBeUndefined();
      expect(inn.active).toBe(false);
    }
    expect(inn.load({ heartyRemaining: 10 }, 9)).toBeUndefined();
  });

  it('a load with no entry clears a running buff', () => {
    const { s, inn } = make();
    inn.rest();
    inn.load(null, 1);
    expect(inn.active).toBe(false);
    expect(s.removed).toBe(1);
  });

  it('caps an absurd timer at the buff length', () => {
    const { inn } = make();
    inn.load({ heartyRemaining: 1e9 }, 1);
    expect(inn.secondsLeft()).toBe(INN.heartySeconds);
  });
});

void vi;
