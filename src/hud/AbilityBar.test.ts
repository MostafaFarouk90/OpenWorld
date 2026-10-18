import { afterEach, describe, expect, it, vi } from 'vitest';
import { StubDocument } from './dom';
import { FlagGates } from '../state/FlagGates';
import { WorldState } from '../state/WorldState';
import { GameEvents } from '../core/events';
import { AbilityBar, LeapState, LEAP_FALLBACK_SECONDS, cooldownAngle, cooldownRing, type AbilitySlotInfo } from './AbilityBar';

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
    expect(bar.element.children).toHaveLength(7);
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

describe('Leap key cap', () => {
  const cap = (bar: AbilityBar) => bar.element.children[6]!;

  it('is hidden when not learned or the source is absent', () => {
    expect(cap(new AbilityBar(new StubDocument(), { slots: () => [], glyph })).style.display).toBe('none');
    expect(cap(new AbilityBar(new StubDocument(), { slots: () => [], glyph, leap: () => null })).style.display).toBe('none');
  });

  it('shows the ring and the bound glyph, amber at Burn 75+ without dimming', () => {
    let warn = false;
    const bar = new AbilityBar(new StubDocument(), {
      slots: () => [],
      glyph: (a) => (a === 'surgeLeap' ? 'V' : a),
      leap: () => ({ cooldown: { remaining: 2, total: 4 }, warn }),
    });
    expect(cap(bar).style.display).toBe('block');
    expect(cap(bar).children[1]!.textContent).toBe('V');
    expect(cap(bar).children[0]!.style.background).toContain('180deg');
    expect(cap(bar).className).toBe('owg-leap');
    warn = true;
    bar.update();
    expect(cap(bar).className).toBe('owg-leap owg-leap-warn');
    expect(cap(bar).className).not.toContain('dim');
  });
});

describe('LeapState', () => {
  const make = (over: Partial<ConstructorParameters<typeof LeapState>[0]> = {}) => {
    let learned = true;
    const s = new LeapState({ learned: () => learned, ...over });
    return { s, setLearned: (v: boolean) => (learned = v) };
  };

  it('is null while not learned', () => {
    const { s, setLearned } = make();
    setLearned(false);
    expect(s.info()).toBeNull();
  });

  it('fallback timer: starts on leap start, counts down 4 s, ends', () => {
    const { s } = make();
    expect(s.info()!.cooldown.remaining).toBe(0);
    s.onLeap('start');
    expect(s.info()!.cooldown).toEqual({ remaining: LEAP_FALLBACK_SECONDS, total: LEAP_FALLBACK_SECONDS });
    s.tick(1.5);
    expect(s.info()!.cooldown.remaining).toBeCloseTo(2.5);
    s.onLeap('land');
    s.tick(10);
    expect(s.info()!.cooldown.remaining).toBe(0);
    s.tick(NaN);
    s.tick(-1);
    expect(s.info()!.cooldown.remaining).toBe(0);
  });

  it('cancel mid-leap clears the timer', () => {
    const { s } = make();
    s.onLeap('start');
    s.onLeap('cancel');
    expect(s.info()!.cooldown.remaining).toBe(0);
  });

  it('prefers the spells.leap service and falls back when it throws or returns junk', () => {
    expect(make({ cooldown: () => ({ remaining: 1, total: 6 }) }).s.info()!.cooldown).toEqual({ remaining: 1, total: 6 });
    const t = make({ cooldown: () => { throw new Error('x'); } }).s;
    t.onLeap('start');
    expect(t.info()!.cooldown.remaining).toBe(LEAP_FALLBACK_SECONDS);
    const u = make({ cooldown: () => ({ remaining: NaN, total: 4 }) }).s;
    expect(u.info()!.cooldown.remaining).toBe(0);
    expect(make({ cooldown: () => null }).s.info()).not.toBeNull();
  });

  it('Burn only warns, at 75 and up; never hides or blocks', () => {
    for (const [burn, warn] of [[0, false], [74, false], [75, true], [100, true]] as const) {
      expect(make({ burn: () => burn }).s.info()!.warn).toBe(warn);
    }
    expect(make().s.info()!.warn).toBe(false);
    expect(make({ burn: () => undefined }).s.info()!.warn).toBe(false);
  });

  it('ring appears after a load through the flag gate (no event on load)', () => {
    const events = new GameEvents(() => {});
    const state = new WorldState(events, () => {});
    const gates = new FlagGates(state, events, () => {});
    let learned = false;
    gates.flag('ability.surge-leap.learned', (open) => (learned = open));
    const s = new LeapState({ learned: () => learned });
    expect(s.info()).toBeNull();
    state.load({ flags: { 'ability.surge-leap.learned': true } });
    events.emit('save.loaded', { slot: 'x' });
    expect(s.info()).not.toBeNull();
    state.load({ flags: {} });
    events.emit('save.loaded', { slot: 'x' });
    expect(s.info()).toBeNull();
  });
});
