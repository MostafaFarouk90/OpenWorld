import { describe, expect, it, vi } from 'vitest';
import { AmbienceBed, makeBedSamples, type BedId } from './AmbienceBed';
import { DEFAULT_INTERIOR_PRESET, INTERIOR_PRESETS, MINE_INTERIOR_IDS, MINE_PRESET, isMineInterior, presetFor } from './InteriorFx';
import { REGION_INFO } from '../region/regions';

describe('isMineInterior', () => {
  it.each(['mine-old-galleries', 'mine-deepdelve', 'mine-x'])('%s is a mine', (id) => expect(isMineInterior(id)).toBe(true));
  it.each(['mine-', 'mine', 'minefield', 'mines.old', 'underways', 'grisel-hall', '', '__proto__', 'constructor', 'toString', 'Mine-x'])('%j is not', (id) => expect(isMineInterior(id)).toBe(false));
  it('null is outdoors, not a mine', () => expect(isMineInterior(null)).toBe(false));
  it('an id added to MINE_INTERIOR_IDS counts', () => {
    const set = MINE_INTERIOR_IDS as Set<string>;
    set.add('deepdelve-arena');
    try {
      expect(isMineInterior('deepdelve-arena')).toBe(true);
      expect(presetFor('deepdelve-arena')).toBe(MINE_PRESET);
    } finally {
      set.delete('deepdelve-arena');
    }
    expect(isMineInterior('deepdelve-arena')).toBe(false);
  });
});

describe('interior presets', () => {
  it('mine-* gets the long dark mine preset, longer than the Underways', () => {
    expect(presetFor('mine-weeping-bellows')).toBe(MINE_PRESET);
    expect(MINE_PRESET.seconds).toBeGreaterThan(INTERIOR_PRESETS.underways.seconds);
    expect(MINE_PRESET.duck).toBeLessThanOrEqual(0.75);
  });
  it('Scorchhold keep uses the keep-hall values and Grisel Hall has its own', () => {
    expect(presetFor('scorchhold-keep')).toEqual(INTERIOR_PRESETS['keep-hall']);
    expect(INTERIOR_PRESETS['grisel-hall']).toBeDefined();
    expect(presetFor('grisel-hall')).not.toBe(DEFAULT_INTERIOR_PRESET);
  });
  it('an unknown id (including a prototype name) still gets the default', () => {
    expect(presetFor('nowhere')).toBe(DEFAULT_INTERIOR_PRESET);
    expect(presetFor('constructor')).toBe(DEFAULT_INTERIOR_PRESET);
    expect(presetFor('mine-')).toBe(DEFAULT_INTERIOR_PRESET);
  });
});

describe('Act 2 beds', () => {
  it('the registry names a bed for both regions', () => {
    expect(REGION_INFO.cinderreach.bed).toBe('cinderreach');
    expect(REGION_INFO.oldsmoke.bed).toBe('oldsmoke');
  });

  it.each(['cinderreach', 'oldsmoke'] as BedId[])('%s is deterministic, finite, within the peak and loops without a seam', (id) => {
    const sr = 8000;
    const a = makeBedSamples(id, sr);
    const b = makeBedSamples(id, sr);
    expect(a.length).toBe(Math.round((id === 'cinderreach' ? 25 : 27) * sr));
    expect(a).toEqual(b);
    let peak = 0;
    let maxStep = 0;
    for (let i = 0; i < a.length; i++) {
      expect(Number.isFinite(a[i])).toBe(true);
      peak = Math.max(peak, Math.abs(a[i]));
      if (i > 0) maxStep = Math.max(maxStep, Math.abs(a[i] - a[i - 1]));
    }
    expect(peak).toBeGreaterThan(0.3);
    expect(peak).toBeLessThanOrEqual(0.7 + 1e-6);
    expect(Math.abs(a[0] - a[a.length - 1])).toBeLessThanOrEqual(maxStep);
  });

  it('the two beds and the Act 1 beds differ from each other', () => {
    const sr = 4000;
    const ids: BedId[] = ['brightwater', 'harrowmark', 'underways', 'cinderreach', 'oldsmoke'];
    const heads = ids.map((id) => Array.from(makeBedSamples(id, sr).slice(0, 400)).join(','));
    expect(new Set(heads).size).toBe(ids.length);
  });
});

// --- bed wiring (same fake audio nodes as AmbienceBed.test.ts) -------------------------------

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
  const gains: FakeNode[] = [];
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
    createBufferSource: vi.fn(() => new FakeNode() as unknown as AudioBufferSourceNode),
  };
  const bed = AmbienceBed.create(ctx, new FakeNode() as unknown as AudioNode)!;
  return { bed, gains, filter: filters[0] };
}

describe('AmbienceBed with the Act 2 regions', () => {
  it('Cinderreach and Oldsmoke crossfade like any region bed', () => {
    const { bed, gains } = env();
    bed.setRegion('cinderreach');
    expect(gains[1].gain.ramps.at(-1)).toEqual({ to: 1, at: 3 });
    bed.setRegion('oldsmoke');
    expect(gains[1].gain.ramps.at(-1)).toEqual({ to: 0, at: 3 });
    expect(gains[2].gain.ramps.at(-1)).toEqual({ to: 1, at: 3 });
  });

  it('inside a mine the Oldsmoke bed stays on and the bus is not muffled', () => {
    const { bed, gains, filter } = env();
    bed.setRegion('oldsmoke');
    const before = gains[1].gain.ramps.at(-1);
    bed.setInterior('mine-old-galleries');
    expect(gains[1].gain.ramps.at(-1)).toEqual(before);
    expect(before).toEqual({ to: 1, at: 3 });
    expect(filter.frequency.ramps.length).toBe(0);
    bed.setInterior(null);
    expect(gains[1].gain.ramps.at(-1)).toEqual({ to: 1, at: 3 });
  });

  it('any other interior still muffles, and Grisel Hall is one of them', () => {
    const { bed, filter } = env();
    bed.setRegion('oldsmoke');
    bed.setInterior('grisel-hall');
    expect(filter.frequency.ramps.at(-1)).toEqual({ to: 600, at: 1.4 });
  });
});
