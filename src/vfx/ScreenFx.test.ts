import { describe, expect, it } from 'vitest';
import { ScreenFx } from './ScreenFx';

describe('ScreenFx', () => {
  it('is dark at low Burn, glows above 25 and turns red in Cinder', () => {
    const fx = new ScreenFx(null);
    fx.setBurn(10);
    expect(fx.state().intensity).toBe(0);
    fx.setBurn(30);
    expect(fx.state().intensity).toBeGreaterThan(0.1);
    expect(fx.state().color).toBe(0xff8a20);
    fx.setBurn(80);
    expect(fx.state().color).toBe(0xff2a10);
  });

  it('pulses decay to nothing and a paused update (dt 0) holds them', () => {
    const fx = new ScreenFx(null);
    fx.pulse(0.8, 0.2);
    expect(fx.state().intensity).toBeCloseTo(0.8);
    fx.update(0);
    expect(fx.state().intensity).toBeCloseTo(0.8);
    fx.update(0.1);
    expect(fx.state().intensity).toBeCloseTo(0.4);
    fx.update(0.2);
    expect(fx.state().intensity).toBe(0);
  });

  it('rejects bad pulses and bad burn values', () => {
    const fx = new ScreenFx(null);
    fx.pulse(NaN, 1);
    fx.pulse(1, 0);
    fx.pulse(-1, 1);
    fx.setBurn(NaN);
    expect(fx.state().intensity).toBe(0);
  });

  it('is headless safe and dispose is idempotent', () => {
    const fx = new ScreenFx(null);
    expect(fx.element).toBeNull();
    fx.update(1);
    fx.dispose();
    fx.dispose();
  });
});
