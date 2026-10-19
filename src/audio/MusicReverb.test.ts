import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_MUSIC_REVERB, MusicReverb, combFeedback } from './MusicReverb';

interface FakeParam {
  value: number;
  cancelScheduledValues: ReturnType<typeof vi.fn>;
  setValueAtTime: ReturnType<typeof vi.fn>;
  linearRampToValueAtTime: ReturnType<typeof vi.fn>;
}
interface FakeNode {
  kind: string;
  gain: FakeParam;
  delayTime: FakeParam;
  frequency: FakeParam;
  Q: FakeParam;
  type: string;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}

const param = (): FakeParam => ({ value: 0, cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() });
const node = (kind: string): FakeNode => ({ kind, gain: param(), delayTime: param(), frequency: param(), Q: param(), type: '', connect: vi.fn(), disconnect: vi.fn() });

function makeCtx() {
  const made: FakeNode[] = [];
  const make = (kind: string) => () => {
    const n = node(kind);
    made.push(n);
    return n;
  };
  return {
    made,
    ctx: {
      currentTime: 5,
      createGain: make('gain'),
      createDelay: make('delay'),
      createBiquadFilter: make('biquad'),
    } as never,
  };
}

describe('combFeedback', () => {
  it('falls 60 dB over the decay time and stays stable (< 1)', () => {
    const delay = 0.04;
    const g = combFeedback(delay, 1.5);
    expect(20 * Math.log10(g ** (1.5 / delay))).toBeCloseTo(-60, 3);
    expect(g).toBeLessThan(1);
    expect(g).toBeGreaterThan(0);
  });
});

describe('MusicReverb', () => {
  const setup = () => {
    const { ctx, made } = makeCtx();
    const bus = node('bus');
    const dest = node('dest');
    const reverb = MusicReverb.create(ctx, bus as never, dest as never)!;
    return { reverb, made, bus, dest };
  };

  it('is null without a bus or destination (headless)', () => {
    const { ctx } = makeCtx();
    expect(MusicReverb.create(ctx, null, node('d') as never)).toBeNull();
    expect(MusicReverb.create(ctx, node('b') as never, null)).toBeNull();
  });

  it('is null, and warns, when the context cannot build nodes', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const broken = { currentTime: 0, createGain: () => { throw new Error('no'); }, createDelay: () => node('delay'), createBiquadFilter: () => node('biquad') } as never;
    expect(MusicReverb.create(broken, node('b') as never, node('d') as never)).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('taps the bus, ends at the destination, and stays small: one delay line and damping filter per comb', () => {
    const { made, bus, dest } = setup();
    expect(bus.connect).toHaveBeenCalledTimes(1);
    const delays = made.filter((n) => n.kind === 'delay');
    expect(delays).toHaveLength(DEFAULT_MUSIC_REVERB.delays.length);
    expect(made.length).toBeLessThanOrEqual(22);
    expect(made.some((n) => n.connect.mock.calls.some((c) => c[0] === dest))).toBe(true);
  });

  it('every comb loop gain is a stable value below 1 and the delays are distinct', () => {
    const { made } = setup();
    const delays = made.filter((n) => n.kind === 'delay').map((n) => n.delayTime.value);
    expect(new Set(delays).size).toBe(delays.length);
    const feedbacks = made.filter((n) => n.kind === 'gain' && n.gain.value > 0.5 && n.gain.value < 1);
    expect(feedbacks.length).toBeGreaterThanOrEqual(delays.length);
    for (const f of feedbacks) expect(f.gain.value).toBeLessThan(0.97);
  });

  it('every in-loop and output low-pass is Butterworth or softer, so the loop gain cannot exceed the feedback', () => {
    // Web Audio low-pass Q is in dB: +0.5 made an earlier version ring and grow without bound.
    const { made } = setup();
    const lowpasses = made.filter((n) => n.kind === 'biquad' && n.type === 'lowpass');
    expect(lowpasses.length).toBeGreaterThanOrEqual(DEFAULT_MUSIC_REVERB.delays.length);
    for (const f of lowpasses) expect(f.Q.value).toBeLessThanOrEqual(-3.01);
  });

  it('keeps the bass out of the send with a high-pass', () => {
    const { made } = setup();
    const hp = made.find((n) => n.kind === 'biquad' && n.type === 'highpass')!;
    expect(hp.frequency.value).toBeGreaterThanOrEqual(200);
  });

  it('stays inside its CPU budget: no convolver, a fixed small graph, short delay lines', () => {
    // Measured at 0.2 to 3.5 ms of CPU per second of audio (offline render, headless Chromium). The
    // ceiling is structural so it cannot drift: the context given here has no createConvolver at all,
    // so a convolution of an impulse response would throw and the reverb would come back null.
    const { made } = setup();
    const ctxKeys = Object.keys(makeCtx().ctx as object);
    expect(ctxKeys).not.toContain('createConvolver');
    expect(made.some((n) => n.kind === 'convolver')).toBe(false);
    expect(made.length).toBeLessThanOrEqual(22);
    expect(made.filter((n) => n.kind === 'delay').length).toBeLessThanOrEqual(4);
    const totalDelay = made.filter((n) => n.kind === 'delay').reduce((sum, n) => sum + n.delayTime.value, 0);
    expect(totalDelay).toBeLessThanOrEqual(0.2); // seconds of delay line, a few thousand samples
    expect(DEFAULT_MUSIC_REVERB.decaySeconds).toBeLessThanOrEqual(2);
  });

  it('connects the bus last, so a failed build leaves the live bus alone', () => {
    const { ctx } = makeCtx();
    const bus = node('bus');
    let built = 0;
    const flaky = {
      currentTime: 0,
      createGain: () => node('gain'),
      createDelay: () => {
        if (++built > 2) throw new Error('no more delays');
        return node('delay');
      },
      createBiquadFilter: () => node('biquad'),
    } as never;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(MusicReverb.create(flaky, bus as never, node('dest') as never)).toBeNull();
    expect(bus.connect).not.toHaveBeenCalled();
    void ctx;
  });

  it('starts at the outdoor wet level, fades out indoors and back, and ignores repeats', () => {
    const { reverb, made } = setup();
    const out = made.find((n) => n.kind === 'gain' && n.gain.value === DEFAULT_MUSIC_REVERB.wet)!;
    reverb.setIndoors(true);
    reverb.setIndoors(true);
    expect(out.gain.linearRampToValueAtTime).toHaveBeenCalledTimes(1);
    expect(out.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, 5.4);
    reverb.setIndoors(false);
    expect(out.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(DEFAULT_MUSIC_REVERB.wet, 5.4);
  });

  it('dispose disconnects everything once and later calls do nothing', () => {
    const { reverb, made, bus } = setup();
    reverb.dispose();
    reverb.dispose();
    expect(bus.disconnect).toHaveBeenCalledTimes(1);
    for (const n of made) expect(n.disconnect).toHaveBeenCalled();
    const out = made.find((n) => n.kind === 'gain' && n.gain.value === DEFAULT_MUSIC_REVERB.wet)!;
    reverb.setIndoors(true);
    expect(out.gain.linearRampToValueAtTime).not.toHaveBeenCalled();
  });
});
