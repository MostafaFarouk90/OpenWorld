import { describe, expect, it, vi } from 'vitest';
import { ActorRegistry } from '../actors/ActorRegistry';
import { DamageResolver } from '../actors/DamageResolver';
import { playerInit } from '../actors/teams';
import type { StatusService } from '../actors/status';
import { GameEvents } from '../core/events';
import { TRIAL_TUNING, Trials, trialOutcome, type TrialStart } from './trials';

const DT = 1 / 60;

function make(withStatus = true) {
  const events = new GameEvents(() => {});
  const actors = new ActorRegistry(events);
  const dr = new DamageResolver(actors, events, () => {});
  const player = actors.spawn(playerInit());
  const opp = actors.spawn({ kind: 'ysmeryth', team: 'hostile', maxHealth: 120, maxPoise: 45 });
  const feet = { x: 0, y: 0, z: 0 };
  const apply = vi.fn((_id: string, _s: unknown) => true);
  const status = { apply } as unknown as StatusService;
  const trials = new Trials({
    events,
    actors,
    addLethalHandler: (id, fn, order) => dr.addLethalHandler(id, fn, order),
    heal: (id, n) => dr.heal(id, n),
    playerFeet: () => feet,
    status: withStatus ? () => status : undefined,
  });
  const ended: string[] = [];
  events.on('trial.ended', (e) => ended.push(e.reason));
  const tick = (s: number) => {
    for (let t = 0; t < s; t += DT) trials.fixedUpdate(DT);
  };
  const breakBy = (byId: string, targetId: string) => {
    dr.stagger(targetId, byId, 1000);
    tick(TRIAL_TUNING.pauseSeconds + 0.1);
  };
  const start = (o: Partial<TrialStart> = {}) => trials.start({ id: 't', opponentId: opp.id, ...o });
  return { trials, player, opp, feet, tick, breakBy, start, ended, apply, actors };
}

describe('trial v2: allowYield', () => {
  it('a trial without allowYield: canYield false, yield works at once', () => {
    const t = make();
    t.start();
    expect(t.trials.canYield()).toBe(false);
    expect(t.trials.yield('t')).toBe(true);
    expect(t.ended).toEqual(['yielded']);
  });
  it('with allowYield, yield is refused before the threshold and works after', () => {
    const t = make();
    t.start({ allowYield: { afterBreaks: 2 } });
    expect(t.trials.canYield()).toBe(false);
    expect(t.trials.yield('t')).toBe(false);
    expect(t.trials.state()).not.toBeNull();
    t.breakBy(t.player.id, t.opp.id);
    expect(t.trials.canYield()).toBe(false);
    t.breakBy(t.opp.id, t.player.id);
    expect(t.trials.canYield()).toBe(true);
    expect(t.trials.yield('x')).toBe(false);
    expect(t.trials.yield('t')).toBe(true);
    expect(t.ended).toEqual(['yielded']);
    expect(t.trials.canYield()).toBe(false);
  });
  it('canYield is false with no trial', () => {
    expect(make().trials.canYield()).toBe(false);
  });
});

describe('trial v2: distance rules', () => {
  // The opponent stays at the origin; the player walks along x in 5 m steps (a step of 8 m or more reads as a teleport).
  const walkTo = (t: ReturnType<typeof make>, x: number) => {
    while (t.ended.length === 0 && Math.abs(t.feet.x - x) > 0.01) {
      t.feet.x += Math.sign(x - t.feet.x) * Math.min(5, Math.abs(x - t.feet.x));
      t.tick(DT);
    }
  };
  it('default: ends by distance past 30 m from the opponent', () => {
    const t = make();
    t.start();
    walkTo(t, 25);
    expect(t.ended).toEqual([]);
    walkTo(t, 40);
    expect(t.ended).toEqual(['distance']);
  });
  it('leaveDistance alone replaces 30 in the opponent rule', () => {
    const t = make();
    t.start({ leaveDistance: 80 });
    walkTo(t, 60);
    expect(t.ended).toEqual([]);
    walkTo(t, 90);
    expect(t.ended).toEqual(['distance']);
    const u = make();
    u.start({ leaveDistance: 10 });
    walkTo(u, 15);
    expect(u.ended).toEqual(['distance']);
  });
  it('arenaCentre measures the player to the centre, not the opponent', () => {
    const t = make();
    t.start({ arenaCentre: { x: 50, z: 0 }, leaveDistance: 80 });
    walkTo(t, 45); // 45 m from the opponent (over 30) but 5 m from the centre
    expect(t.ended).toEqual([]);
    walkTo(t, -35); // 85 m from the centre
    expect(t.ended).toEqual(['distance']);
  });
  it('arenaCentre defaults to the shipped 30 m', () => {
    const t = make();
    t.start({ arenaCentre: { x: 0, z: 0 } });
    walkTo(t, 25);
    expect(t.ended).toEqual([]);
    walkTo(t, 40);
    expect(t.ended).toEqual(['distance']);
  });
  it('setOpponentAirborne suspends the opponent rule, and clears when the trial ends', () => {
    const t = make();
    t.start();
    t.trials.setOpponentAirborne(true);
    walkTo(t, 60);
    expect(t.ended).toEqual([]);
    t.trials.setOpponentAirborne(false);
    t.tick(DT);
    expect(t.ended).toEqual(['distance']);
    // The flag does not leak into the next trial.
    const u = make();
    u.start();
    u.trials.setOpponentAirborne(true);
    u.trials.stop('t');
    u.ended.length = 0;
    u.feet.x = 0;
    u.start();
    walkTo(u, 40);
    expect(u.ended).toEqual(['distance']);
  });
  it('airborne does not suspend the arena-centre rule', () => {
    const t = make();
    t.start({ arenaCentre: { x: 0, z: 0 }, leaveDistance: 20 });
    t.trials.setOpponentAirborne(true);
    walkTo(t, 30);
    expect(t.ended).toEqual(['distance']);
  });
  it('setOpponentAirborne with no trial is a no-op', () => {
    expect(() => make().trials.setOpponentAirborne(true)).not.toThrow();
  });
});

describe('trial v2: outcome', () => {
  it('maps end reasons', () => {
    expect(trialOutcome('won')).toBe('won');
    expect(trialOutcome('yielded')).toBe('yielded');
    expect(trialOutcome('lost')).toBe('lost');
    for (const r of ['stopped', 'teleport', 'despawned', 'distance', 'loaded'] as const) expect(trialOutcome(r)).toBeNull();
  });
});

describe('trial v2: stunBoth', () => {
  it('stuns the player and the opponent through the status service', () => {
    const t = make();
    t.start();
    expect(t.trials.stunBoth(1.5)).toBe(true);
    expect(t.apply).toHaveBeenCalledTimes(2);
    expect(t.apply).toHaveBeenCalledWith(t.player.id, { id: 'trial.keeper-call', kind: 'stun', seconds: 1.5, sourceId: null });
    expect(t.apply).toHaveBeenCalledWith(t.opp.id, { id: 'trial.keeper-call', kind: 'stun', seconds: 1.5, sourceId: null });
  });
  it('is a no-op without a trial, with bad seconds, or without a status service', () => {
    const t = make();
    expect(t.trials.stunBoth(1)).toBe(false);
    t.start();
    for (const s of [0, -1, NaN, Infinity]) expect(t.trials.stunBoth(s)).toBe(false);
    expect(t.apply).not.toHaveBeenCalled();
    const u = make(false);
    u.start();
    expect(u.trials.stunBoth(1)).toBe(false);
  });
});
