import { describe, expect, it } from 'vitest';
import { PLAYER } from '../config/constants';
import { LEAP } from '../spells/tuning';
import { Polyline, playerPath } from './route';
import { LEAP_SECONDS, jumpReach, runPar, sustainableSpeed, timerFor } from './solvability';
import { m10FixtureRoute, plankRoute } from './testing/m10Fixture';
import { CHASE } from './tuning';

/** Lowest class stamina (Emberwright, plans/slice-2-class-system.md). */
const MIN_STAMINA = 80;

describe('chase solvability (embers-slice-2.md 3B.2)', () => {
  const route = m10FixtureRoute();
  const timer = timerFor(route, MIN_STAMINA);

  it('the timer is par x 1.2 and finite', () => {
    expect(Number.isFinite(timer)).toBe(true);
    const par = runPar(route, { maxStamina: MIN_STAMINA, useLeap: false });
    expect(timer).toBe(Math.ceil(par.seconds * CHASE.timerOverPar));
  });

  it('route length / timer stays under the stamina-limited sprint speed (derived from STAMINA)', () => {
    const sustained = sustainableSpeed(MIN_STAMINA);
    expect(sustained).toBeGreaterThan(PLAYER.walkSpeed);
    expect(sustained).toBeLessThan(PLAYER.sprintSpeed);
    const length = new Polyline(playerPath(route, false).map((p) => p.position)).length;
    expect(length / timer).toBeLessThan(sustained);
  });

  it('a par runner without the Leap at the lowest stamina catches the courier inside the timer with 15% margin', () => {
    const r = runPar(route, { maxStamina: MIN_STAMINA, useLeap: false, timer });
    expect(r.outcome).toBe('caught');
    expect(r.seconds).toBeLessThanOrEqual(timer / 1.15);
    expect(r.maxGap).toBeLessThan(CHASE.loseGap);
    expect(r.leaps).toBe(0);
  });

  it('thread 17 route has no Leap gaps, so the Leap changes nothing there', () => {
    const plain = runPar(route, { maxStamina: MIN_STAMINA, useLeap: false, timer });
    const leap = runPar(route, { maxStamina: MIN_STAMINA, useLeap: true, timer });
    expect(leap.seconds).toBeCloseTo(plain.seconds, 6);
  });

  it('on a route with plank detours the Leap only adds margin', () => {
    const plank = plankRoute();
    const t = timerFor(plank, MIN_STAMINA);
    const plain = runPar(plank, { maxStamina: MIN_STAMINA, useLeap: false, timer: t });
    const leap = runPar(plank, { maxStamina: MIN_STAMINA, useLeap: true, timer: t });
    expect(plain.outcome).toBe('caught');
    expect(leap.outcome).toBe('caught');
    expect(leap.leaps).toBeGreaterThan(0);
    // Cutting ahead past his plank means waiting for him to run into you: it is never needed, only allowed.
    expect(leap.seconds).toBeLessThanOrEqual(t);
  });

  it('independent of the par runner: a sloppier player (5% slower) still catches inside the timer', () => {
    const r = runPar(route, { maxStamina: MIN_STAMINA, useLeap: false, timer, pace: 0.95 });
    expect(r.outcome).toBe('caught');
  });

  it('the timer is in a sane range for the route (between a pure sprint and a walk of the path)', () => {
    const par = runPar(route, { maxStamina: MIN_STAMINA, useLeap: false });
    expect(timer).toBeGreaterThan(par.pathLength / PLAYER.sprintSpeed);
    expect(timer).toBeLessThan(par.pathLength / PLAYER.walkSpeed);
  });

  it('a walker also loses on distance on a route with no plain jumps (the plank route)', () => {
    const r = runPar(plankRoute(), { maxStamina: MIN_STAMINA, useLeap: false, neverSprint: true });
    expect(r.outcome).toBe('lost');
    expect(r.reason).toBe('distance');
  });

  it('a runner who never sprints loses on distance (the courier floor beats the walk)', () => {
    expect(CHASE.courierFloor).toBeGreaterThan(PLAYER.walkSpeed);
    const r = runPar(route, { maxStamina: MIN_STAMINA, useLeap: false, neverSprint: true, timer });
    expect(r.outcome).toBe('lost');
    expect(r.reason).toBe('distance');
  });

  it('plain jumps: a 3 m gap needs a run-up (clears at sprint, not at walk)', () => {
    expect(jumpReach(PLAYER.sprintSpeed, 6, 6)).toBeGreaterThan(3);
    expect(jumpReach(PLAYER.walkSpeed, 6, 6)).toBeLessThan(3);
    expect(jumpReach(PLAYER.sprintSpeed, 0, 2)).toBe(0); // higher than the apex: unreachable
  });

  it('edge: an alley up to a roof above the jump apex is stuck; a Leap gap wider than 6 m too', () => {
    const high = m10FixtureRoute();
    high[7].position.y = high[6].position.y + 1.5; // the far roof is above the 1.06 m apex
    expect(runPar(high, { maxStamina: MIN_STAMINA, useLeap: false }).outcome).toBe('lost');
    const far = plankRoute();
    far[2].position.x = far[1].position.x + LEAP.distance + 1;
    expect(runPar(far, { maxStamina: MIN_STAMINA, useLeap: true }).reason).toBe('stuck');
  });

  it('the Leap air time follows its apex', () => {
    expect(LEAP_SECONDS).toBeGreaterThan(0.8);
    expect(LEAP_SECONDS).toBeLessThan(1.1);
  });
});
