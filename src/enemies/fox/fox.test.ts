import { describe, expect, it, vi } from 'vitest';
import { FoxGuide } from './guide';
import { FOX } from './tuning';

const home = { x: 0, z: 0 };

describe('FoxGuide', () => {
  it('idles near home: stands and faces the player, walks back when it strays', () => {
    const g = new FoxGuide(home);
    expect(g.state).toBe('idle');
    const p = { x: 5, z: 5 };
    const near = g.step(0.1, { x: 1, z: 0 }, p, 2);
    expect(near).toEqual({ goal: null, speed: 0, face: p });
    const far = g.step(0.1, { x: FOX.wanderRadius + 2, z: 0 }, p, 2);
    expect(far.goal).toEqual(home);
    expect(far.speed).toBe(2);
    expect(g.step(0.1, { x: 0, z: 0 }, null, 2)).toEqual({ goal: null, speed: 0, face: null });
  });

  it('lead() with empty or non-finite stops returns false and stays idle', () => {
    const g = new FoxGuide(home);
    expect(g.lead([])).toBe(false);
    expect(g.lead([{ x: NaN, z: 0 }])).toBe(false);
    expect(g.lead([{ x: 1, z: 0 }, { x: 0, z: Infinity }])).toBe(false);
    expect(g.state).toBe('idle');
  });

  it('walks the stops in order, calls stop(i) once per stop and done() at the last', () => {
    const g = new FoxGuide(home);
    const stop = vi.fn();
    const done = vi.fn();
    const stops = [{ x: 10, z: 0 }, { x: 20, z: 0 }];
    expect(g.lead(stops, { stop, done })).toBe(true);
    expect(g.state).toBe('leading');
    const pos = { x: 0, z: 0 };
    const player = { x: 0, z: 0 };
    const s0 = g.step(0.1, pos, player, 5);
    expect(s0.goal).toEqual(stops[0]);
    expect(s0.speed).toBe(Math.min(5, FOX.leadSpeed));
    // Arrive at stop 0, player close: reports once and moves on.
    pos.x = 10;
    player.x = 9;
    g.step(0.1, pos, player, 5);
    g.step(0.1, pos, player, 5);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalledWith(0);
    expect(g.stopIndex).toBe(1);
    expect(done).not.toHaveBeenCalled();
    expect(g.step(0.1, pos, player, 5).goal).toEqual(stops[1]);
    pos.x = 20;
    player.x = 19;
    const last = g.step(0.1, pos, player, 5);
    expect(stop.mock.calls).toEqual([[0], [1]]);
    expect(done).toHaveBeenCalledTimes(1);
    expect(g.state).toBe('arrived');
    expect(last.goal).toBeNull();
    g.step(0.1, pos, player, 5);
    expect(stop).toHaveBeenCalledTimes(2);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('waits when the player lags beyond waitDistance', () => {
    const g = new FoxGuide(home);
    g.lead([{ x: 30, z: 0 }]);
    const s = g.step(0.1, { x: 0, z: 0 }, { x: -(FOX.waitDistance + 1), z: 0 }, 5);
    expect(s.goal).toBeNull();
    expect(s.speed).toBe(0);
    expect(g.step(0.1, { x: 0, z: 0 }, { x: -(FOX.waitDistance - 1), z: 0 }, 5).goal).not.toBeNull();
    // No player at all: waits too.
    expect(g.step(0.1, { x: 0, z: 0 }, null, 5).goal).toBeNull();
  });

  it('moves on from a stop only when the player is within followRadius', () => {
    const g = new FoxGuide(home);
    const stop = vi.fn();
    g.lead([{ x: 10, z: 0 }, { x: 20, z: 0 }], { stop });
    const pos = { x: 10, z: 0 };
    g.step(0.1, pos, { x: 10 - FOX.followRadius - 1, z: 0 }, 5);
    expect(g.stopIndex).toBe(0);
    g.step(0.1, pos, { x: 10 - FOX.followRadius - 1, z: 0 }, 5);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(g.stopIndex).toBe(0);
    g.step(0.1, pos, { x: 10 - FOX.followRadius + 1, z: 0 }, 5);
    expect(g.stopIndex).toBe(1);
  });

  it('stop() returns to idle and forgets the stops', () => {
    const g = new FoxGuide(home);
    g.lead([{ x: 10, z: 0 }]);
    g.stop();
    expect(g.state).toBe('idle');
    expect(g.stopIndex).toBe(0);
    expect(g.step(0.1, { x: 0, z: 0 }, { x: 5, z: 0 }, 2).goal).toBeNull();
  });

  it('the arrived state stands still, even far from home', () => {
    const g = new FoxGuide(home);
    g.lead([{ x: 10, z: 0 }]);
    g.step(0.1, { x: 10, z: 0 }, { x: 10, z: 0 }, 5);
    expect(g.state).toBe('arrived');
    const s = g.step(0.1, { x: 10, z: 0 }, { x: 11, z: 0 }, 5);
    expect(s.goal).toBeNull();
    expect(s.speed).toBe(0);
  });
});
