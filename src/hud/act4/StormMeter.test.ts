import { describe, expect, it } from 'vitest';
import { StubDocument, type ElementLike } from '../dom';
import { StormMeter, clockText, stormView, type StormReading } from './StormMeter';

const shown = (e: ElementLike) => e.style.display !== 'none';
const base = (over: Partial<StormReading> = {}): StormReading => ({
  inRegion: true,
  kind: 'clear',
  t: 60,
  forced: false,
  held: false,
  nextIn: 180,
  exposed: 0,
  onRope: false,
  sheltered: false,
  atFloor: false,
  ...over,
});
const textOf = (m: StormMeter) => m.element.children[0]!.children[0]!.textContent;
const maskOf = (m: StormMeter) => m.element.children[0]!.children[1]!;
const fillOf = (m: StormMeter) => m.element.children[1]!.children[0]!;
const lineOf = (m: StormMeter) => m.element.children[2]!;

describe('clockText', () => {
  it('rounds up and pads seconds; bad input reads 0:00', () => {
    expect(clockText(0)).toBe('0:00');
    expect(clockText(0.2)).toBe('0:01');
    expect(clockText(65)).toBe('1:05');
    expect(clockText(240)).toBe('4:00');
    expect(clockText(-3)).toBe('0:00');
    expect(clockText(Number.NaN)).toBe('0:00');
  });
});

describe('stormView', () => {
  it('outside the Waste there is nothing to show', () => {
    expect(stormView(base({ inRegion: false, kind: 'storm' }))).toBeNull();
  });

  it('clear counts down to the warning and the bar fills toward it', () => {
    const v = stormView(base({ t: 60, nextIn: 180 }))!;
    expect(v.phase).toBe('clear');
    expect(v.textKey).toBe('act4.hud.storm.clear');
    expect(v.params).toEqual({ time: '3:00' });
    expect(v.fill).toBeCloseTo(0.25);
    expect(v.line).toBeNull();
  });

  it('a held clear (a scene, an arena) shows no countdown', () => {
    const v = stormView(base({ held: true }))!;
    expect(v.textKey).toBe('act4.hud.storm.clearHeld');
    expect(v.params).toBeUndefined();
  });

  it('warning drains from full to empty', () => {
    expect(stormView(base({ kind: 'warning', t: 0, nextIn: 20 }))!.fill).toBe(1);
    const v = stormView(base({ kind: 'warning', t: 15, nextIn: 5 }))!;
    expect(v.textKey).toBe('act4.hud.storm.warning');
    expect(v.params).toEqual({ time: '0:05' });
    expect(v.fill).toBeCloseTo(0.25);
  });

  it('storm shows the time left; a forced storm has no clock', () => {
    const v = stormView(base({ kind: 'storm', t: 30, nextIn: 60 }))!;
    expect(v.textKey).toBe('act4.hud.storm.storm');
    expect(v.params).toEqual({ time: '1:00' });
    expect(v.fill).toBeCloseTo(2 / 3);
    const f = stormView(base({ kind: 'storm', forced: true }))!;
    expect(f.textKey).toBe('act4.hud.storm.stormForced');
    expect(f.fill).toBe(1);
  });

  it('the exposure line: exposed, at the floor, replaced on the rope and in a shelter', () => {
    expect(stormView(base({ kind: 'storm', exposed: 0 }))!.line).toBeNull();
    expect(stormView(base({ kind: 'storm', exposed: 4 }))!.line).toBe('exposed');
    expect(stormView(base({ kind: 'storm', exposed: 4, atFloor: true }))!.line).toBe('floor');
    expect(stormView(base({ kind: 'storm', exposed: 4, onRope: true }))!.line).toBe('rope');
    expect(stormView(base({ kind: 'storm', exposed: 4, sheltered: true, onRope: true }))!.line).toBe('shelter');
    // A warning never exposes.
    expect(stormView(base({ kind: 'warning', exposed: 4 }))!.line).toBeNull();
  });

  it('an unknown clock still draws the phase (no NaN)', () => {
    const v = stormView(base({ kind: 'warning', nextIn: null }))!;
    expect(v.params).toEqual({ time: '0:00' });
    expect(Number.isFinite(v.fill)).toBe(true);
  });
});

describe('StormMeter', () => {
  it('is hidden with no weather service, a throwing one and outside the Waste', () => {
    for (const read of [undefined, () => undefined, () => { throw new Error('x'); }, () => base({ inRegion: false })]) {
      const m = new StormMeter(new StubDocument(), { read });
      m.update();
      expect(m.visible).toBe(false);
      expect(shown(m.element)).toBe(false);
    }
  });

  it('draws each phase, and a load mid-storm shows the storm on its first frame', () => {
    let r = base({ kind: 'storm', t: 10, nextIn: 80, exposed: 3 });
    const m = new StormMeter(new StubDocument(), { read: () => r });
    m.update();
    expect(m.visible).toBe(true);
    expect(textOf(m)).toBe('Ash storm: 1:20 left');
    expect(m.element.className).toContain('owg-storm-storm');
    expect(m.element.className).toContain('owg-storm-exposed');
    expect(lineOf(m).textContent).toBe('Exposed: the ash takes 2% every 3 s');
    expect(fillOf(m).style.width).toBe('88.89%');
    r = base({ kind: 'storm', t: 10, nextIn: 80, onRope: true });
    m.update();
    expect(lineOf(m).textContent).toBe('On the rope: safe');
    expect(m.element.className).not.toContain('owg-storm-exposed');
    r = base();
    m.update();
    expect(textOf(m)).toBe('Clear: ash rises in 3:00');
    expect(shown(lineOf(m))).toBe(false);
    r = base({ inRegion: false });
    m.update();
    expect(m.visible).toBe(false);
  });

  it('the mask chip: none before M42, lit with the mask, a warning without it while the ash is up', () => {
    let known = false;
    let masked = false;
    let r = base({ kind: 'storm' });
    const m = new StormMeter(new StubDocument(), { read: () => r, mask: () => masked, maskKnown: () => known });
    m.update();
    expect(shown(maskOf(m))).toBe(false);
    known = true;
    m.update();
    expect(maskOf(m).textContent).toBe('No mask: the ash blinds you');
    masked = true;
    m.update();
    expect(maskOf(m).textContent).toBe('Mask');
    expect(maskOf(m).className).toContain('owg-storm-mask-on');
    masked = false;
    r = base();
    m.update();
    expect(shown(maskOf(m))).toBe(false);
  });
});
