// Contracts v0.8 item 5: who decides the weather, as a pure function L3 builds on. In order:
//   1. holdClear wins (scenes, boss arenas, escort hand-ins);
//   2. forceStorm beats dialogue and the clock;
//   3. a dialogue holds the clock's next storm (or warning) until it ends, but never clears a forced storm or a storm
//      already running;
//   4. the clock.
import type { WeatherKind } from './types';

export interface WeatherInputs {
  /** What the clock says now. */
  clock: WeatherKind;
  /** Any `forceStorm` standing. */
  forced: boolean;
  /** Any `holdClear` standing. */
  held: boolean;
  /** A dialogue is open. */
  dialogue: boolean;
  /** The kind in force before this tick (a storm already running stays through a dialogue). */
  current: WeatherKind;
}

export function resolveWeather(i: WeatherInputs): WeatherKind {
  if (i.held) return 'clear';
  if (i.forced) return 'storm';
  if (i.dialogue) {
    // A dialogue never starts weather, but a storm (or its warning) already running carries on to its end.
    if (i.current === 'storm' && i.clock !== 'clear') return 'storm';
    if (i.current === 'warning' && i.clock === 'warning') return 'warning';
    if (i.current === 'storm' || i.current === 'warning') return i.clock === 'clear' ? 'clear' : i.current;
    return 'clear';
  }
  return i.clock;
}

/** True while a storm runs; false with no weather provider (every refusal hook reads this). */
export function isStorming(services: { get(id: 'weather'): { state(): { kind: WeatherKind } } | undefined }): boolean {
  try {
    return services.get('weather')?.state().kind === 'storm';
  } catch {
    return false;
  }
}
