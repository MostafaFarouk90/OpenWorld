import { describe, expect, it } from 'vitest';
import { CALM_BEATS, CALM_SECONDS, HATHREN, HathrenSequence, WAKE_BEATS, type HathrenBeat } from './sequence';

const DT = 1 / 60;

function run(seq: HathrenSequence, seconds: number): HathrenBeat[] {
  const out: HathrenBeat[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i++) out.push(...seq.step(DT));
  return out;
}

describe("Hathren's sequence (K6a, M26)", () => {
  it('waits under the water in the nets until the player comes within 60 m, then wakes once and loops', () => {
    const s = new HathrenSequence();
    s.enterNets();
    expect(s.state).toBe('nets');
    expect(s.phase).toBe('waiting');
    expect(run(s, 5)).toEqual([]);
    s.playerDistance(80);
    expect(s.phase).toBe('waiting');
    s.playerDistance(HATHREN.wakeRadius);
    expect(s.phase).toBe('waking');
    const wake = run(s, HATHREN.wakeSeconds + DT);
    expect(wake.slice(0, WAKE_BEATS.length)).toEqual(WAKE_BEATS.map((b) => b.beat));
    expect(s.phase).toBe('loop');
    s.playerDistance(10); // already awake: no second wake
    const loop = run(s, 30);
    expect(loop).not.toContain('wake');
    expect(loop.filter((b) => b === 'thrash').length).toBeGreaterThanOrEqual(4);
    expect(loop).toContain('spray');
  });

  it('the wake is skipped when a net was already cut (a reload after waking)', () => {
    const s = new HathrenSequence();
    s.enterNets([2]);
    expect(s.phase).toBe('loop');
    expect([...s.netsCut]).toEqual([2]);
  });

  it('each cut net drops once, eases the thrash, and bad or repeated cuts are refused', () => {
    const s = new HathrenSequence();
    expect(s.netCut(1)).toBe(false); // not in the nets
    s.enterNets([]);
    expect(s.netCut(1)).toBe(true);
    expect(s.netCut(1)).toBe(false);
    expect(s.netCut(0)).toBe(false);
    expect(s.netCut(5)).toBe(false);
    expect(s.netCut(2.5)).toBe(false);
    expect(s.step(DT)).toContain('netDropped');
    const tight = new HathrenSequence();
    tight.enterNets([1]);
    const loose = new HathrenSequence();
    loose.enterNets([1, 2, 3, 4]);
    expect(loose.ease).toBeGreaterThan(tight.ease);
    expect(run(loose, 60).filter((b) => b === 'thrash').length).toBeLessThan(run(tight, 60).filter((b) => b === 'thrash').length);
  });

  it('the calm fires its beats in order at their times, ends gone, and stays under 40 s', () => {
    const s = new HathrenSequence();
    s.enterNets([1, 2, 3, 4]);
    expect(s.calm()).toBe(true);
    expect(s.calm()).toBe(false);
    const times: Array<[HathrenBeat, number]> = [];
    let t = 0;
    while (s.state === 'calming' && t < 60) {
      for (const b of s.step(DT)) times.push([b, t + DT]);
      t += DT;
    }
    expect(times.map((x) => x[0])).toEqual(CALM_BEATS.map((b) => b.beat));
    for (const [i, [, at]] of times.entries()) expect(at).toBeGreaterThanOrEqual(CALM_BEATS[i]!.at - 1e-6);
    expect(s.state).toBe('gone');
    expect(CALM_SECONDS).toBeLessThanOrEqual(40);
    expect(s.calm()).toBe(false);
    expect(s.netCut(1)).toBe(false);
  });

  it('calm works from absent and from the waiting nets (nothing waits on an earlier beat)', () => {
    const a = new HathrenSequence();
    expect(a.calm()).toBe(true);
    expect(a.step(DT)).toEqual(['rise']);
    const b = new HathrenSequence();
    b.enterNets();
    expect(b.calm()).toBe(true);
    expect(run(b, CALM_SECONDS + 1)).toEqual(CALM_BEATS.map((x) => x.beat));
  });

  it('skip fires every remaining beat once, in order; skip outside the calm does nothing', () => {
    const s = new HathrenSequence();
    expect(s.skip()).toEqual([]);
    s.calm();
    run(s, 8);
    expect(s.skip()).toEqual(['quiet', 'dive', 'scale', 'gone']);
    expect(s.skip()).toEqual([]);
    expect(s.state).toBe('gone');
  });

  it('a reload mid-calm (reset, then enterNets with the saved cuts) restarts from the nets; calm plays again in full', () => {
    const s = new HathrenSequence();
    s.enterNets([1, 2, 3, 4]);
    s.calm();
    run(s, 15);
    s.reset();
    expect(s.state).toBe('absent');
    s.enterNets([1, 2, 3, 4]);
    expect(s.state).toBe('nets');
    expect(s.calm()).toBe(true);
    expect(run(s, CALM_SECONDS + 1)).toEqual(CALM_BEATS.map((x) => x.beat));
  });

  it('dismiss is silent and final; reset brings her back to absent', () => {
    const s = new HathrenSequence();
    s.enterNets();
    s.netCut(3);
    s.dismiss();
    expect(s.state).toBe('gone');
    expect(s.step(DT)).toEqual([]);
    s.enterNets();
    expect(s.state).toBe('gone');
    s.reset();
    s.enterNets();
    expect(s.state).toBe('nets');
  });

  it('non-finite or negative steps advance nothing', () => {
    const s = new HathrenSequence();
    s.calm();
    s.step(DT);
    s.step(NaN);
    s.step(-1);
    expect(s.time).toBeCloseTo(DT, 9);
  });
});
