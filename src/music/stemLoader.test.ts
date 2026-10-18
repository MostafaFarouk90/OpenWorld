import { afterEach, describe, expect, it, vi } from 'vitest';
import { conformBuffer, loadTrackStems, type StemLoaderContext } from './stemLoader';
import { BARLEY_AND_BRAZIER, loopSamples, type TrackDef } from './tracks';

const SR = 8000;
const L = loopSamples(BARLEY_AND_BRAZIER, SR);

class FakeBuffer {
  readonly data: Float32Array[];
  constructor(
    readonly numberOfChannels: number,
    readonly length: number,
    readonly sampleRate: number,
  ) {
    this.data = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }
  getChannelData(c: number): Float32Array {
    return this.data[c];
  }
  copyToChannel(src: Float32Array, c: number): void {
    this.data[c].set(src);
  }
}

/** Decode behaviour is keyed by the ArrayBuffer handed out by the fake fetch. */
function makeCtx(): { ctx: StemLoaderContext; payloads: WeakMap<ArrayBuffer, { frames?: number; reject?: boolean }> } {
  const payloads = new WeakMap<ArrayBuffer, { frames?: number; reject?: boolean }>();
  const ctx: StemLoaderContext = {
    sampleRate: SR,
    createBuffer: (ch, len, sr) => new FakeBuffer(ch, len, sr) as unknown as AudioBuffer,
    decodeAudioData: async (data) => {
      const p = payloads.get(data);
      if (!p || p.reject) throw new Error('decode failed');
      const b = new FakeBuffer(1, p.frames ?? L, SR);
      b.data[0].fill(0.5);
      return b as unknown as AudioBuffer;
    },
  };
  return { ctx, payloads };
}

type Spec = { frames?: number; status?: number; throws?: boolean; reject?: boolean };

function setup(specs: Record<string, Spec>) {
  const { ctx, payloads } = makeCtx();
  const fetchImpl = async (url: string): Promise<Response> => {
    const stem = /\/([^/]+)\.ogg$/.exec(url)![1];
    const s = specs[stem];
    if (!s) return { ok: false, status: 404 } as Response;
    if (s.throws) throw new TypeError('network');
    if (s.status) return { ok: false, status: s.status } as Response;
    const ab = new ArrayBuffer(8);
    payloads.set(ab, { frames: s.frames, reject: s.reject });
    return { ok: true, status: 200, arrayBuffer: async () => ab } as Response;
  };
  return { ctx, fetchImpl, yieldToMain: async () => {} };
}

const allGood = (): Record<string, Spec> => Object.fromEntries(BARLEY_AND_BRAZIER.stems.map((s) => [s, {}]));

afterEach(() => vi.restoreAllMocks());

describe('loadTrackStems', () => {
  it('uses every recorded stem when all are present and exact', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { ctx, fetchImpl, yieldToMain } = setup(allGood());
    const r = await loadTrackStems(ctx, BARLEY_AND_BRAZIER, { fetchImpl, yieldToMain });
    expect(Object.values(r.sources)).toEqual(BARLEY_AND_BRAZIER.stems.map(() => 'recorded'));
    expect(r.failed).toEqual([]);
    expect(r.buffers.size).toBe(7);
    for (const b of r.buffers.values()) expect(b.length).toBe(L);
    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('requests <baseUrl>/<stem>.ogg', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const { ctx, yieldToMain } = setup({});
    const urls: string[] = [];
    await loadTrackStems(ctx, BARLEY_AND_BRAZIER, {
      baseUrl: '/x',
      yieldToMain,
      fetchImpl: async (u) => {
        urls.push(u);
        return { ok: false } as Response;
      },
    });
    expect(urls.sort()).toEqual([...BARLEY_AND_BRAZIER.stems].sort().map((s) => `/x/${s}.ogg`));
  });

  it('falls back only for a 404 stem', async () => {
    const specs = allGood();
    delete specs.hat;
    const { ctx, fetchImpl, yieldToMain } = setup(specs);
    const r = await loadTrackStems(ctx, BARLEY_AND_BRAZIER, { fetchImpl, yieldToMain });
    expect(r.sources.hat).toBe('procedural');
    for (const s of BARLEY_AND_BRAZIER.stems.filter((s) => s !== 'hat')) expect(r.sources[s]).toBe('recorded');
    expect(r.buffers.get('hat')!.length).toBe(L);
  });

  it('falls back when fetch throws', async () => {
    const specs = allGood();
    specs.bass = { throws: true };
    const { ctx, fetchImpl, yieldToMain } = setup(specs);
    const r = await loadTrackStems(ctx, BARLEY_AND_BRAZIER, { fetchImpl, yieldToMain });
    expect(r.sources.bass).toBe('procedural');
    expect(r.sources.kick).toBe('recorded');
  });

  it('falls back when decode rejects', async () => {
    const specs = allGood();
    specs.vocal = { reject: true };
    const { ctx, fetchImpl, yieldToMain } = setup(specs);
    const r = await loadTrackStems(ctx, BARLEY_AND_BRAZIER, { fetchImpl, yieldToMain });
    expect(r.sources.vocal).toBe('procedural');
    expect(r.sources.melody).toBe('recorded');
  });

  it.each([-1, 1, -2, 2])('conforms a recording %i frames off to exactly L', async (delta) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const specs = allGood();
    specs.kick = { frames: L + delta };
    const { ctx, fetchImpl, yieldToMain } = setup(specs);
    const r = await loadTrackStems(ctx, BARLEY_AND_BRAZIER, { fetchImpl, yieldToMain });
    expect(r.sources.kick).toBe('recorded');
    const b = r.buffers.get('kick')!;
    expect(b.length).toBe(L);
    expect(b.getChannelData(0).length).toBe(L);
    if (delta < 0) {
      expect(b.getChannelData(0)[L + delta - 1]).toBe(0.5);
      expect(b.getChannelData(0)[L - 1]).toBe(0);
    } else {
      expect(b.getChannelData(0)[L - 1]).toBe(0.5);
    }
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([5, -5])('rejects a recording %i frames off with console.warn', async (delta) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const specs = allGood();
    specs.snare = { frames: L + delta };
    const { ctx, fetchImpl, yieldToMain } = setup(specs);
    const r = await loadTrackStems(ctx, BARLEY_AND_BRAZIER, { fetchImpl, yieldToMain });
    expect(r.sources.snare).toBe('procedural');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('snare');
  });

  it('all stems missing: all procedural, single console.info', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const { ctx, fetchImpl, yieldToMain } = setup({});
    const r = await loadTrackStems(ctx, BARLEY_AND_BRAZIER, { fetchImpl, yieldToMain });
    expect(Object.values(r.sources).every((s) => s === 'procedural')).toBe(true);
    expect(Object.keys(r.sources)).toHaveLength(7);
    expect(r.failed).toEqual([]);
    expect(info).toHaveBeenCalledTimes(1);
  });

  it('awaits the injected yieldToMain once per procedural stem', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const specs = allGood();
    delete specs.kick;
    delete specs.hat;
    const { ctx, fetchImpl } = setup(specs);
    const yieldToMain = vi.fn(() => Promise.resolve());
    await loadTrackStems(ctx, BARLEY_AND_BRAZIER, { fetchImpl, yieldToMain });
    expect(yieldToMain).toHaveBeenCalledTimes(2);
  });

  it('lists a stem whose synth throws in failed and omits it from buffers', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const track: TrackDef = {
      ...BARLEY_AND_BRAZIER,
      stems: ['kick', 'banjo'],
      mixes: { ...BARLEY_AND_BRAZIER.mixes },
    };
    const { ctx, fetchImpl, yieldToMain } = setup({});
    const r = await loadTrackStems(ctx, track, { fetchImpl, yieldToMain });
    expect(r.failed).toEqual(['banjo']);
    expect(r.buffers.has('banjo')).toBe(false);
    expect(r.sources.banjo).toBeUndefined();
    expect(r.buffers.has('kick')).toBe(true);
    expect(warn).toHaveBeenCalled();
  });
});

describe('conformBuffer', () => {
  it('returns the same buffer when length already matches', () => {
    const { ctx } = makeCtx();
    const b = ctx.createBuffer(1, 10, SR);
    expect(conformBuffer(ctx, b, 10, 2)).toBe(b);
  });
  it('conforms every channel', () => {
    const { ctx } = makeCtx();
    const b = ctx.createBuffer(2, 11, SR);
    b.getChannelData(1).fill(1);
    const out = conformBuffer(ctx, b, 10, 2)!;
    expect(out.numberOfChannels).toBe(2);
    expect(out.getChannelData(1).length).toBe(10);
    expect(out.getChannelData(1)[9]).toBe(1);
  });
  it('returns null beyond tolerance', () => {
    const { ctx } = makeCtx();
    expect(conformBuffer(ctx, ctx.createBuffer(1, 13, SR), 10, 2)).toBeNull();
  });
});
