import { describe, expect, it } from 'vitest';
import { DIVE_TUNING } from '../../water/types';
import { StubDocument, type ElementLike } from '../dom';
import { BREATH_LOW_SECONDS, BreathMeter, type BreathReading } from './BreathMeter';

const shown = (e: ElementLike) => e.style.display !== 'none';
const fillOf = (m: BreathMeter): ElementLike => m.element.children[0]!.children[0]!;
const make = (read?: () => BreathReading | null | undefined) => new BreathMeter(new StubDocument(), { water: read });

describe('BreathMeter', () => {
  it('is hidden on land, wading and with no water service', () => {
    for (const state of ['dry', 'wading']) {
      const m = make(() => ({ state, breath: DIVE_TUNING.breathSeconds }));
      m.update();
      expect(m.visible).toBe(false);
      expect(shown(m.element)).toBe(false);
    }
    const none = make();
    none.update();
    expect(none.visible).toBe(false);
    const gone = make(() => undefined);
    gone.update();
    expect(gone.visible).toBe(false);
  });

  it('shows and fills while diving: full, half, empty', () => {
    const r: BreathReading = { state: 'diving', breath: DIVE_TUNING.breathSeconds };
    const m = make(() => r);
    m.update();
    expect(m.visible).toBe(true);
    expect(fillOf(m).style.width).toBe('100%');
    r.breath = DIVE_TUNING.breathSeconds / 2;
    m.update();
    expect(fillOf(m).style.width).toBe('50%');
    r.breath = 0;
    m.update();
    expect(fillOf(m).style.width).toBe('0%');
    expect(m.visible).toBe(true);
  });

  it('hides on surfacing, and a new dive starts from a fresh bar', () => {
    const r: BreathReading = { state: 'diving', breath: 12 };
    const m = make(() => r);
    m.update();
    expect(m.visible).toBe(true);
    r.state = 'wading'; // surfaced at an air pocket onto the shallows
    r.breath = DIVE_TUNING.breathSeconds;
    m.update();
    expect(m.visible).toBe(false);
    r.state = 'diving';
    m.update();
    expect(m.visible).toBe(true);
    expect(fillOf(m).style.width).toBe('100%');
  });

  it('hides after a load that restored a state that is not diving, with no event involved', () => {
    const w = { state: 'diving', breath: 4 };
    const m = make(() => w);
    m.update();
    expect(m.visible).toBe(true);
    w.state = 'dry'; // save.loaded: the water reset put the player ashore
    w.breath = DIVE_TUNING.breathSeconds;
    m.update();
    expect(m.visible).toBe(false);
  });

  it('the low-breath style starts under 10 s and clears when the bar refills', () => {
    const r: BreathReading = { state: 'diving', breath: BREATH_LOW_SECONDS };
    const m = make(() => r);
    m.update();
    expect(m.element.className).toBe('owg-breath');
    r.breath = BREATH_LOW_SECONDS - 0.01;
    m.update();
    expect(m.element.className).toContain('owg-breath-low');
    r.breath = DIVE_TUNING.breathSeconds; // an air pocket
    m.update();
    expect(m.element.className).toBe('owg-breath');
    r.breath = 3;
    m.update();
    r.state = 'dry';
    m.update();
    expect(m.element.className).toBe('owg-breath'); // hidden clears the warning too
  });

  it('survives a throwing reader, NaN, a non-number breath and a malformed reading', () => {
    const bad: Array<() => unknown> = [
      () => { throw new Error('boom'); },
      () => ({ state: 'diving', breath: NaN }),
      () => ({ state: 'diving', breath: '12' }),
      () => ({ state: 'diving' }),
      () => 'diving',
    ];
    for (const read of bad) {
      const m = make(read as never);
      expect(() => m.update()).not.toThrow();
      expect(m.visible).toBe(false);
    }
  });

  it('out-of-range breath clamps the fill', () => {
    const r: BreathReading = { state: 'diving', breath: 999 };
    const m = make(() => r);
    m.update();
    expect(fillOf(m).style.width).toBe('100%');
    r.breath = -5;
    m.update();
    expect(fillOf(m).style.width).toBe('0%');
  });

  it('writes the DOM only when the value changed, and dispose removes the element', () => {
    const r: BreathReading = { state: 'diving', breath: 20 };
    const m = make(() => r);
    const host = new StubDocument().createElement('div');
    host.append(m.element);
    m.update();
    fillOf(m).style.width = 'sentinel';
    m.update();
    expect(fillOf(m).style.width).toBe('sentinel');
    m.dispose();
    expect(host.children).toHaveLength(0);
  });

  it('labels itself', () => {
    expect(make().element.getAttribute('aria-label')).toBe('Breath');
  });
});
