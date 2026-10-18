import { describe, expect, it } from 'vitest';
import { StubDocument, textOf, type ElementLike } from './dom';
import { barFraction, burnZone, StatusBars, type StatusBarsSource } from './StatusBars';

function make(over: Partial<StatusBarsSource> = {}) {
  const state = { health: 50, max: 100, stamina: 30, maxStamina: 60 };
  const src: StatusBarsSource = {
    health: () => state.health,
    maxHealth: () => state.max,
    stamina: () => state.stamina,
    maxStamina: () => state.maxStamina,
    ...over,
  };
  const bars = new StatusBars(new StubDocument(), src);
  return { state, bars };
}
const find = (el: ElementLike, cls: string): ElementLike | undefined => {
  if (el.className.split(' ').includes(cls)) return el;
  for (const c of el.children) {
    const f = find(c, cls);
    if (f) return f;
  }
  return undefined;
};

describe('barFraction', () => {
  it('clamps and handles bad input', () => {
    expect(barFraction(50, 100)).toBe(0.5);
    expect(barFraction(0, 0)).toBe(0);
    expect(barFraction(10, 0)).toBe(0);
    expect(barFraction(10, -5)).toBe(0);
    expect(barFraction(-10, 100)).toBe(0);
    expect(barFraction(150, 100)).toBe(1);
    expect(barFraction(NaN, 100)).toBe(0);
    expect(barFraction(10, NaN)).toBe(0);
    expect(barFraction(Infinity, 100)).toBe(0);
    expect(barFraction(10, Infinity)).toBe(0);
  });
});

describe('burnZone', () => {
  it('has the documented boundaries', () => {
    expect(burnZone(0)).toBe('warm');
    expect(burnZone(39)).toBe('warm');
    expect(burnZone(40)).toBe('blaze');
    expect(burnZone(74)).toBe('blaze');
    expect(burnZone(75)).toBe('cinder');
    expect(burnZone(100)).toBe('cinder');
    expect(burnZone(NaN)).toBe('warm');
    expect(burnZone(-5)).toBe('warm');
  });
});

describe('StatusBars', () => {
  it('draws health and stamina widths', () => {
    const { bars } = make();
    expect(find(bars.element, 'owg-bar-health')!.children[0]!.style.width).toBe('50%');
    expect(find(bars.element, 'owg-bar-stamina')!.children[0]!.style.width).toBe('50%');
  });

  it('NaN health shows 0 and negative clamps', () => {
    const { bars, state } = make();
    state.health = NaN;
    bars.update();
    expect(find(bars.element, 'owg-bar-health')!.children[0]!.style.width).toBe('0%');
    expect(textOf(find(bars.element, 'owg-bar-health')!)).toContain('0/100');
    state.health = -20;
    bars.update();
    expect(find(bars.element, 'owg-bar-health')!.children[0]!.style.width).toBe('0%');
  });

  it('over-max health clamps to full and the label', () => {
    const { bars, state } = make();
    state.health = 999;
    bars.update();
    expect(find(bars.element, 'owg-bar-health')!.children[0]!.style.width).toBe('100%');
    expect(textOf(find(bars.element, 'owg-bar-health')!)).toContain('100/100');
  });

  it('zero max health shows empty without throwing', () => {
    const { bars, state } = make();
    state.max = 0;
    bars.update();
    expect(find(bars.element, 'owg-bar-health')!.children[0]!.style.width).toBe('0%');
    expect(bars.maxHealthShown).toBe(0);
  });

  it('reflects a reduced max and the lost segment', () => {
    const state = { max: 120 };
    const bars = new StatusBars(new StubDocument(), {
      health: () => 60,
      maxHealth: () => state.max,
      baseMaxHealth: () => 120,
      stamina: () => 1,
      maxStamina: () => 1,
    });
    const lost = find(bars.element, 'owg-bar-lost')!;
    expect(lost.style.width).toBe('0%');
    state.max = 90;
    bars.update();
    expect(bars.maxHealthShown).toBe(90);
    expect(lost.style.width).toBe('25%');
    expect(find(bars.element, 'owg-bar-health')!.children[0]!.style.width).toBe('66.67%');
  });

  it('hides Burn and Ember without a spells source, shows with one', () => {
    const { bars } = make();
    expect(find(bars.element, 'owg-bar-burn')!.style.display).toBe('none');
    expect(find(bars.element, 'owg-bar-ember')!.style.display).toBe('none');
    const sp = { burn: 0, ember: 5, maxEmber: 10 };
    const b2 = make({ spells: () => sp }).bars;
    const burn = find(b2.element, 'owg-bar-burn')!;
    expect(burn.style.display).toBe('block');
    expect(burn.className).toContain('owg-burn-warm');
    sp.burn = 40;
    b2.update();
    expect(burn.className).toContain('owg-burn-blaze');
    sp.burn = 75;
    b2.update();
    expect(burn.className).toContain('owg-burn-cinder');
    expect(burn.children[0]!.style.width).toBe('75%');
    expect(find(b2.element, 'owg-bar-ember')!.children[0]!.style.width).toBe('50%');
    sp.maxEmber = 0;
    b2.update();
    expect(find(b2.element, 'owg-bar-ember')!.children[0]!.style.width).toBe('0%');
  });

  it('spells that disappear hide the bars again', () => {
    let on = true;
    const { bars } = make({ spells: () => (on ? { burn: 1, ember: 1, maxEmber: 1 } : undefined) });
    on = false;
    bars.update();
    expect(find(bars.element, 'owg-bar-burn')!.style.display).toBe('none');
  });

  it('XP bar shows level and MAX at cap, hidden without progress', () => {
    const { bars } = make();
    expect(find(bars.element, 'owg-bar-xp')!.style.display).toBe('none');
    const pr = { level: 3, xp: 25, xpToNext: 100, maxed: false };
    const b2 = make({ progress: () => pr }).bars;
    const xp = find(b2.element, 'owg-bar-xp')!;
    expect(xp.children[0]!.style.width).toBe('25%');
    expect(textOf(xp)).toBe('Lv 3');
    pr.maxed = true;
    pr.level = 40;
    b2.update();
    expect(xp.children[0]!.style.width).toBe('100%');
    expect(textOf(xp)).toBe('MAX');
  });

  it('uses a custom translator', () => {
    const b = make({ progress: () => ({ level: 2, xp: 0, xpToNext: 1, maxed: false }), t: (k) => `<${k}>` }).bars;
    expect(textOf(b.element)).toContain('<hud.level>');
  });

  it('dispose removes the element', () => {
    const { bars } = make();
    const root = new StubDocument().createElement('div');
    root.append(bars.element);
    bars.dispose();
    expect(root.children).toHaveLength(0);
  });
});
