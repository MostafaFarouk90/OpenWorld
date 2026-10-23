// The lift's ride cue: a low rumble with a creaking cage, synthesised like the rest of the placeholder sounds (no asset). It
// covers the fade to black while the ride exits one interior and enters the next, so the hold reads as a descent, not a load.
import { PLACEHOLDER_SAMPLE_RATE, samplesToWavUrl } from '../../audio/proceduralSounds';

export const LIFT_RIDE_SOUND = 'sfx.oldsmoke.lift.ride';
export const LIFT_RIDE_SECONDS = 3.2;

/** Deterministic: the same samples every run. Mono, within [-1, 1]. */
export function liftRideSamples(rate = PLACEHOLDER_SAMPLE_RATE): Float32Array<ArrayBuffer> {
  const out = new Float32Array(Math.round(LIFT_RIDE_SECONDS * rate));
  let seed = 0x1f7a;
  const rand = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296 - 0.5;
  };
  let low = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / rate;
    // Swell in, hold, die away as the cage settles.
    const env = Math.min(1, t / 0.4) * Math.min(1, (LIFT_RIDE_SECONDS - t) / 0.9);
    low += 0.04 * (rand() * 2 - low);
    const creak = Math.sin(2 * Math.PI * (88 - 14 * t) * t + 3 * Math.sin(2 * Math.PI * 5.5 * t)) * (0.5 + 0.5 * Math.sin(2 * Math.PI * 1.7 * t));
    out[i] = env * (0.9 * low + 0.18 * creak);
  }
  return out;
}

export interface LiftAudio {
  register(key: string, def: { src: string[]; format: string[]; volume?: number }): void;
  play(key: string): number | null;
}

/** Registers the cue once (a no-op without Web Audio object URLs) and plays it; never throws, the ride works without sound. */
export function makeLiftRidePlayer(audio: LiftAudio | undefined): () => void {
  let registered = false;
  return () => {
    if (!audio) return;
    try {
      if (!registered) {
        if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return;
        audio.register(LIFT_RIDE_SOUND, { src: [samplesToWavUrl(liftRideSamples())], format: ['wav'], volume: 0.7 });
        registered = true;
      }
      audio.play(LIFT_RIDE_SOUND);
    } catch (err) {
      console.warn('oldsmoke: lift ride sound failed', err);
    }
  };
}
