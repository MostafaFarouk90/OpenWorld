import { describe, expect, it } from 'vitest';
import { StubDocument } from './dom';
import { activeBuffs, BuffBar, buffFraction, buffRing, type BuffInfo } from './BuffBar';

describe('buff helpers', () => {
  it('filters expired, zero, negative and NaN', () => {
    const mk = (remaining: number): BuffInfo => ({ id: `b${remaining}`, nameKey: 'k', remaining, total: 10 });
    expect(activeBuffs([mk(5), mk(0), mk(-1), mk(NaN), mk(0.1)]).map((b) => b.remaining)).toEqual([5, 0.1]);
  });
  it('ring fraction clamps', () => {
    expect(buffFraction({ remaining: 5, total: 10 })).toBe(0.5);
    expect(buffFraction({ remaining: 20, total: 10 })).toBe(1);
    expect(buffFraction({ remaining: 5, total: 0 })).toBe(0);
    expect(buffRing(0.5)).toContain('180deg');
    expect(buffRing(1)).toContain('360deg');
  });
});

describe('BuffBar', () => {
  it('renders active buffs and removes them when expired', () => {
    const buffs: BuffInfo[] = [{ id: 'rally', nameKey: 'buff.rally', remaining: 4.2, total: 8 }];
    const bar = new BuffBar(new StubDocument(), { buffs: () => buffs });
    expect(bar.element.children).toHaveLength(1);
    const b = bar.element.children[0]!;
    expect(b.getAttribute('data-buff')).toBe('rally');
    expect(b.children[0]!.style.background).toContain('189deg');
    expect(b.children[1]!.textContent).toBe('5s');
    buffs[0]!.remaining = 0;
    bar.update();
    expect(bar.element.children).toHaveLength(0);
  });
  it('empty source renders nothing; missing key shows [[key]]', () => {
    const bar = new BuffBar(new StubDocument(), { buffs: () => [] });
    expect(bar.element.children).toHaveLength(0);
    const b2 = new BuffBar(new StubDocument(), { buffs: () => [{ id: 'x', nameKey: 'nope', remaining: 1, total: 1 }] });
    expect(b2.element.children[0]!.getAttribute('title')).toBe('[[nope]]');
  });
  it('dispose removes the element', () => {
    const bar = new BuffBar(new StubDocument(), { buffs: () => [] });
    const root = new StubDocument().createElement('div');
    root.append(bar.element);
    bar.dispose();
    expect(root.children).toHaveLength(0);
  });
});
