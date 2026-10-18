import { describe, expect, it } from 'vitest';
import { BARLEY_AND_BRAZIER, loopSamples, loopSeconds, validateTrack, type TrackDef } from './tracks';

const withTrack = (patch: Partial<TrackDef>): TrackDef => ({ ...BARLEY_AND_BRAZIER, ...patch });

describe('loopSamples', () => {
  it.each([44100, 48000, 8000])('is round(bars*240/bpm*sr) at %i', (sr) => {
    expect(loopSamples({ bars: 16, bpm: 92 }, sr)).toBe(Math.round(((16 * 240) / 92) * sr));
  });
  it('matches known values', () => {
    expect(loopSamples(BARLEY_AND_BRAZIER, 44100)).toBe(1840696);
    expect(loopSamples(BARLEY_AND_BRAZIER, 48000)).toBe(2003478);
  });
  it('loopSeconds is samples / sr', () => {
    expect(loopSeconds(BARLEY_AND_BRAZIER, 48000)).toBeCloseTo(2003478 / 48000, 12);
  });
});

describe('validateTrack', () => {
  it('accepts BARLEY_AND_BRAZIER', () => {
    expect(() => validateTrack(BARLEY_AND_BRAZIER)).not.toThrow();
  });
  it.each([0, -92, NaN, Infinity])('rejects bpm %s', (bpm) => {
    expect(() => validateTrack(withTrack({ bpm }))).toThrow(/bpm/);
  });
  it.each([15, 1, 0, -2, 16.5])('rejects bars %s', (bars) => {
    expect(() => validateTrack(withTrack({ bars }))).toThrow(/bars/);
  });
  it('rejects empty stems', () => {
    expect(() => validateTrack(withTrack({ stems: [], mixes: { ...BARLEY_AND_BRAZIER.mixes } }))).toThrow(/no stems/);
  });
  it('rejects duplicate stems', () => {
    expect(() => validateTrack(withTrack({ stems: [...BARLEY_AND_BRAZIER.stems, 'kick'] }))).toThrow(/duplicate/);
  });
  it('rejects a mix referencing an unknown stem', () => {
    const mixes = { ...BARLEY_AND_BRAZIER.mixes, explore: { ...BARLEY_AND_BRAZIER.mixes.explore, ghost: 0.5 } };
    expect(() => validateTrack(withTrack({ mixes }))).toThrow(/unknown stem "ghost"/);
  });
  it.each([1.01, NaN, -0.1])('rejects gain %s', (gain) => {
    const mixes = { ...BARLEY_AND_BRAZIER.mixes, combat: { ...BARLEY_AND_BRAZIER.mixes.combat, kick: gain } };
    expect(() => validateTrack(withTrack({ mixes }))).toThrow(/gain/);
  });
  it('accepts gain exactly 1 and 0', () => {
    const mixes = { ...BARLEY_AND_BRAZIER.mixes, combat: { ...BARLEY_AND_BRAZIER.mixes.combat, kick: 1, snare: 0 } };
    expect(() => validateTrack(withTrack({ mixes }))).not.toThrow();
  });
});
