import { describe, expect, it } from 'vitest';
import { OPEN_ENV, RideModel, stoppingSpeed, yawOf } from './RideModel';
import { MOUNT_TUNING as T } from './tuning';

const DT = 1 / 60;
const FWD = { dirX: 0, dirZ: -1, gallop: false };
const run = (m: RideModel, seconds: number, input = FWD, env = OPEN_ENV) => {
  for (let i = 0; i < Math.round(seconds / DT); i++) m.step(input, env, DT);
};

describe('RideModel', () => {
  it('canters at 9 m/s on any move input and gallops at 12 m/s with Shift', () => {
    const m = new RideModel();
    run(m, 1);
    expect(m.speed).toBeCloseTo(T.acceleration, 0);
    run(m, 2);
    expect(m.speed).toBeCloseTo(T.canterSpeed, 5);
    run(m, 1, { ...FWD, gallop: true });
    expect(m.speed).toBeCloseTo(T.gallopSpeed, 5);
    expect(m.galloping).toBe(true);
  });

  it('only the gallop costs stamina: about 8 s from full, then exhausted until 35', () => {
    const m = new RideModel();
    run(m, 3);
    expect(m.stamina).toBe(T.staminaMax);
    let t = 0;
    while (!m.exhausted && t < 20) {
      m.step({ ...FWD, gallop: true }, OPEN_ENV, DT);
      t += DT;
    }
    expect(t).toBeGreaterThan(8);
    expect(t).toBeLessThan(9.5);
    expect(m.stamina).toBe(0);
    run(m, 1, { ...FWD, gallop: true });
    expect(m.speed).toBeCloseTo(T.canterSpeed, 1);
    expect(m.exhausted).toBe(true);
    // 1 s delay (already spent above), then 20/s: 35 after another 1.75 s.
    run(m, 1.5, FWD);
    expect(m.exhausted).toBe(true);
    run(m, 0.5, FWD);
    expect(m.exhausted).toBe(false);
  });

  it('brakes at 12 m/s² with no input, and backs up when the input points behind at low speed', () => {
    const m = new RideModel();
    run(m, 3, { ...FWD, gallop: true });
    run(m, 0.5, { dirX: 0, dirZ: 0, gallop: false });
    expect(m.speed).toBeLessThan(T.gallopSpeed - 5.5);
    run(m, 1, { dirX: 0, dirZ: 0, gallop: false });
    expect(m.speed).toBe(0);
    run(m, 2, { dirX: 0, dirZ: 1, gallop: false });
    expect(m.speed).toBeCloseTo(-T.reverseSpeed, 5);
    expect(m.heading).toBeCloseTo(0, 5);
  });

  it('turns faster when slow than at the gallop, and brakes into a wide turn at speed', () => {
    const slow = new RideModel();
    slow.step({ dirX: 1, dirZ: 0, gallop: false }, OPEN_ENV, 0.1);
    const fast = new RideModel();
    run(fast, 3, { ...FWD, gallop: true });
    const h0 = fast.heading;
    fast.step({ dirX: 1, dirZ: 0, gallop: true }, OPEN_ENV, 0.1);
    expect(Math.abs(slow.heading)).toBeGreaterThan(Math.abs(fast.heading - h0) * 2);
    run(fast, 1, { dirX: 0.2, dirZ: 1, gallop: true });
    expect(fast.speed).toBeLessThan(T.gallopSpeed);
  });

  it('never runs into an obstacle: speed is clamped to what stops within the free distance', () => {
    const m = new RideModel();
    run(m, 3, { ...FWD, gallop: true });
    m.step(FWD, { ...OPEN_ENV, freeAhead: 0.5 }, DT);
    expect(m.speed).toBeLessThanOrEqual(stoppingSpeed(0.5, T.braking) + 1e-9);
    run(m, 1, FWD, { ...OPEN_ENV, freeAhead: 0 });
    expect(m.speed).toBe(0);
    // Turning in place still works against a wall.
    run(m, 0.5, { dirX: 1, dirZ: 0, gallop: false }, { ...OPEN_ENV, freeAhead: 0 });
    expect(m.heading).toBeLessThan(-0.5);
  });

  it('caps at the sprint speed while the terrain ahead is not built, and honours a region cap', () => {
    const m = new RideModel();
    run(m, 4, { ...FWD, gallop: true }, { ...OPEN_ENV, residentAhead: false });
    expect(m.speed).toBeCloseTo(T.unresidentCap, 5);
    run(m, 2, { ...FWD, gallop: true }, { ...OPEN_ENV, speedCap: 3 });
    expect(m.speed).toBeCloseTo(3, 5);
  });

  it('survives bad numbers: dt 0, NaN, a huge dt, NaN input', () => {
    const m = new RideModel();
    m.step(FWD, OPEN_ENV, 0);
    m.step(FWD, OPEN_ENV, Number.NaN);
    expect(m.speed).toBe(0);
    m.step(FWD, OPEN_ENV, 100);
    expect(Number.isFinite(m.speed)).toBe(true);
    m.step({ dirX: Number.NaN, dirZ: Number.NaN, gallop: true }, OPEN_ENV, DT);
    expect([m.speed, m.heading, m.stamina].every(Number.isFinite)).toBe(true);
    m.setStamina(Number.NaN);
    expect(m.stamina).toBe(T.staminaMax);
  });

  it('refill and rest restore stamina; start keeps it', () => {
    const m = new RideModel();
    m.setStamina(0);
    expect(m.exhausted).toBe(true);
    m.rest(1);
    m.rest(1);
    expect(m.stamina).toBeCloseTo(40, 5);
    m.refill();
    expect(m.stamina).toBe(T.staminaMax);
    expect(m.exhausted).toBe(false);
    m.setStamina(40);
    m.start(yawOf(1, 0));
    expect(m.stamina).toBe(40);
    expect(m.dirX).toBeCloseTo(1, 5);
  });
});

describe('RideModel stamina bonus (the Ashmare saddle)', () => {
  it('raises the cap and keeps the fill proportion when the bonus appears', () => {
    const m = new RideModel();
    let bonus = 0;
    m.addStaminaBonus(() => bonus);
    expect(m.max).toBe(T.staminaMax);
    m.setStamina(50);
    bonus = 30;
    expect(m.max).toBe(T.staminaMax + 30);
    m.rest(0.01);
    expect(m.stamina).toBeCloseTo(65 + T.staminaRegen * 0.01, 3);
  });

  it('clamps back when the bonus goes away and the undo removes the source', () => {
    const m = new RideModel();
    const off = m.addStaminaBonus(() => 30);
    m.setStamina(m.max);
    expect(m.stamina).toBe(T.staminaMax + 30);
    off();
    expect(m.max).toBe(T.staminaMax);
    expect(m.stamina).toBeCloseTo(T.staminaMax, 3);
  });

  it('regenerates up to the raised cap and refill fills it', () => {
    const m = new RideModel();
    m.addStaminaBonus(() => 30);
    m.setStamina(T.staminaMax);
    for (let i = 0; i < 600; i++) m.rest(0.1);
    expect(m.stamina).toBe(T.staminaMax + 30);
    m.setStamina(0);
    m.refill();
    expect(m.stamina).toBe(T.staminaMax + 30);
  });

  it('ignores bad bonus values', () => {
    const m = new RideModel();
    m.addStaminaBonus(() => Number.NaN);
    m.addStaminaBonus(() => -10);
    expect(m.max).toBe(T.staminaMax);
  });
});
