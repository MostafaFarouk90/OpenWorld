import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUDIO } from '../config/constants';
import { StemMixer } from './StemMixer';

type Call = [string, ...number[]];

class FakeParam {
  value = 0;
  calls: Call[] = [];
  cancelScheduledValues(t: number): void {
    this.calls.push(['cancel', t]);
  }
  setValueAtTime(v: number, t: number): void {
    this.calls.push(['set', v, t]);
  }
  linearRampToValueAtTime(v: number, t: number): void {
    this.calls.push(['ramp', v, t]);
  }
}

class FakeGain {
  gain = new FakeParam();
  connect = vi.fn();
  disconnect = vi.fn();
}

class FakeSource {
  buffer: unknown = null;
  loop = false;
  connect = vi.fn();
  disconnect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}

class FakeContext {
  currentTime = 0;
  state = 'running';
  gains: FakeGain[] = [];
  sources: FakeSource[] = [];
  decodeAudioData = vi.fn(async (_data: ArrayBuffer) => ({ decoded: true }) as unknown as AudioBuffer);
  createGain(): FakeGain {
    const g = new FakeGain();
    this.gains.push(g);
    return g;
  }
  createBufferSource(): FakeSource {
    const s = new FakeSource();
    this.sources.push(s);
    return s;
  }
}

const buf = (name: string): AudioBuffer => ({ name }) as unknown as AudioBuffer;

let ctx: FakeContext;
let mixer: StemMixer;
const dest = {} as AudioNode;

// Gain node of the n-th added stem (creation order).
const param = (n: number): FakeParam => ctx.gains[n].gain;

beforeEach(() => {
  ctx = new FakeContext();
  mixer = new StemMixer(ctx as unknown as AudioContext, dest);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('StemMixer.setMix', () => {
  beforeEach(async () => {
    await mixer.add('a', buf('a'));
    await mixer.add('b', buf('b'));
  });

  it('schedules cancel, hold current value, then linear ramp over the default crossfade', () => {
    ctx.currentTime = 10;
    param(0).value = 0.25;
    mixer.setMix({ a: 1 });
    expect(param(0).calls).toEqual([
      ['cancel', 10],
      ['set', 0.25, 10],
      ['ramp', 1, 10 + AUDIO.stemCrossfadeSeconds],
    ]);
    expect(AUDIO.stemCrossfadeSeconds).toBe(0.4);
  });

  it('honours a custom ramp duration', () => {
    ctx.currentTime = 2;
    mixer.setMix({ a: 0.5 }, 1.5);
    expect(param(0).calls.at(-1)).toEqual(['ramp', 0.5, 3.5]);
  });

  it('ignores unknown stem ids without throwing and leaves unnamed stems untouched', () => {
    expect(() => mixer.setMix({ nope: 1, a: 1 })).not.toThrow();
    expect(param(0).calls).toHaveLength(3);
    expect(param(1).calls).toHaveLength(0);
  });

  it('starts an interrupted ramp from the current param value, not a jump', () => {
    ctx.currentTime = 1;
    mixer.setMix({ a: 1 });
    param(0).value = 0.6; // mid-ramp
    ctx.currentTime = 1.2;
    mixer.setMix({ a: 0 });
    const calls = param(0).calls.slice(3);
    expect(calls).toEqual([
      ['cancel', 1.2],
      ['set', 0.6, 1.2],
      ['ramp', 0, 1.2 + 0.4],
    ]);
  });
});

describe('StemMixer.start / stop', () => {
  beforeEach(async () => {
    await mixer.add('a', buf('a'));
    await mixer.add('b', buf('b'));
  });

  it('starts all stems at the same time, looping, with initial gains from the mix', () => {
    ctx.currentTime = 5;
    mixer.start({ a: 0.7 }, 0.1);
    expect(ctx.sources).toHaveLength(2);
    for (const s of ctx.sources) {
      expect(s.start).toHaveBeenCalledTimes(1);
      expect(s.start.mock.calls[0][0]).toBeCloseTo(5.1, 10);
      expect(s.loop).toBe(true);
    }
    expect(ctx.sources[0].buffer).toEqual(buf('a'));
    expect(ctx.sources[1].buffer).toEqual(buf('b'));
    expect(ctx.sources[0].connect).toHaveBeenCalledWith(ctx.gains[0]);
    const initial = (n: number) => param(n).calls.find((c) => c[0] === 'set');
    expect(initial(0)?.[1]).toBe(0.7);
    expect(initial(1)?.[1]).toBe(0);
    expect(initial(0)?.[2]).toBeCloseTo(5.1, 10);
  });

  it('is a no-op on a second start and reports isPlaying', () => {
    expect(mixer.isPlaying).toBe(false);
    mixer.start();
    expect(mixer.isPlaying).toBe(true);
    mixer.start({ a: 1 });
    expect(ctx.sources).toHaveLength(2);
  });

  it('stop() stops and disconnects every source and can be restarted', () => {
    mixer.start();
    const first = [...ctx.sources];
    mixer.stop();
    expect(mixer.isPlaying).toBe(false);
    for (const s of first) {
      expect(s.stop).toHaveBeenCalledTimes(1);
      expect(s.disconnect).toHaveBeenCalledTimes(1);
    }
    mixer.start();
    expect(mixer.isPlaying).toBe(true);
    expect(ctx.sources).toHaveLength(4);
    expect(ctx.sources[2].start).toHaveBeenCalledTimes(1);
  });

  it('stop() before start() does not throw', () => {
    expect(() => mixer.stop()).not.toThrow();
    expect(mixer.isPlaying).toBe(false);
  });

  it('start() on a suspended context does not throw and schedules from the paused clock', () => {
    ctx.state = 'suspended';
    ctx.currentTime = 0;
    expect(() => mixer.start({ a: 1 }, 0.05)).not.toThrow();
    expect(ctx.sources[0].start.mock.calls[0][0]).toBeCloseTo(0.05, 10);
    expect(mixer.isPlaying).toBe(true);
  });
});

describe('StemMixer.add', () => {
  function stubFetch(response: Partial<Response>): ReturnType<typeof vi.fn> {
    const fetchMock = vi.fn(async () => response as Response);
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('fetches and decodes a URL, and start() then plays the stem', async () => {
    const fetchMock = stubFetch({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(8) });
    await mixer.add('drums', '/audio/drums.ogg');
    expect(fetchMock).toHaveBeenCalledWith('/audio/drums.ogg');
    expect(ctx.decodeAudioData).toHaveBeenCalledTimes(1);
    mixer.start();
    expect(ctx.sources).toHaveLength(1);
    expect(ctx.sources[0].buffer).toEqual({ decoded: true });
  });

  it('rejects with the stem id and HTTP status on a non-ok response and does not add the stem', async () => {
    stubFetch({ ok: false, status: 404 });
    await expect(mixer.add('bass', '/missing.ogg')).rejects.toThrow(/bass.*404/);
    expect(ctx.decodeAudioData).not.toHaveBeenCalled();
    mixer.start();
    expect(ctx.sources).toHaveLength(0);
  });

  it('rejects with the stem id and "decode" when decoding fails and does not add the stem', async () => {
    stubFetch({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(8) });
    ctx.decodeAudioData.mockRejectedValueOnce(new Error('bad data'));
    await expect(mixer.add('lead', '/lead.ogg')).rejects.toThrow(/lead.*decode/);
    mixer.start();
    expect(ctx.sources).toHaveLength(0);
  });

  it('rejects when fetch itself fails (network error) and does not add the stem', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('offline'))));
    await expect(mixer.add('pad', '/pad.ogg')).rejects.toThrow('offline');
    mixer.start();
    expect(ctx.sources).toHaveLength(0);
  });

  it('rejects a duplicate id and keeps the original stem', async () => {
    await mixer.add('a', buf('a'));
    await expect(mixer.add('a', buf('other'))).rejects.toThrow(/already added/);
    mixer.start();
    expect(ctx.sources).toHaveLength(1);
    expect(ctx.sources[0].buffer).toEqual(buf('a'));
  });

  it('rejects a concurrent add of the same id while the first is still fetching', async () => {
    let finish!: () => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            finish = () => resolve({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(8) } as Response);
          }),
      ),
    );
    const first = mixer.add('a', '/a.ogg');
    await expect(mixer.add('a', buf('other'))).rejects.toThrow(/already added/);
    finish();
    await first;
    mixer.start();
    expect(ctx.sources).toHaveLength(1);
    expect(ctx.sources[0].buffer).toEqual({ decoded: true });
  });

  it('allows adding the same id again after a failed add', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 }) as Response));
    await expect(mixer.add('a', '/a.ogg')).rejects.toThrow(/500/);
    await mixer.add('a', buf('a'));
    mixer.start();
    expect(ctx.sources).toHaveLength(1);
    expect(ctx.sources[0].buffer).toEqual(buf('a'));
  });

  it('allows a retry after a failed decode', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(1) }) as Response));
    ctx.decodeAudioData.mockRejectedValueOnce(new Error('bad'));
    await expect(mixer.add('a', '/a.ogg')).rejects.toThrow(/decode/);
    await expect(mixer.add('a', '/a.ogg')).resolves.toBeUndefined();
  });
});

describe('StemMixer.dispose', () => {
  it('stops sources, disconnects every stem gain and leaves no stems', async () => {
    await mixer.add('a', buf('a'));
    await mixer.add('b', buf('b'));
    mixer.start();
    const sources = [...ctx.sources];
    mixer.dispose();
    expect(mixer.isPlaying).toBe(false);
    for (const s of sources) {
      expect(s.stop).toHaveBeenCalledTimes(1);
      expect(s.disconnect).toHaveBeenCalledTimes(1);
    }
    for (const g of ctx.gains) expect(g.disconnect).toHaveBeenCalledTimes(1);
    mixer.start();
    expect(ctx.sources).toHaveLength(2);
    mixer.setMix({ a: 1 });
    expect(param(0).calls.some((c) => c[0] === 'ramp')).toBe(false);
  });

  it('is safe on an empty mixer and when called twice', () => {
    expect(() => {
      mixer.dispose();
      mixer.dispose();
    }).not.toThrow();
  });

  it('allows re-adding an id after dispose', async () => {
    await mixer.add('a', buf('a'));
    mixer.dispose();
    await expect(mixer.add('a', buf('a'))).resolves.toBeUndefined();
  });
});
