// v0.8 item 5: the weather precedence, over every combination of its inputs.
import { describe, expect, it } from 'vitest';
import { isStorming, resolveWeather } from './precedence';
import type { WeatherKind } from './types';

const KINDS: WeatherKind[] = ['clear', 'warning', 'storm'];
const B = [false, true];

describe('resolveWeather', () => {
  const all: { clock: WeatherKind; current: WeatherKind; forced: boolean; held: boolean; dialogue: boolean }[] = [];
  for (const clock of KINDS) for (const current of KINDS) for (const forced of B) for (const held of B) for (const dialogue of B) all.push({ clock, current, forced, held, dialogue });

  it.each(all)('%o', (i) => {
    const out = resolveWeather(i);
    if (i.held) expect(out).toBe('clear');
    else if (i.forced) expect(out).toBe('storm');
    else if (!i.dialogue) expect(out).toBe(i.clock);
    else {
      // A dialogue never starts weather that was not already running.
      if (i.current === 'clear') expect(out).toBe('clear');
      // It never makes weather the clock has ended.
      if (i.clock === 'clear') expect(out).toBe('clear');
      // A running storm carries on while the clock still has weather.
      if (i.current === 'storm' && i.clock !== 'clear') expect(out).toBe('storm');
      // A warning waits: the clock's storm is held back while the dialogue lasts.
      if (i.current === 'warning' && i.clock === 'storm') expect(out).toBe('warning');
    }
  });

  it('holdClear beats forceStorm', () => {
    expect(resolveWeather({ clock: 'storm', current: 'storm', forced: true, held: true, dialogue: false })).toBe('clear');
  });
  it('forceStorm beats a dialogue and a clear clock', () => {
    expect(resolveWeather({ clock: 'clear', current: 'clear', forced: true, held: false, dialogue: true })).toBe('storm');
  });
});

describe('isStorming', () => {
  it('is false with no provider and when the provider throws', () => {
    expect(isStorming({ get: () => undefined })).toBe(false);
    expect(isStorming({ get: () => ({ state: () => { throw new Error('x'); } }) })).toBe(false);
  });
  it('reads the provider', () => {
    expect(isStorming({ get: () => ({ state: () => ({ kind: 'storm' as const }) }) })).toBe(true);
    expect(isStorming({ get: () => ({ state: () => ({ kind: 'warning' as const }) }) })).toBe(false);
  });
});
