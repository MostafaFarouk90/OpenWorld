import { describe, expect, it } from 'vitest';
import { Stamina } from './Stamina';
import { STAMINA } from './tuning';

const makeActor = (stamina = 100, maxStamina = 100) => ({
  stamina,
  maxStamina,
  spendStamina(n: number) {
    if (this.stamina < n) return false;
    this.stamina -= n;
    return true;
  },
  restoreStamina(n: number) {
    this.stamina = Math.min(this.maxStamina, this.stamina + n);
  },
});

const make = (stamina = 100, infinite = { value: false }) => {
  const actor = makeActor(stamina);
  return { actor, infinite, s: new Stamina(actor, () => infinite.value) };
};

const idle = { blocking: false, sprinting: false };
const run = (s: Stamina, n: number, opts = idle) => {
  for (let i = 0; i < n; i++) s.tick(opts);
};
const perTick = STAMINA.regenPerSecond / 60;

describe('Stamina.spend', () => {
  it('spends and reports success', () => {
    const { actor, s } = make(100);
    expect(s.spend(18)).toBe(true);
    expect(actor.stamina).toBe(82);
    expect(s.exhausted).toBe(false);
  });

  it('spending the exact balance leaves 0 and exhausts', () => {
    const { actor, s } = make(18);
    expect(s.spend(18)).toBe(true);
    expect(actor.stamina).toBe(0);
    expect(s.exhausted).toBe(true);
  });

  it('insufficient stamina spends nothing and does not exhaust', () => {
    const { actor, s } = make(10);
    expect(s.spend(18)).toBe(false);
    expect(actor.stamina).toBe(10);
    expect(s.exhausted).toBe(false);
  });

  it('negative, zero and NaN costs are free no-ops', () => {
    const { actor, s } = make(50);
    expect(s.spend(-5)).toBe(true);
    expect(s.spend(0)).toBe(true);
    expect(s.spend(NaN)).toBe(true);
    expect(actor.stamina).toBe(50);
  });

  it('is refused while exhausted even if regen has brought some back', () => {
    const { actor, s } = make(18);
    s.spend(18);
    run(s, STAMINA.regenDelayTicks + 12);
    expect(actor.stamina).toBeGreaterThan(0);
    expect(actor.stamina).toBeLessThan(STAMINA.exhaustRecover);
    expect(s.exhausted).toBe(true);
    expect(s.spend(1)).toBe(false);
    expect(s.canAfford(1)).toBe(false);
  });

  it('canAfford compares against the balance', () => {
    const { s } = make(20);
    expect(s.canAfford(20)).toBe(true);
    expect(s.canAfford(20.01)).toBe(false);
    expect(s.canAfford(0)).toBe(true);
  });

  it('infinite flag makes spend a no-op, and flipping mid-run takes effect', () => {
    const { actor, infinite, s } = make(30);
    infinite.value = true;
    expect(s.spend(18)).toBe(true);
    expect(actor.stamina).toBe(30);
    expect(s.canAfford(1000)).toBe(true);
    infinite.value = false;
    expect(s.spend(18)).toBe(true);
    expect(actor.stamina).toBe(12);
    infinite.value = true;
    expect(s.spend(18)).toBe(true);
    expect(actor.stamina).toBe(12);
  });
});

describe('Stamina regeneration', () => {
  it('waits exactly the regen delay after a spend', () => {
    const { actor, s } = make(100);
    s.spend(50);
    run(s, STAMINA.regenDelayTicks);
    expect(actor.stamina).toBe(50);
    s.tick(idle);
    expect(actor.stamina).toBeCloseTo(50 + perTick, 10);
  });

  it('regenerates immediately when nothing has been spent', () => {
    const { actor, s } = make(50);
    s.tick(idle);
    expect(actor.stamina).toBeCloseTo(50 + perTick, 10);
  });

  it('a spend during the delay restarts it', () => {
    const { actor, s } = make(100);
    s.spend(50);
    run(s, STAMINA.regenDelayTicks - 1);
    s.spend(10);
    run(s, STAMINA.regenDelayTicks);
    expect(actor.stamina).toBe(40);
    s.tick(idle);
    expect(actor.stamina).toBeGreaterThan(40);
  });

  it('regen is scaled while blocking', () => {
    const { actor, s } = make(50);
    s.tick({ blocking: true, sprinting: false });
    expect(actor.stamina).toBeCloseTo(50 + perTick * STAMINA.blockRegenScale, 10);
  });

  it('clamps to max', () => {
    const { actor, s } = make(99.9);
    run(s, 10);
    expect(actor.stamina).toBe(100);
  });

  it('exhaustion clears at exactly the recover threshold, not below', () => {
    const { actor, s } = make(0.0001);
    s.spend(0.0001);
    expect(s.exhausted).toBe(true);
    actor.stamina = STAMINA.exhaustRecover - perTick - 0.001;
    run(s, STAMINA.regenDelayTicks);
    s.tick(idle);
    expect(actor.stamina).toBeLessThan(STAMINA.exhaustRecover);
    expect(s.exhausted).toBe(true);
    actor.stamina = STAMINA.exhaustRecover - perTick;
    s.tick(idle);
    expect(actor.stamina).toBeCloseTo(STAMINA.exhaustRecover, 10);
    expect(s.exhausted).toBe(false);
  });

  it('24 is not recovered and 25 is', () => {
    const { actor, s } = make(10);
    s.forceDrain(10);
    expect(s.exhausted).toBe(true);
    actor.stamina = 24;
    s.tick(idle);
    expect(s.exhausted).toBe(true);
    actor.stamina = STAMINA.exhaustRecover - perTick;
    run(s, STAMINA.regenDelayTicks);
    actor.stamina = STAMINA.exhaustRecover;
    s.tick(idle);
    expect(s.exhausted).toBe(false);
  });
});

describe('Stamina.forceDrain', () => {
  it('drains without refusing and clamps at 0', () => {
    const { actor, s } = make(15);
    s.forceDrain(40);
    expect(actor.stamina).toBe(0);
    expect(s.exhausted).toBe(true);
  });

  it('a partial drain does not exhaust but restarts the delay', () => {
    const { actor, s } = make(50);
    s.forceDrain(20);
    expect(actor.stamina).toBe(30);
    expect(s.exhausted).toBe(false);
    run(s, STAMINA.regenDelayTicks);
    expect(actor.stamina).toBe(30);
  });

  it('ignores non-positive amounts and the infinite flag', () => {
    const { actor, infinite, s } = make(50);
    s.forceDrain(-3);
    s.forceDrain(NaN);
    infinite.value = true;
    s.forceDrain(30);
    expect(actor.stamina).toBe(50);
  });
});

describe('Stamina sprint', () => {
  const sprint = { blocking: false, sprinting: true };

  it('drains sprintPerSecond over a second and blocks regen', () => {
    const { actor, s } = make(100);
    run(s, 60, sprint);
    expect(actor.stamina).toBeCloseTo(100 - STAMINA.sprintPerSecond, 8);
  });

  it('does not drain when infinite', () => {
    const { actor, s } = make(100, { value: true });
    run(s, 60, sprint);
    expect(actor.stamina).toBe(100);
  });

  it('sprinting to 0 exhausts and stops draining', () => {
    const { actor, s } = make(0.5);
    run(s, 3, sprint);
    expect(actor.stamina).toBe(0);
    expect(s.exhausted).toBe(true);
    run(s, 5, sprint);
    expect(actor.stamina).toBe(0);
  });

  it('while exhausted, sprinting does not restart the regen delay', () => {
    const { actor, s } = make(5);
    s.forceDrain(5);
    run(s, STAMINA.regenDelayTicks);
    s.tick(sprint);
    expect(actor.stamina).toBeGreaterThan(0);
  });
});
