import { describe, expect, it } from 'vitest';
import { LAVA_FLASH_S, LAVA_PULSE_GAP_S, LavaFlash } from './lavaCue';
import { ventCue } from './ventCue';

describe('ventCue', () => {
  const p = { x: 0, z: 0 };
  it('picks the nearest vent in range with its state, time and a bearing', () => {
    const v = ventCue(
      [
        { id: 'far', at: { x: 0, z: -19 }, state: 'closed', inS: 5 },
        { id: 'near', at: { x: 0, z: -10 }, state: 'open', inS: 3.2 },
      ],
      p,
      0,
    )!;
    expect(v).toMatchObject({ id: 'near', textKey: 'hud.vent.open', params: { s: 4 }, distance: 10 });
    expect(v.bearing).toBeCloseTo(0);
  });
  it('turns with the camera and handles untimed and closed vents', () => {
    const v = ventCue([{ id: 'e', at: { x: 10, z: 0 }, state: 'closed' }], p, 0)!;
    expect(v.textKey).toBe('hud.vent.closedNoTime');
    expect(v.bearing).toBeCloseTo(Math.PI / 2);
    // Facing -X (yaw +90) with the vent at +X: it is behind. Vent at -X: dead ahead.
    expect(Math.abs(ventCue([{ id: 'e', at: { x: 10, z: 0 }, state: 'closed' }], p, Math.PI / 2)!.bearing)).toBeCloseTo(Math.PI);
    expect(ventCue([{ id: 'w', at: { x: -10, z: 0 }, state: 'closed' }], p, Math.PI / 2)!.bearing).toBeCloseTo(0);
  });
  it('shows nothing with no list, out of range, or junk positions', () => {
    expect(ventCue(undefined, p, 0)).toBeNull();
    expect(ventCue([{ id: 'x', at: { x: 50, z: 0 }, state: 'open' }], p, 0)).toBeNull();
    expect(ventCue([{ id: 'x', at: { x: Number.NaN, z: 0 }, state: 'open' }], p, 0)).toBeNull();
  });
});

describe('LavaFlash', () => {
  it('pulses once a second at most and fades', () => {
    const f = new LavaFlash();
    expect(f.entered()).toBe(true);
    expect(f.strength).toBe(1);
    expect(f.entered()).toBe(false);
    f.tick(LAVA_FLASH_S);
    expect(f.strength).toBe(0);
    f.tick(LAVA_PULSE_GAP_S);
    expect(f.entered()).toBe(true);
  });
  it('reduced motion toasts without a vignette; reset clears', () => {
    const f = new LavaFlash();
    expect(f.entered(true)).toBe(true);
    expect(f.strength).toBe(0);
    f.reset();
    expect(f.entered()).toBe(true);
  });
});
