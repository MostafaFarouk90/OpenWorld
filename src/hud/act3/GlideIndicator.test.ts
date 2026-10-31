import { describe, expect, it } from 'vitest';
import { GLIDE_TUNING } from '../../movement/types';
import { StubDocument, textOf, type ElementLike } from '../dom';
import { GLIDE_LEVEL_BAND, GlideIndicator, laneOffset, liftTrend, wrapPi, type GlideReading } from './GlideIndicator';

const shown = (e: ElementLike) => e.style.display !== 'none';
const HALF = 0.6;
const base = (over: Partial<GlideReading> = {}): GlideReading => ({ state: 'gliding', yaw: 1, heading: 1, laneHalfAngle: HALF, lift: 0, heightAboveGround: 120.4, ...over });
const make = (r?: () => GlideReading | null | undefined, glyph = () => 'F') => new GlideIndicator(new StubDocument(), { glide: r, glyph });
const lane = (g: GlideIndicator) => g.element.children[0]!;
const marker = (g: GlideIndicator) => lane(g).children[1]!;
const row = (g: GlideIndicator) => g.element.children[1]!;

describe('GlideIndicator visibility', () => {
  it('is hidden when idle, while launching, with no service and for a missing reading', () => {
    for (const state of ['idle', 'launching']) {
      const g = make(() => base({ state }));
      g.update();
      expect(g.visible).toBe(false);
      expect(shown(g.element)).toBe(false);
    }
    for (const read of [undefined, () => undefined, () => null, () => { throw new Error('x'); }]) {
      const g = make(read as never);
      g.update();
      expect(g.visible).toBe(false);
    }
  });

  it('shows while gliding and hides again on landing, a let-go or a load (the state leaves gliding)', () => {
    const r = base();
    const g = make(() => r);
    g.update();
    expect(g.visible).toBe(true);
    expect(shown(g.element)).toBe(true);
    r.state = 'idle';
    g.update();
    expect(g.visible).toBe(false);
    r.state = 'gliding';
    g.update();
    expect(g.visible).toBe(true);
  });

  it('dispose removes the element', () => {
    const g = make(() => base());
    const parent = new StubDocument().createElement('div');
    parent.append(g.element);
    g.dispose();
    expect(parent.children).toHaveLength(0);
  });
});

describe('lane marker', () => {
  it.each([
    ['the centre', 1, 1, '50%'],
    ['the right edge', 1 + HALF, 1, '100%'],
    ['the left edge', 1 - HALF, 1, '0%'],
    ['past the right edge (clamped)', 1 + 3 * HALF, 1, '100%'],
    ['past the left edge (clamped)', 1 - 3 * HALF, 1, '0%'],
    ['half way right', 1 + HALF / 2, 1, '75%'],
  ])('is at %s', (_n, yaw, heading, left) => {
    const g = make(() => base({ yaw, heading }));
    g.update();
    expect(shown(lane(g))).toBe(true);
    expect(marker(g).style.left).toBe(left);
  });

  it('wraps across plus and minus pi', () => {
    // Heading just under pi, yaw just over -pi: they are 0.2 apart, not nearly 2 pi.
    const g = make(() => base({ heading: Math.PI - 0.1, yaw: -Math.PI + 0.1, laneHalfAngle: 0.4 }));
    g.update();
    expect(marker(g).style.left).toBe('75%');
    expect(wrapPi(3 * Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapPi(-3 * Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapPi(2 * Math.PI + 0.3)).toBeCloseTo(0.3);
    expect(wrapPi(-2 * Math.PI - 0.3)).toBeCloseTo(-0.3);
    expect(wrapPi(NaN)).toBeNaN();
    expect(wrapPi(Infinity)).toBeNaN();
  });

  it('hides only the lane for a null heading, a null or bad half angle, or a NaN yaw', () => {
    for (const over of [{ heading: null }, { laneHalfAngle: null }, { laneHalfAngle: 0 }, { laneHalfAngle: NaN }, { yaw: NaN }] as Partial<GlideReading>[]) {
      const g = make(() => base(over));
      g.update();
      expect(g.visible, JSON.stringify(over)).toBe(true);
      expect(shown(lane(g))).toBe(false);
      expect(shown(row(g))).toBe(true);
    }
    expect(laneOffset(0, 0, 0)).toBeNull();
    expect(laneOffset(NaN, 0, 1)).toBeNull();
  });
});

describe('lift and height', () => {
  it('reads rising, level and sinking against the sink rate', () => {
    const s = GLIDE_TUNING.sinkRate;
    expect(liftTrend(s + GLIDE_LEVEL_BAND + 0.1)).toBe('rising');
    expect(liftTrend(s)).toBe('level');
    expect(liftTrend(s + GLIDE_LEVEL_BAND)).toBe('level');
    expect(liftTrend(0)).toBe('sinking');
    expect(liftTrend(NaN)).toBeNull();
    const r = base({ lift: s + 3 });
    const g = make(() => r);
    g.update();
    expect(g.element.children[1]!.children[0]!.textContent).toBe('↑ Rising');
    r.lift = s;
    g.update();
    expect(g.element.children[1]!.children[0]!.textContent).toBe('→ Level');
    r.lift = 0;
    g.update();
    expect(g.element.children[1]!.children[0]!.textContent).toBe('↓ Sinking');
  });

  it('a NaN lift hides the arrow, a NaN height hides the height, and the widget stays', () => {
    const g = make(() => base({ lift: NaN, heightAboveGround: NaN }));
    g.update();
    expect(g.visible).toBe(true);
    const [lift, height] = row(g).children;
    expect(shown(lift!)).toBe(false);
    expect(shown(height!)).toBe(false);
  });

  it('rounds the height to whole metres and never shows a negative one', () => {
    const r = base({ heightAboveGround: 120.4 });
    const g = make(() => r);
    g.update();
    expect(row(g).children[1]!.textContent).toBe('120 m');
    r.heightAboveGround = 120.5;
    g.update();
    expect(row(g).children[1]!.textContent).toBe('121 m');
    r.heightAboveGround = -0.7;
    g.update();
    expect(row(g).children[1]!.textContent).toBe('0 m');
  });
});

describe('let-go hint', () => {
  it('names the interact key and is part of the shown widget only', () => {
    const g = make(() => base(), () => 'E');
    g.update();
    expect(textOf(g.element)).toContain('E to let go');
  });

  it('falls back to a question mark when the glyph cannot be read', () => {
    const g = make(() => base(), () => { throw new Error('no bindings'); });
    g.update();
    expect(textOf(g.element)).toContain('? to let go');
  });
});
