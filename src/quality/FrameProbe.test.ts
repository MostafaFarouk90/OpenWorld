import { describe, expect, it, vi } from 'vitest';
import { QualityManager } from './QualityManager';
import { FrameProbe, Governor, PROBE_GIVE_UP_FRAMES } from './FrameProbe';
import { PROBE } from '../vfx/tuning';

function run(probe: FrameProbe, ms: number, n = PROBE.warmupFrames + PROBE.sampleFrames) {
  for (let i = 0; i < n; i++) probe.sample(ms);
}
const mk = () => {
  const quality = new QualityManager({});
  return { quality, probe: new FrameProbe({ quality }) };
};

describe('FrameProbe', () => {
  it.each([
    [17.9, 'high'],
    [18, 'high'],
    [18.1, 'medium'],
    [28, 'medium'],
    [28.1, 'low'],
  ])('median %s ms -> %s', (ms, step) => {
    const { quality, probe } = mk();
    run(probe, ms);
    expect(probe.done).toBe(true);
    expect(quality.step).toBe(step);
    expect(quality.userChosen).toBe(false);
  });
  it('skips warm-up frames', () => {
    const { quality, probe } = mk();
    run(probe, 100, PROBE.warmupFrames);
    run(probe, 10, PROBE.sampleFrames);
    expect(quality.step).toBe('high');
  });
  it('ignores spikes above 250 ms, NaN, negative and zero', () => {
    const { quality, probe } = mk();
    run(probe, 10, PROBE.warmupFrames);
    for (const bad of [300, NaN, -5, 0, Infinity]) for (let i = 0; i < 50; i++) probe.sample(bad);
    expect(probe.done).toBe(false);
    run(probe, 10, PROBE.sampleFrames);
    expect(quality.step).toBe('high');
  });
  it('frozen clock does nothing and gives up after 6000 frames', () => {
    const { quality, probe } = mk();
    const set = vi.spyOn(quality, 'set');
    for (let i = 0; i < PROBE_GIVE_UP_FRAMES - 1; i++) probe.sample(0);
    expect(probe.done).toBe(false);
    probe.sample(0);
    expect(probe.done).toBe(true);
    expect(set).not.toHaveBeenCalled();
    expect(quality.step).toBe('medium');
  });
  it('never overrides a user choice', () => {
    const quality = new QualityManager({});
    quality.set('low', 'user');
    const probe = new FrameProbe({ quality });
    run(probe, 5);
    expect(quality.step).toBe('low');
    expect(probe.done).toBe(true);
  });
  it('runs once', () => {
    const { quality, probe } = mk();
    run(probe, 10);
    quality.set('low', 'governor');
    run(probe, 10);
    expect(quality.step).toBe('low');
  });
});

describe('Governor', () => {
  function feed(g: Governor, ms: number, from: number, to: number, dt = 0.1) {
    for (let t = from; t <= to + 1e-9; t += dt) g.sample(ms, t);
  }
  it('drops one step on a 5 s average above 33 ms, never below low', () => {
    const quality = new QualityManager({});
    quality.set('high', 'probe');
    const g = new Governor({ quality });
    feed(g, 40, 0, 5.2);
    expect(quality.step).toBe('medium');
    feed(g, 40, 5.3, 11);
    expect(quality.step).toBe('low');
    feed(g, 40, 11, 30);
    expect(quality.step).toBe('low');
  });
  it('does not drop before a full window', () => {
    const quality = new QualityManager({});
    const g = new Governor({ quality });
    feed(g, 60, 0, 3);
    expect(quality.step).toBe('medium');
  });
  it('an isolated spike does not drop', () => {
    const quality = new QualityManager({});
    const g = new Governor({ quality });
    feed(g, 16, 0, 4.9);
    g.sample(240, 5);
    feed(g, 16, 5.1, 8);
    expect(quality.step).toBe('medium');
  });
  it('never changes anything when user chose', () => {
    const quality = new QualityManager({});
    quality.set('medium', 'user');
    const offer = vi.fn();
    const g = new Governor({ quality, onOfferRaise: offer });
    feed(g, 60, 0, 20);
    feed(g, 10, 20, 200, 0.5);
    expect(quality.step).toBe('medium');
    expect(offer).not.toHaveBeenCalled();
  });
  it('offers a raise after 60 s stable and applies only on accept', () => {
    const quality = new QualityManager({});
    const offer = vi.fn();
    const g = new Governor({ quality, onOfferRaise: offer });
    feed(g, 12, 0, 64, 0.2);
    expect(offer).not.toHaveBeenCalled();
    feed(g, 12, 64, 70, 0.2);
    expect(offer).toHaveBeenCalledTimes(1);
    expect(offer).toHaveBeenCalledWith('high');
    expect(quality.step).toBe('medium');
    expect(g.acceptRaise()).toBe(true);
    expect(quality.step).toBe('high');
  });
  it('a slow stretch resets the stable timer', () => {
    const quality = new QualityManager({});
    const offer = vi.fn();
    const g = new Governor({ quality, onOfferRaise: offer });
    feed(g, 12, 0, 40, 0.2);
    feed(g, 25, 40.2, 50, 0.2);
    feed(g, 12, 50.2, 100, 0.2);
    expect(offer).not.toHaveBeenCalled();
  });
  it('does not offer above high', () => {
    const quality = new QualityManager({});
    quality.set('high', 'probe');
    const offer = vi.fn();
    const g = new Governor({ quality, onOfferRaise: offer });
    feed(g, 10, 0, 100, 0.5);
    expect(offer).not.toHaveBeenCalled();
  });
});
