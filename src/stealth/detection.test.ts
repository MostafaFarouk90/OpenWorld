import { describe, expect, it } from 'vitest';
import { perceive } from '../enemies/ai/perception';
import { CALM, type GuardAlert, IDLE_PLAYER, type PlayerStealthState, detectTick, playerNoise, stealthModifiers, stepAlert } from './detection';
import { combineModifiers, perceiveWith } from './perceptionPort';
import { STEALTH } from './tuning';

const DT = 1 / 60;
const GUARD = { feet: { x: 0, y: 0, z: 0 }, yaw: 0 }; // faces -Z
const walker: PlayerStealthState = { ...IDLE_PLAYER, moving: true };
const sneaker: PlayerStealthState = { ...IDLE_PLAYER, moving: true, sneaking: true };

/** Runs `ticks` fixed ticks with a fixed pose; returns the tick of the first catch (or -1) and the end state. */
function run(player: PlayerStealthState, feet: { x: number; y: number; z: number }, ticks: number, los?: (a: unknown, b: unknown) => boolean) {
  let st = { awareness: 0, alert: CALM };
  let caughtAt = -1;
  let maxAlert: GuardAlert['state'] = 'calm';
  for (let i = 0; i < ticks; i++) {
    const r = detectTick(GUARD, feet, player, st, DT, los as never);
    st = { awareness: r.awareness, alert: r.alert };
    if (r.alert.state === 'alerted') maxAlert = 'alerted';
    else if (r.alert.state === 'suspicious' && maxAlert === 'calm') maxAlert = 'suspicious';
    if (r.caught && caughtAt < 0) caughtAt = i;
  }
  return { caughtAt, maxAlert, ...st };
}

describe('detection on a fixed tick', () => {
  it('a sneaking player 4 m behind a guard is never noticed in 10 s', () => {
    const r = run(sneaker, { x: 0, y: 0, z: 4 }, 600);
    expect(r.caughtAt).toBe(-1);
    expect(r.maxAlert).toBe('calm');
    expect(r.awareness).toBe(0);
  });

  it('a walking player 4 m behind is heard and eventually alerts the guard (the test can fail)', () => {
    const r = run(walker, { x: 0, y: 0, z: 4 }, 600);
    expect(r.maxAlert).toBe('alerted');
  });

  it('a player standing in the cone at 10 m is caught; sneaking at 10 m is outside the sneak sight range', () => {
    const upright = run({ ...IDLE_PLAYER }, { x: 0, y: 0, z: -10 }, 600);
    expect(upright.caughtAt).toBeGreaterThan(0);
    const low = run({ ...sneaker, moving: false }, { x: 0, y: 0, z: -10 }, 600);
    expect(low.caughtAt).toBe(-1);
  });

  it('sneaking in the cone at 7 m is caught later than walking there', () => {
    const w = run(walker, { x: 0, y: 0, z: -7 }, 900);
    const s = run(sneaker, { x: 0, y: 0, z: -7 }, 900);
    expect(w.caughtAt).toBeGreaterThan(0);
    expect(s.caughtAt).toBeGreaterThan(w.caughtAt);
  });

  it('an Ash Cloud between guard and player blocks sight', () => {
    const cloud = { ...IDLE_PLAYER, blockers: [{ x: 0, z: -5, r: 2 }] };
    expect(run(cloud, { x: 0, y: 0, z: -10 }, 600).caughtAt).toBe(-1);
    const aside = { ...IDLE_PLAYER, blockers: [{ x: 6, z: -5, r: 2 }] };
    expect(run(aside, { x: 0, y: 0, z: -10 }, 600).caughtAt).toBeGreaterThan(0);
  });

  it('Quiet Soles silences footsteps while sneaking at 2 m behind', () => {
    const loudSteps = run(sneaker, { x: 0, y: 0, z: 2 }, 600);
    expect(loudSteps.maxAlert).not.toBe('calm');
    const quiet = run({ ...sneaker, noiseScale: 0 }, { x: 0, y: 0, z: 2 }, 600);
    expect(quiet.maxAlert).toBe('calm');
  });

  it('hidden at 2 m in the cone is safe, at 1.2 m it is not', () => {
    const hidden = { ...IDLE_PLAYER, hidden: true };
    expect(run(hidden, { x: 0, y: 0, z: -2 }, 600).caughtAt).toBe(-1);
    expect(run(hidden, { x: 0, y: 0, z: -1.2 }, 600).caughtAt).toBeGreaterThanOrEqual(0);
  });

  it('low cover: sneaking aims the sight ray lower, so waist-high cover hides a sneaker', () => {
    const waistWall = (_from: unknown, to: unknown) => (to as { y: number }).y > 0.9; // blocks rays aimed below 0.9 m
    expect(run({ ...sneaker, moving: false }, { x: 0, y: 0, z: -5 }, 600, waistWall).caughtAt).toBe(-1);
    expect(run({ ...IDLE_PLAYER }, { x: 0, y: 0, z: -5 }, 600, waistWall).caughtAt).toBeGreaterThan(0);
  });

  it('edge: NaN poses stay calm and never throw', () => {
    const r = run(walker, { x: NaN, y: 0, z: 0 }, 60);
    expect(r.maxAlert).toBe('calm');
    expect(r.caughtAt).toBe(-1);
  });
});

describe('stealthModifiers', () => {
  it('is null when nothing applies, so perception is unchanged (golden check against perceive)', () => {
    expect(stealthModifiers(IDLE_PLAYER)).toBeNull();
    expect(stealthModifiers({ ...IDLE_PLAYER, moving: true, loud: true })).toBeNull();
    const input = {
      selfFeet: { x: 0, y: 0, z: 0 }, selfYaw: 0, targetFeet: { x: 3, y: 0, z: -9 }, targetAlive: true,
      targetLoud: false, damagedBy: false, lineOfSight: () => true,
    };
    expect(perceiveWith(input, stealthModifiers(IDLE_PLAYER))).toEqual(perceive(input));
  });

  it('noise scale out of range is clamped and NaN counts as full noise', () => {
    expect(stealthModifiers({ ...IDLE_PLAYER, noiseScale: -3 })?.hearingQuietScale).toBe(0);
    expect(stealthModifiers({ ...IDLE_PLAYER, noiseScale: NaN })).toBeNull();
  });

  it('combines with other providers by the agreed rules', () => {
    const c = combineModifiers([stealthModifiers(sneaker), { sightRangeScale: 0.5, coneScale: 1, hearingQuietScale: 1, hearingLoudScale: 1, targetHeight: 0.4, blockSight: [{ x: 0, z: 0, r: 1 }] }, null]);
    expect(c.sightRangeScale).toBeCloseTo(STEALTH.sneak.sightRangeScale * 0.5);
    expect(c.targetHeight).toBe(0.4);
    expect(c.blockSight).toHaveLength(1);
  });
});

describe('playerNoise', () => {
  it('null when not sneaking, small while sneaking, zero still or with Quiet Soles', () => {
    expect(playerNoise(walker)).toBeNull();
    expect(playerNoise(sneaker)).toBeCloseTo(6 * STEALTH.sneak.hearingQuietScale);
    expect(playerNoise({ ...sneaker, moving: false })).toBe(0);
    expect(playerNoise({ ...sneaker, noiseScale: 0 })).toBe(0);
  });
});

describe('stepAlert', () => {
  const read = (awareness: number, sees = true, distance = 8) => ({ awareness, sees, distance });
  it('walks calm, suspicious, alerted with hysteresis', () => {
    let a = stepAlert(CALM, read(0.35), DT).next;
    expect(a.state).toBe('suspicious');
    a = stepAlert(a, read(0.25), DT).next;
    expect(a.state).toBe('suspicious');
    a = stepAlert(a, read(0.1), DT).next;
    expect(a.state).toBe('calm');
    a = stepAlert(a, read(1), DT).next;
    expect(a.state).toBe('alerted');
  });

  it('catches after the grace of continuous sight, not before', () => {
    let a: GuardAlert = CALM;
    const n = Math.round(STEALTH.caughtGraceSeconds / DT);
    for (let i = 1; i < n; i++) {
      const r = stepAlert(a, read(1), DT);
      expect(r.caught).toBe(false);
      a = r.next;
    }
    expect(stepAlert(a, read(1), DT).caught).toBe(true);
  });

  it('losing sight inside the grace drops to suspicious and resets the grace', () => {
    let a = stepAlert(CALM, read(1), DT).next;
    a = stepAlert(a, read(0.9, false), DT).next;
    expect(a.state).toBe('suspicious');
    expect(a.sightSeconds).toBe(0);
  });

  it('catches at once within the catch radius', () => {
    expect(stepAlert(CALM, read(1, true, 1.2), DT).caught).toBe(true);
    expect(stepAlert(CALM, read(1, false, 1.2), DT).caught).toBe(false);
  });
});
