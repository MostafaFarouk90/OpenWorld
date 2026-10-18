import { describe, expect, it } from 'vitest';
import { BarClock } from './barClock';
import { HandoverMachine, planHandover } from './trackSwitch';

const clock = new BarClock(10, 40, 16); // 2.5 s bars, lines at 10, 12.5, 15, ...
const RAMP = 0.4;

describe('planHandover', () => {
  it('picks the first bar line at least a ramp and a tick ahead', () => {
    expect(planHandover(clock, 11, RAMP)).toBeCloseTo(12.5, 9);
  });

  it('rolls to the following bar when the next line is closer than the fade', () => {
    expect(planHandover(clock, 12.3, RAMP)).toBeCloseTo(15, 9);
    expect(planHandover(clock, 12.0, RAMP)).toBeCloseTo(15 - 2.5, 9); // 12.0 + 0.4167 <= 12.5
  });

  it('is exact when now plus the lead lands on a line', () => {
    expect(planHandover(clock, 12.5 - RAMP - 1 / 60, RAMP)).toBeCloseTo(12.5, 6);
  });

  it('before the clock start the first line is the start (if far enough ahead)', () => {
    expect(planHandover(clock, 5, RAMP)).toBe(10);
    expect(planHandover(clock, 9.8, RAMP)).toBeCloseTo(12.5, 9);
  });

  it('always lands on a bar line of the clock, far into the loop', () => {
    const at = planHandover(clock, 1234.56, RAMP);
    expect(((at - 10) / 2.5) % 1).toBeCloseTo(0, 6);
    expect(at).toBeGreaterThanOrEqual(1234.56 + RAMP);
  });
});

describe('HandoverMachine', () => {
  it('idle: requesting the active track does nothing', () => {
    const m = new HandoverMachine('a');
    expect(m.request('a')).toBe(false);
    expect(m.view().phase).toBe('idle');
  });

  it('loading: a request wants a load once; the same request again does not repeat it', () => {
    const m = new HandoverMachine('a');
    expect(m.request('b')).toBe(true);
    expect(m.request('b')).toBe(false);
    expect(m.view()).toMatchObject({ phase: 'loading', target: 'b' });
  });

  it('loading: last wins, and going back to the active track cancels', () => {
    const m = new HandoverMachine('a');
    m.request('b');
    expect(m.request('c')).toBe(true);
    expect(m.view().target).toBe('c');
    expect(m.request('a')).toBe(false);
    expect(m.view().phase).toBe('idle');
  });

  it('commit only works for the current target in loading', () => {
    const m = new HandoverMachine('a');
    m.request('b');
    expect(m.commit('c', 5)).toBe(false);
    expect(m.commit('b', 5)).toBe(true);
    expect(m.view()).toMatchObject({ phase: 'committed', target: 'b', at: 5 });
    expect(m.commit('b', 6)).toBe(false);
  });

  it('committed: a different request queues until the swap, then runs', () => {
    const m = new HandoverMachine('a');
    m.request('b');
    m.commit('b', 5);
    expect(m.request('a')).toBe(false); // straight back to Brightwater
    expect(m.view().queued).toBe('a');
    expect(m.view().target).toBe('b');
    expect(m.swap()).toBe('a');
    expect(m.activeTrack).toBe('b');
    expect(m.view()).toMatchObject({ phase: 'loading', target: 'a', queued: null });
  });

  it('committed: asking for the committed target again drops a queued request', () => {
    const m = new HandoverMachine('a');
    m.request('b');
    m.commit('b', 5);
    m.request('c');
    m.request('b');
    expect(m.view().queued).toBeNull();
    expect(m.swap()).toBeNull();
    expect(m.view().phase).toBe('idle');
  });

  it('committed: a queued request equal to the new active track needs no load', () => {
    const m = new HandoverMachine('a');
    m.request('b');
    m.commit('b', 5);
    m.request('b');
    expect(m.swap()).toBeNull();
    expect(m.activeTrack).toBe('b');
  });

  it('fail returns to idle on the old track and only for the current load', () => {
    const m = new HandoverMachine('a');
    m.request('b');
    m.fail('zzz');
    expect(m.view().phase).toBe('loading');
    m.fail('b');
    expect(m.view().phase).toBe('idle');
    expect(m.activeTrack).toBe('a');
  });

  it('swap outside committed is a no-op; reset clears everything but keeps or sets the active track', () => {
    const m = new HandoverMachine('a');
    expect(m.swap()).toBeNull();
    m.request('b');
    m.commit('b', 1);
    m.request('c');
    m.reset();
    expect(m.view()).toEqual({ phase: 'idle', target: null, queued: null, at: null });
    expect(m.activeTrack).toBe('a');
    m.reset('z');
    expect(m.activeTrack).toBe('z');
  });
});
