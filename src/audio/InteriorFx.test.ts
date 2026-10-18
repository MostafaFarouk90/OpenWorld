import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_INTERIOR_PRESET, INTERIOR_PRESETS, InteriorFx, makeImpulse, presetFor } from './InteriorFx';

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
  buffer: unknown = null;
  connect = vi.fn();
  disconnect = vi.fn();
}

function env() {
  const bus = new FakeNode();
  const dest = new FakeNode();
  const ctx = {
    currentTime: 1,
    sampleRate: 8000,
    createGain: () => new FakeNode() as unknown as GainNode,
    createConvolver: () => new FakeNode() as unknown as ConvolverNode,
    createBuffer: vi.fn((_c: number, len: number) => ({ length: len, copyToChannel: vi.fn() }) as unknown as AudioBuffer),
  };
  const fx = InteriorFx.create(ctx, bus as unknown as GainNode, dest as unknown as AudioNode)!;
  return { bus, dest, ctx, fx };
}

describe('InteriorFx', () => {
  it('is null without a bus or destination (headless), and null if node creation throws', () => {
    const ctx = { currentTime: 0, sampleRate: 8000, createGain: () => new FakeNode() as unknown as GainNode, createConvolver: () => new FakeNode() as unknown as ConvolverNode, createBuffer: vi.fn() };
    expect(InteriorFx.create(ctx, null, new FakeNode() as unknown as AudioNode)).toBeNull();
    expect(InteriorFx.create(ctx, new FakeNode() as unknown as GainNode, null)).toBeNull();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const bad = { ...ctx, createConvolver: () => { throw new Error('no'); } };
    expect(InteriorFx.create(bad, new FakeNode() as unknown as GainNode, new FakeNode() as unknown as AudioNode)).toBeNull();
    vi.restoreAllMocks();
  });

  it('entering ducks the bus and opens the wet path over 0.4 s; exiting restores both', () => {
    const { bus, fx } = env();
    fx.setInterior('chapel-vault');
    const p = INTERIOR_PRESETS['chapel-vault'];
    expect(bus.gain.ramps.at(-1)).toEqual({ to: p.duck, at: 1.4 });
    fx.setInterior(null);
    expect(bus.gain.ramps.at(-1)).toEqual({ to: 1, at: 1.4 });
    expect(fx.interiorId).toBeNull();
  });

  it('is one slot: the same id again is a no-op, enter, enter, exit gives dry', () => {
    const { bus, fx } = env();
    fx.setInterior('chapel-vault');
    const n = bus.gain.ramps.length;
    fx.setInterior('chapel-vault');
    expect(bus.gain.ramps.length).toBe(n);
    fx.setInterior(null);
    expect(fx.interiorId).toBeNull();
    expect(bus.gain.ramps.at(-1)!.to).toBe(1);
  });

  it('exit while dry is a no-op', () => {
    const { bus, fx } = env();
    fx.setInterior(null);
    expect(bus.gain.ramps).toHaveLength(0);
  });

  it('moving straight from one interior to another switches presets', () => {
    const { bus, fx } = env();
    fx.setInterior('chapel-vault');
    fx.setInterior('underways');
    expect(bus.gain.ramps.at(-1)!.to).toBe(INTERIOR_PRESETS.underways.duck);
    expect(fx.interiorId).toBe('underways');
  });

  it('an unknown interior id uses the default preset', () => {
    expect(presetFor('somewhere-new')).toBe(DEFAULT_INTERIOR_PRESET);
    expect(presetFor('constructor')).toBe(DEFAULT_INTERIOR_PRESET);
    const { bus, fx } = env();
    fx.setInterior('somewhere-new');
    expect(bus.gain.ramps.at(-1)!.to).toBe(DEFAULT_INTERIOR_PRESET.duck);
  });

  it('every real interior id has a preset', () => {
    for (const id of ['chapel-vault', 'tilted-anvil', 'keep-hall', 'counting-house', 'archive', 'underways']) {
      expect(INTERIOR_PRESETS[id]).toBeDefined();
    }
  });

  it('builds each impulse once per distinct shape', () => {
    const { ctx, fx } = env();
    fx.setInterior('chapel-vault');
    fx.setInterior(null);
    fx.setInterior('chapel-vault');
    expect(ctx.createBuffer).toHaveBeenCalledTimes(1);
  });

  it('dispose restores the bus immediately and ignores later calls', () => {
    const { bus, fx } = env();
    fx.setInterior('underways');
    fx.dispose();
    expect(bus.gain.ramps.at(-1)).toEqual({ to: 1, at: 1 });
    const n = bus.gain.ramps.length;
    fx.setInterior('chapel-vault');
    fx.dispose();
    expect(bus.gain.ramps.length).toBe(n);
  });
});

describe('makeImpulse', () => {
  it('is deterministic, finite, decays and has the requested length', () => {
    const a = makeImpulse(8000, 1, 0.5);
    const b = makeImpulse(8000, 1, 0.5);
    expect(a.length).toBe(8000);
    expect(Array.from(a.slice(0, 50))).toEqual(Array.from(b.slice(0, 50)));
    expect(a.every(Number.isFinite)).toBe(true);
    const rms = (from: number, to: number): number => Math.sqrt(a.slice(from, to).reduce((s, x) => s + x * x, 0) / (to - from));
    expect(rms(4000, 4800)).toBeLessThan(rms(100, 900));
    expect(Math.abs(a[a.length - 1])).toBeLessThan(0.01);
  });

  it('a degenerate length still returns one sample', () => {
    expect(makeImpulse(8000, 0, 0.5)).toHaveLength(1);
  });
});
