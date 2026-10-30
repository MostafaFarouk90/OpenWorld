import { describe, expect, it, vi } from 'vitest';
import { KillXpRegionFactor, QuestRewardScale } from './scalePorts';

describe('QuestRewardScale', () => {
  it('is 1 with no provider; reads the provider; 0 pays nothing, as QuestManager reads it', () => {
    const s = new QuestRewardScale();
    expect(s.scale('m23')).toBe(1);
    const undo = s.setProvider((q) => (q === 'm23' ? 1.25 : 0));
    expect(s.scale('m23')).toBe(1.25);
    expect(s.scale('m28')).toBe(0);
    undo();
    expect(s.scale('m23')).toBe(1);
  });
  it('a negative, NaN or throwing provider reads as 1 with a warning', () => {
    const warn = vi.fn();
    const s = new QuestRewardScale(warn);
    s.setProvider(() => -1);
    expect(s.scale('m23')).toBe(1);
    s.setProvider(() => NaN);
    expect(s.scale('m23')).toBe(1);
    s.setProvider(() => { throw new Error('x'); });
    expect(s.scale('m23')).toBe(1);
    expect(warn).toHaveBeenCalledTimes(3);
  });
});

describe('KillXpRegionFactor', () => {
  it('is 1 by default and for no region; set and undo; a bad factor is ignored', () => {
    const warn = vi.fn();
    const k = new KillXpRegionFactor(warn);
    expect(k.factor('greyfen')).toBe(1);
    expect(k.factor(null)).toBe(1);
    const undo = k.set('greyfen', 1.4);
    expect(k.factor('greyfen')).toBe(1.4);
    undo();
    expect(k.factor('greyfen')).toBe(1);
    k.set('greyfen', Infinity);
    expect(k.factor('greyfen')).toBe(1);
    expect(warn).toHaveBeenCalledOnce();
  });
});
