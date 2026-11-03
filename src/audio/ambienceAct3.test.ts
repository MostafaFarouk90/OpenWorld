import { describe, expect, it } from 'vitest';
import { makeBedSamples, type BedId } from './AmbienceBed';
import { REGION_INFO } from '../region/regions';

const LOOP: Record<string, number> = { greyfen: 29, dragonspine: 31 };

describe('Act 3 beds', () => {
  it('the registry names a bed for both regions', () => {
    expect(REGION_INFO.greyfen.bed).toBe('greyfen');
    expect(REGION_INFO.dragonspine.bed).toBe('dragonspine');
  });

  it.each(['greyfen', 'dragonspine'] as BedId[])('%s is deterministic, finite, in the Act 2 level range and loops without a seam', (id) => {
    const sr = 8000;
    const a = makeBedSamples(id, sr);
    const b = makeBedSamples(id, sr);
    expect(a.length).toBe(Math.round(LOOP[id] * sr));
    expect(a).toEqual(b);
    let peak = 0;
    let maxStep = 0;
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      expect(Number.isFinite(a[i])).toBe(true);
      peak = Math.max(peak, Math.abs(a[i]));
      sum += a[i] * a[i];
      if (i > 0) maxStep = Math.max(maxStep, Math.abs(a[i] - a[i - 1]));
    }
    const rms = Math.sqrt(sum / a.length);
    expect(peak).toBeGreaterThan(0.3);
    expect(peak).toBeLessThanOrEqual(0.7 + 1e-6);
    expect(rms).toBeGreaterThan(0.02);
    expect(rms).toBeLessThan(0.4);
    expect(Math.abs(a[0] - a[a.length - 1])).toBeLessThanOrEqual(maxStep);
  });

  it('the Act 3 beds differ from each other and from the Act 2 beds', () => {
    const sr = 4000;
    const ids: BedId[] = ['cinderreach', 'oldsmoke', 'greyfen', 'dragonspine'];
    const heads = ids.map((id) => Array.from(makeBedSamples(id, sr).slice(0, 400)).join(','));
    expect(new Set(heads).size).toBe(ids.length);
  });
});
