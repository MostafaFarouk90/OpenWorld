import { describe, expect, it } from 'vitest';
import { GuardModel, type GuardContext } from './GuardModel';
import { GUARD, STAMINA } from './tuning';
import type { DamageRequestLike } from './types';

const deg = (d: number) => (d * Math.PI) / 180;
/** Direction attacker to target for an attacker standing `angle` degrees off the Knight's forward (facing -Z). */
const from = (angle: number) => ({ x: Math.sin(deg(angle)), y: 0, z: Math.cos(deg(angle)) });

const req = (o: Partial<DamageRequestLike> = {}): DamageRequestLike => ({
  attackerId: 'wolf', targetId: 'knight', amount: 10, poise: 10, kind: 'melee',
  attackId: 'bite', swingId: 1, direction: from(0), ...o,
});

const stamina = (value: number) => ({ canAfford: (n: number) => value >= n, current: value });
const ctx = (tick: number, o: Partial<GuardContext> = {}): GuardContext => ({
  tick, facingYaw: 0, stamina: stamina(100), exhausted: false, ...o,
});
const open = (g: GuardModel, tick: number, swingId = 1, actorId = 'wolf', attackId = 'bite') =>
  g.onWindow({ actorId, attackId, swingId, phase: 'open' }, tick);
const close = (g: GuardModel, tick: number, swingId = 1, actorId = 'wolf', attackId = 'bite') =>
  g.onWindow({ actorId, attackId, swingId, phase: 'close' }, tick);

describe('block state', () => {
  it('records the press tick on a rising edge only', () => {
    const g = new GuardModel();
    g.setBlockHeld(true, 10);
    g.setBlockHeld(true, 20);
    expect(g.held).toBe(true);
    expect(g.pressTick).toBe(10);
    g.setBlockHeld(false, 30);
    expect(g.held).toBe(false);
    g.setBlockHeld(true, 40);
    expect(g.pressTick).toBe(40);
  });
});

describe('arc', () => {
  const blockedAt = (angle: number, yaw = 0) => {
    const g = new GuardModel();
    g.setBlockHeld(true, 0);
    return g.resolve(req({ swingId: undefined, direction: from(angle) }), ctx(100, { facingYaw: yaw })).outcome;
  };

  it('front is blocked, back is a hit', () => {
    expect(blockedAt(0)).toBe('blocked');
    expect(blockedAt(180)).toBe('hit');
  });

  it('99 deg blocks, 101 deg hits, both sides', () => {
    expect(blockedAt(99)).toBe('blocked');
    expect(blockedAt(-99)).toBe('blocked');
    expect(blockedAt(101)).toBe('hit');
    expect(blockedAt(-101)).toBe('hit');
  });

  it('100 deg boundary is inside', () => {
    expect(blockedAt(100 - 1e-9)).toBe('blocked');
    expect(blockedAt(100 + 1e-6)).toBe('hit');
  });

  it('follows facingYaw', () => {
    // yaw pi/2 faces -X; an attacker at -X is in front.
    const g = new GuardModel();
    g.setBlockHeld(true, 0);
    const r = (dx: number) => g.resolve(req({ swingId: undefined, direction: { x: dx, y: 0, z: 0 } }), ctx(100, { facingYaw: Math.PI / 2 })).outcome;
    expect(r(1)).toBe('blocked');
    expect(r(-1)).toBe('hit');
  });

  it('a request without direction is a hit', () => {
    const g = new GuardModel();
    g.setBlockHeld(true, 0);
    expect(g.resolve(req({ direction: undefined }), ctx(100)).outcome).toBe('hit');
  });
});

describe('block and cost', () => {
  it('blocked hit scales damage and poise and charges base + raw scale', () => {
    const g = new GuardModel();
    g.setBlockHeld(true, 0);
    const r = g.resolve(req({ swingId: undefined, amount: 14 }), ctx(100));
    expect(r).toEqual({
      outcome: 'blocked', scale: GUARD.blockedScale, poiseScale: GUARD.blockedScale,
      staminaCost: STAMINA.blockHitBase + STAMINA.blockHitRawScale * 14, guardBreak: false,
    });
    expect(r.staminaCost).toBe(17);
  });

  it('stamina exactly equal to the cost succeeds', () => {
    const g = new GuardModel();
    g.setBlockHeld(true, 0);
    const r = g.resolve(req({ swingId: undefined, amount: 10 }), ctx(100, { stamina: stamina(15) }));
    expect(r.outcome).toBe('blocked');
    const r2 = g.resolve(req({ swingId: undefined, amount: 10 }), ctx(100, { stamina: stamina(14.99) }));
    expect(r2.guardBreak).toBe(true);
  });

  it('not holding block is a plain hit', () => {
    const g = new GuardModel();
    expect(g.resolve(req(), ctx(100))).toEqual({ outcome: 'hit', scale: 1, poiseScale: 1, staminaCost: 0, guardBreak: false });
  });

  it('exhausted is a plain hit', () => {
    const g = new GuardModel();
    g.setBlockHeld(true, 0);
    expect(g.resolve(req({ swingId: undefined }), ctx(100, { exhausted: true })).outcome).toBe('hit');
  });

  it('req.unblockable is honoured', () => {
    const g = new GuardModel();
    g.setBlockHeld(true, 0);
    expect(g.resolve(req({ swingId: undefined, unblockable: true }), ctx(100)).outcome).toBe('hit');
  });
});

describe('guard break', () => {
  it('block at 0 stamina breaks the guard, drains the rest and locks out exactly', () => {
    const g = new GuardModel();
    g.setBlockHeld(true, 0);
    const r = g.resolve(req({ swingId: undefined }), ctx(100, { stamina: stamina(0) }));
    expect(r).toEqual({ outcome: 'hit', scale: 1, poiseScale: 1, staminaCost: 0, guardBreak: true });
    const withStamina = g.resolve(req({ swingId: undefined }), ctx(100 + GUARD.guardBreakLockoutTicks - 1, { stamina: stamina(100) }));
    expect(withStamina.outcome).toBe('hit');
    expect(g.lockedOut(100 + GUARD.guardBreakLockoutTicks - 1)).toBe(true);
    expect(g.lockedOut(100 + GUARD.guardBreakLockoutTicks)).toBe(false);
    expect(g.resolve(req({ swingId: undefined }), ctx(100 + GUARD.guardBreakLockoutTicks)).outcome).toBe('blocked');
  });

  it('staminaCost on a break is everything that is left', () => {
    const g = new GuardModel();
    g.setBlockHeld(true, 0);
    const r = g.resolve(req({ swingId: undefined, amount: 40 }), ctx(100, { stamina: stamina(12) }));
    expect(r.guardBreak).toBe(true);
    expect(r.staminaCost).toBe(12);
  });

  it('lockout() can be called directly', () => {
    const g = new GuardModel();
    g.lockout(5);
    expect(g.lockedOut(5)).toBe(true);
    expect(g.lockedOut(5 + GUARD.guardBreakLockoutTicks)).toBe(false);
  });
});

describe('parry', () => {
  const parryWith = (pressOffset: number, o = 100, hitTick = o + 3) => {
    const g = new GuardModel();
    g.setBlockHeld(true, o + pressOffset);
    open(g, o);
    return g.resolve(req(), ctx(hitTick));
  };

  it('press 12 ticks before open parries; 13 blocks', () => {
    expect(parryWith(-GUARD.parryLeadTicks).outcome).toBe('parried');
    expect(parryWith(-GUARD.parryLeadTicks - 1).outcome).toBe('blocked');
  });

  it('press at the open tick parries; one tick later blocks', () => {
    expect(parryWith(0).outcome).toBe('parried');
    expect(parryWith(1).outcome).toBe('blocked');
  });

  it('a parry takes nothing and costs no stamina', () => {
    expect(parryWith(-5)).toEqual({ outcome: 'parried', scale: 0, poiseScale: 0, staminaCost: 0, guardBreak: false });
  });

  it('holding long before the window blocks', () => {
    expect(parryWith(-200).outcome).toBe('blocked');
  });

  it('releasing before impact is a hit', () => {
    const g = new GuardModel();
    g.setBlockHeld(true, 95);
    open(g, 100);
    g.setBlockHeld(false, 101);
    expect(g.resolve(req(), ctx(103)).outcome).toBe('hit');
  });

  it('same-tick open and hit works', () => {
    const g = new GuardModel();
    g.setBlockHeld(true, 100);
    open(g, 100);
    expect(g.resolve(req(), ctx(100)).outcome).toBe('parried');
  });

  it('tracks two attackers by swing id, independent of event order', () => {
    const g = new GuardModel();
    g.setBlockHeld(true, 100);
    open(g, 90, 1, 'wolf');
    open(g, 100, 2, 'bandit');
    expect(g.swingOpenTick('wolf', 1)).toBe(90);
    expect(g.swingOpenTick('bandit', 2)).toBe(100);
    expect(g.resolve(req({ attackerId: 'bandit', swingId: 2 }), ctx(102)).outcome).toBe('parried');
    expect(g.resolve(req({ attackerId: 'wolf', swingId: 1 }), ctx(102)).outcome).toBe('blocked');
  });

  it('parryable: false turns a timed block into a plain block', () => {
    const g = new GuardModel();
    g.setBlockHeld(true, 100);
    const res = g.resolve(req({ attackerId: 'prior', parryable: false }), ctx(102));
    expect(res.outcome).toBe('blocked');
    expect(res.scale).toBe(GUARD.blockedScale);
    expect(res.staminaCost).toBeGreaterThan(0);
  });

  it('parryable: false still guard-breaks when stamina is short', () => {
    const g = new GuardModel();
    g.setBlockHeld(true, 100);
    const res = g.resolve(req({ parryable: false }), { ...ctx(102), stamina: { canAfford: () => false, current: 7 } });
    expect(res).toMatchObject({ outcome: 'hit', guardBreak: true, staminaCost: 7 });
  });

  it('without a known window falls back to the lead rule', () => {
    const g = new GuardModel();
    g.setBlockHeld(true, 100);
    const spell = (tick: number) => g.resolve(req({ kind: 'spell', swingId: undefined, attackerId: null }), ctx(tick)).outcome;
    expect(spell(100 + GUARD.parryLeadTicks)).toBe('parried');
    expect(spell(100 + GUARD.parryLeadTicks + 1)).toBe('blocked');
    expect(g.resolve(req({ swingId: 99 }), ctx(105)).outcome).toBe('parried');
  });

  it('a closed window is forgotten', () => {
    const g = new GuardModel();
    open(g, 100);
    close(g, 110);
    expect(g.swingOpenTick('wolf', 1)).toBeUndefined();
  });
});

describe('unblockable (dodge telegraph) swings', () => {
  const held = () => {
    const g = new GuardModel();
    g.setBlockHeld(true, 0);
    return g;
  };
  const dodge = (g: GuardModel, attackId = 'slam') =>
    g.onTelegraph({ actorId: 'wolf', kind: 'dodge', attackId, leadSeconds: 0.5 });

  it('a dodge telegraph followed by that attack opening hits through a held block', () => {
    const g = held();
    dodge(g);
    open(g, 100, 1, 'wolf', 'slam');
    expect(g.resolve(req({ attackId: 'slam' }), ctx(102)).outcome).toBe('hit');
  });

  it('is unblockable by attackId even before the window opens', () => {
    const g = held();
    dodge(g);
    expect(g.resolve(req({ attackId: 'slam', swingId: undefined }), ctx(102)).outcome).toBe('hit');
  });

  it('is unblockable by swing id when the request carries no attackId', () => {
    const g = held();
    dodge(g);
    open(g, 100, 7, 'wolf', 'slam');
    expect(g.resolve(req({ attackId: undefined, swingId: 7 }), ctx(102)).outcome).toBe('hit');
  });

  it('the mark is removed when the window closes and does not affect other attackIds', () => {
    const g = held();
    dodge(g);
    open(g, 100, 1, 'wolf', 'slam');
    close(g, 110, 1, 'wolf', 'slam');
    expect(g.resolve(req({ attackId: 'slam', swingId: undefined }), ctx(120)).outcome).toBe('blocked');
    open(g, 130, 2, 'wolf', 'bite');
    expect(g.resolve(req({ attackId: 'bite', swingId: 2 }), ctx(132)).outcome).not.toBe('hit');
  });

  it('a block telegraph changes nothing', () => {
    const g = held();
    g.onTelegraph({ actorId: 'wolf', kind: 'block', attackId: 'slam', leadSeconds: 0.5 });
    expect(g.resolve(req({ attackId: 'slam', swingId: undefined }), ctx(102)).outcome).toBe('blocked');
  });

  it('marks are per attacker', () => {
    const g = held();
    dodge(g);
    expect(g.resolve(req({ attackerId: 'bandit', attackId: 'slam', swingId: undefined }), ctx(102)).outcome).toBe('blocked');
  });

  it('clearActor drops windows and marks', () => {
    const g = held();
    dodge(g);
    open(g, 100, 1, 'wolf', 'slam');
    g.clearActor('wolf');
    expect(g.swingOpenTick('wolf', 1)).toBeUndefined();
    expect(g.resolve(req({ attackId: 'slam', swingId: 1 }), ctx(102)).outcome).toBe('blocked');
  });
});

describe('arcHalfAngle context override', () => {
  const outcomeAt = (angle: number, arcHalfAngle?: number) => {
    const g = new GuardModel();
    g.setBlockHeld(true, 0);
    return g.resolve(req({ swingId: undefined, direction: from(angle) }), ctx(100, arcHalfAngle === undefined ? {} : { arcHalfAngle })).outcome;
  };

  it('the default arc is 100 degrees and does not block a hit from 120 degrees', () => {
    expect(outcomeAt(120)).toBe('hit');
    expect(outcomeAt(120, undefined)).toBe('hit');
  });

  it('a 135 degree arc blocks 120 degrees on either side but not 140', () => {
    expect(outcomeAt(120, deg(135))).toBe('blocked');
    expect(outcomeAt(-120, deg(135))).toBe('blocked');
    expect(outcomeAt(140, deg(135))).toBe('hit');
    expect(outcomeAt(-140, deg(135))).toBe('hit');
  });

  it('the Iron Stance tuning value is that 135 degree arc', () => {
    expect(GUARD.ironStanceArcHalfAngle).toBeCloseTo(deg(135));
    expect(outcomeAt(134, GUARD.ironStanceArcHalfAngle)).toBe('blocked');
    expect(outcomeAt(136, GUARD.ironStanceArcHalfAngle)).toBe('hit');
  });

  it('a narrower arc blocks less than the default', () => {
    expect(outcomeAt(60, deg(45))).toBe('hit');
    expect(outcomeAt(30, deg(45))).toBe('blocked');
  });

  it('a wider arc never blocks a hit from straight behind, and still needs a direction', () => {
    expect(outcomeAt(180, deg(135))).toBe('hit');
    const g = new GuardModel();
    g.setBlockHeld(true, 0);
    expect(g.resolve(req({ swingId: undefined, direction: undefined }), ctx(100, { arcHalfAngle: deg(179) })).outcome).toBe('hit');
  });

  it('follows facingYaw with the widened arc', () => {
    const g = new GuardModel();
    g.setBlockHeld(true, 0);
    // yaw pi/2 faces -X; an attacker at -X plus 120 degrees round is blocked only with the wide arc.
    const wide = g.resolve(req({ swingId: undefined, direction: from(120 - 90) }), ctx(100, { facingYaw: Math.PI / 2, arcHalfAngle: deg(135) }));
    expect(wide.outcome).toBe('blocked');
  });

  it('does not bypass lockout, exhaustion or unblockable attacks', () => {
    const g = new GuardModel();
    g.setBlockHeld(true, 0);
    expect(g.resolve(req({ swingId: undefined, direction: from(120) }), ctx(100, { arcHalfAngle: deg(135), exhausted: true })).outcome).toBe('hit');
    expect(g.resolve(req({ swingId: undefined, direction: from(120), unblockable: true }), ctx(100, { arcHalfAngle: deg(135) })).outcome).toBe('hit');
  });
});
