/**
 * Gain the Web Audio 'exponential' distance model applies at `distance`:
 * (max(distance, ref) / ref) ^ -rolloff. Matches what PannerNode does with our AUDIO settings, so
 * gameplay code can tell whether a sound would be audible without playing it.
 */
export function exponentialGain(distance: number, refDistance: number, rolloffFactor: number): number {
  if (!(refDistance > 0)) throw new RangeError(`refDistance must be positive, got ${refDistance}`);
  return Math.pow(Math.max(distance, refDistance) / refDistance, -rolloffFactor);
}
