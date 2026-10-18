import { afterEach, describe, expect, it, vi } from 'vitest';
import { AmbienceBed, makeBedSamples, type BedId } from './AmbienceBed';

class FakeParam {
  value: number;
  ramps: Array<{ to: number; at: number }> = [];
  constructor(v: number) {
    this.value = v;
  }
  cancelScheduledValues = vi.fn();
  setValueAtTime = vi.fn();
  linearRampToValueAtTime = vi.fn((to: number, at: number) => {
    this.ramps.push({ to, at });
    this.value = to;
  });
}
class FakeNode {
  gain = new FakeParam(1);
  frequency = new FakeParam(350);
  type = '';
  buffer: unknown = null;
  loop = false;
  connect = vi.fn();
  disconnect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}

function env() {
  const dest = new FakeNode();
  const gains: FakeNode[] = [];
  const sources: FakeNode[] = [];
  const filters: FakeNode[] = [];
  const ctx = {
    currentTime: 1,
    sampleRate: 8000,
    createGain: vi.fn(() => {
      const n = new FakeNode();
      gains.push(n);
      return n as unknown as GainNode;
    }),
    createBiquadFilter: vi.fn(() => {
      const n = new FakeNode();
      filters.push(n);
      return n as unknown as BiquadFilterNode;
    }),
    createBuffer: vi.fn((_c: number, len: number) => ({ length: len, copyToChannel: vi.fn() }) as unknown as AudioBuffer),
    createBufferSource: vi.fn(() => {
      const n = new FakeNode();
      sources.push(n);
      return n as unknown as AudioBufferSourceNode;
    }),
  };
  const bed = AmbienceBed.create(ctx, dest as unknown as AudioNode)!;
  // gains[0] is the shared bus; later gains are per-bed in creation order.
  return { dest, ctx, bed, gains, sources, filter: filters[0], bus: gains[0] };
}

afterEach(() => vi.restoreAllMocks());

describe('AmbienceBed', () => {
  it('is null without a destination, and null (warning) if node creation throws', () => {
    const { ctx } = env();
    expect(AmbienceBed.create(ctx, null)).toBeNull();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const bad = { ...ctx, createGain: () => { throw new Error('no'); } };
    expect(AmbienceBed.create(bad, new FakeNode() as unknown as AudioNode)).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('starts nothing until a bed is needed', () => {
    const { ctx, sources } = env();
    expect(ctx.createBuffer).not.toHaveBeenCalled();
    expect(sources).toHaveLength(0);
  });

  it('region crossfades over 2 s: the old bed to 0, the new bed to 1', () => {
    const { bed, gains, sources } = env();
    bed.setRegion('brightwater');
    expect(sources[0].loop).toBe(true);
    expect(sources[0].start).toHaveBeenCalledTimes(1);
    expect(gains[1].gain.ramps.at(-1)).toEqual({ to: 1, at: 3 });
    bed.setRegion('harrowmark');
    expect(gains[1].gain.ramps.at(-1)).toEqual({ to: 0, at: 3 });
    expect(gains[2].gain.ramps.at(-1)).toEqual({ to: 1, at: 3 });
    expect(gains[1].gain.cancelScheduledValues).toHaveBeenCalledWith(1);
    expect(gains[1].gain.setValueAtTime).toHaveBeenCalled();
    expect(bed.region).toBe('harrowmark');
  });

  it('beds feed the destination, not any other bus', () => {
    const { bed, dest, bus, filter } = env();
    bed.setRegion('brightwater');
    expect(bus.connect).toHaveBeenCalledWith(filter);
    expect(filter.connect).toHaveBeenCalledWith(dest);
  });

  it('corridor (null) fades the region bed to 0', () => {
    const { bed, gains } = env();
    bed.setRegion('brightwater');
    bed.setRegion(null);
    expect(gains[1].gain.ramps.at(-1)).toEqual({ to: 0, at: 3 });
    expect(bed.region).toBeNull();
  });

  it('the same value is a no-op', () => {
    const { bed, gains } = env();
    bed.setRegion('brightwater');
    const n = gains[1].gain.ramps.length;
    bed.setRegion('brightwater');
    bed.setInterior(null);
    expect(gains[1].gain.ramps.length).toBe(n);
  });

  it('an unknown region is silence with one warning per id', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { bed, sources } = env();
    bed.setRegion('mars');
    bed.setRegion(null);
    bed.setRegion('mars');
    expect(warn).toHaveBeenCalledTimes(1);
    bed.setRegion('venus');
    expect(warn).toHaveBeenCalledTimes(2);
    expect(sources).toHaveLength(0);
  });

  it('underways silences region beds, fades its own in, and leaving restores', () => {
    const { bed, gains, sources, dest } = env();
    bed.setRegion('harrowmark');
    bed.setInterior('underways');
    expect(gains[1].gain.ramps.at(-1)).toEqual({ to: 0, at: 1.4 });
    expect(gains[2].gain.ramps.at(-1)).toEqual({ to: 1, at: 1.4 });
    expect(gains[2].connect).toHaveBeenCalledWith(dest);
    expect(sources).toHaveLength(2);
    bed.setRegion('brightwater'); // region changes while below ground stay silent
    expect(gains[1].gain.ramps.at(-1)).toEqual({ to: 0, at: 1.4 });
    bed.setInterior(null);
    expect(gains[2].gain.ramps.at(-1)).toEqual({ to: 0, at: 1.4 });
    expect(bed.interior).toBeNull();
    // brightwater bed is created only now, when it is audible
    expect(sources).toHaveLength(3);
    expect(gains[3].gain.ramps.at(-1)).toEqual({ to: 1, at: 1.4 });
  });

  it('another interior low-passes the region bed at 0.4 gain, and exiting restores', () => {
    const { bed, bus, filter, gains } = env();
    bed.setRegion('harrowmark');
    bed.setInterior('tilted-anvil');
    expect(bus.gain.ramps.at(-1)).toEqual({ to: 0.4, at: 1.4 });
    expect(filter.frequency.ramps.at(-1)).toEqual({ to: 600, at: 1.4 });
    expect(gains[1].gain.ramps.at(-1)!.to).toBe(1);
    bed.setInterior(null);
    expect(bus.gain.ramps.at(-1)).toEqual({ to: 1, at: 1.4 });
    expect(filter.frequency.ramps.at(-1)!.to).toBe(20000);
  });

  it('builds each bed buffer once, only when first used', () => {
    const { bed, ctx } = env();
    bed.setRegion('brightwater');
    expect(ctx.createBuffer).toHaveBeenCalledTimes(1);
    bed.setRegion('harrowmark');
    bed.setRegion('brightwater');
    expect(ctx.createBuffer).toHaveBeenCalledTimes(2);
    bed.setInterior('underways');
    bed.setInterior(null);
    bed.setInterior('underways');
    expect(ctx.createBuffer).toHaveBeenCalledTimes(3);
  });

  it('dispose is idempotent, stops sources, and later calls do nothing', () => {
    const { bed, sources, gains, ctx } = env();
    bed.setRegion('brightwater');
    bed.dispose();
    bed.dispose();
    expect(sources[0].stop).toHaveBeenCalledTimes(1);
    expect(sources[0].disconnect).toHaveBeenCalled();
    const n = gains[1].gain.ramps.length;
    bed.setRegion('harrowmark');
    bed.setInterior('underways');
    expect(gains[1].gain.ramps.length).toBe(n);
    expect(ctx.createBuffer).toHaveBeenCalledTimes(1);
  });

  it('does not throw when a node method throws, and warns once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { bed, gains } = env();
    gains[0].gain.cancelScheduledValues.mockImplementation(() => {
      throw new Error('boom');
    });
    expect(() => bed.setInterior('tilted-anvil')).not.toThrow();
    expect(() => bed.setInterior(null)).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('makeBedSamples', () => {
  const ids: BedId[] = ['brightwater', 'harrowmark', 'underways'];
  const sr = 8000;
  const beds = Object.fromEntries(ids.map((id) => [id, makeBedSamples(id, sr)])) as Record<BedId, Float32Array>;

  it('is deterministic, 20 to 30 s of exact samples, finite and within [-1, 1]', () => {
    for (const id of ids) {
      const again = makeBedSamples(id, sr);
      expect(again).toEqual(beds[id]);
      expect(beds[id].length / sr).toBeGreaterThanOrEqual(20);
      expect(beds[id].length / sr).toBeLessThanOrEqual(30);
      expect(Number.isInteger(beds[id].length)).toBe(true);
      expect(beds[id].every((v) => Number.isFinite(v) && v >= -1 && v <= 1)).toBe(true);
    }
  });

  it('is not silent', () => {
    for (const id of ids) {
      const rms = Math.sqrt(beds[id].reduce((s, v) => s + v * v, 0) / beds[id].length);
      expect(rms).toBeGreaterThan(0.02);
    }
  });

  it('loops without a seam: the wrap step is no bigger than the typical step', () => {
    for (const id of ids) {
      const b = beds[id];
      const seam = Math.abs(b[0] - b[b.length - 1]);
      let maxStep = 0;
      for (let i = 1; i < b.length; i++) maxStep = Math.max(maxStep, Math.abs(b[i] - b[i - 1]));
      expect(seam).toBeLessThan(0.1);
      expect(seam).toBeLessThanOrEqual(maxStep + 1e-6);
    }
  });

  it('the three beds differ', () => {
    const head = (id: BedId) => Array.from(beds[id].slice(2000, 2200));
    expect(head('brightwater')).not.toEqual(head('harrowmark'));
    expect(head('harrowmark')).not.toEqual(head('underways'));
    expect(head('brightwater')).not.toEqual(head('underways'));
  });
});
