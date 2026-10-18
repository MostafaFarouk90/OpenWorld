import { afterEach, describe, expect, it, vi } from 'vitest';
import { StubDocument } from './dom';
import { AbilityBar, cooldownAngle, cooldownRing, type AbilitySlotInfo } from './AbilityBar';

const slot = (over: Partial<AbilitySlotInfo> = {}): AbilitySlotInfo => ({
  skillId: 'knight.rallyCry',
  nameKey: 'skill.rally',
  cooldown: { remaining: 0, total: 10 },
  affordable: true,
  ...over,
});
const glyph = (a: string) => ({ ability1: 'Q', ability2: 'E' })[a as 'ability1'] ?? a;

afterEach(() => vi.useRealTimers());

describe('cooldown ring', () => {
  it('angles at 0, 50, 100 percent', () => {
    expect(cooldownAngle(0, 10)).toBe(0);
    expect(cooldownAngle(5, 10)).toBe(180);
    expect(cooldownAngle(10, 10)).toBe(360);
    expect(cooldownAngle(50, 10)).toBe(360);
    expect(cooldownAngle(5, 0)).toBe(0);
    expect(cooldownAngle(NaN, 10)).toBe(0);
    expect(cooldownRing(5, 10)).toBe('conic-gradient(rgba(0, 0, 0, 0.7) 180deg, transparent 180deg)');
  });
});

describe('AbilityBar', () => {
  it('has six slots, empty ones dim, glyphs from bindings', () => {
    const bar = new AbilityBar(new StubDocument(), { slots: () => [slot()], glyph });
    expect(bar.element.children).toHaveLength(6);
    expect(bar.element.children[0]!.className).toBe('owg-slot');
    expect(bar.element.children[1]!.className).toContain('owg-slot-empty');
    expect(bar.element.children[0]!.children[1]!.textContent).toBe('Q');
    expect(bar.element.children[1]!.children[1]!.textContent).toBe('E');
    expect(bar.element.children[5]!.children[1]!.textContent).toBe('ability6');
    expect(bar.element.children[1]!.getAttribute('title')).toBe('Empty slot');
  });
  it('draws the cooldown ring and ember cost', () => {
    const s = slot({ cooldown: { remaining: 5, total: 10 }, emberCost: 3 });
    const bar = new AbilityBar(new StubDocument(), { slots: () => [s], glyph });
    expect(bar.element.children[0]!.children[0]!.style.background).toContain('180deg');
    expect(bar.element.children[0]!.children[2]!.textContent).toBe('3 Ember');
    s.cooldown.remaining = 0;
    s.emberCost = undefined;
    bar.update();
    expect(bar.element.children[0]!.children[0]!.style.background).toContain('0deg');
    expect(bar.element.children[0]!.children[2]!.textContent).toBeNull();
  });
  it('dims unaffordable slots', () => {
    const bar = new AbilityBar(new StubDocument(), { slots: () => [slot({ affordable: false })], glyph });
    expect(bar.element.children[0]!.className).toContain('owg-slot-dim');
  });
  it('shake adds a class then removes it, ignoring bad slots', () => {
    vi.useFakeTimers();
    const bar = new AbilityBar(new StubDocument(), { slots: () => [], glyph });
    bar.shake(2);
    bar.shake(-1);
    bar.shake(6);
    bar.shake(1.5);
    expect(bar.element.children[2]!.className).toContain('owg-shake');
    expect(bar.element.children.filter((c) => c.className.includes('owg-shake'))).toHaveLength(1);
    vi.advanceTimersByTime(400);
    expect(bar.element.children[2]!.className).not.toContain('owg-shake');
  });
  it('dispose cancels timers and removes the element', () => {
    vi.useFakeTimers();
    const bar = new AbilityBar(new StubDocument(), { slots: () => [], glyph });
    const root = new StubDocument().createElement('div');
    root.append(bar.element);
    bar.shake(0);
    bar.dispose();
    expect(root.children).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
