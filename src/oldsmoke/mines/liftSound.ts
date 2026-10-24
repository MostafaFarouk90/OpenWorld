// The lift's ride cue: a low rumble with a creaking cage, synthesised like the rest of the placeholder sounds (no asset). It
// covers the fade to black while the ride exits one interior and enters the next, so the hold reads as a descent, not a load.
import { PLACEHOLDER_SAMPLE_RATE, samplesToWavUrl } from '../../audio/proceduralSounds';
import { bandpass, drive, highpass, hit, lowpass, noise, phasor, render, TAU } from '../../audio/sfxKit';

export const LIFT_RIDE_SOUND = 'sfx.oldsmoke.lift.ride';
export const LIFT_RIDE_SECONDS = 3.2;
/** The one-shot lift cues: the cage arriving, the call lever or bell at a landing, and the lift refusing. */
export const LIFT_ARRIVE_SOUND = 'sfx.oldsmoke.lift.arrive';
export const LIFT_CALL_SOUND = 'sfx.oldsmoke.lift.call';
export const LIFT_REFUSE_SOUND = 'sfx.oldsmoke.lift.refuse';
export const LIFT_CUE_KEYS = [LIFT_ARRIVE_SOUND, LIFT_CALL_SOUND, LIFT_REFUSE_SOUND] as const;
export type LiftCueKey = (typeof LIFT_CUE_KEYS)[number];

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

const LIFT_CUE_VOLUME: Readonly<Record<LiftCueKey, number>> = { [LIFT_ARRIVE_SOUND]: 0.7, [LIFT_CALL_SOUND]: 0.55, [LIFT_REFUSE_SOUND]: 0.5 };

/** A struck metal partial set: `partials` are [ratio, gain, decay per second]. */
function struck(t: number, f: number, partials: ReadonlyArray<readonly [number, number, number]>): number {
  let s = 0;
  for (const [r, g, d] of partials) s += Math.sin(TAU * f * r * t) * g * hit(t, d);
  return s;
}

/** Deterministic mono samples for a one-shot lift cue. */
export function liftCueSamples(key: LiftCueKey): Float32Array<ArrayBuffer> {
  switch (key) {
    case LIFT_ARRIVE_SOUND: {
      // The cage lands: an iron clunk, then the chain settling in a few falling links.
      const rnd = noise(141);
      const ph = phasor();
      const rum = lowpass(180);
      const link = bandpass(1200, 4200);
      return render(1.2, (t) => {
        const clunk = Math.sin(ph(95 - 40 * Math.min(1, t / 0.12))) * hit(t, 9) + struck(t, 210, [[1, 0.4, 12], [2.4, 0.25, 16]]);
        const chain = link(rnd()) * 3 * (hit(t - 0.18, 22) * (t > 0.18 ? 1 : 0) + 0.6 * hit(t - 0.34, 24) * (t > 0.34 ? 1 : 0) + 0.35 * hit(t - 0.52, 26) * (t > 0.52 ? 1 : 0));
        return drive(clunk * 1.1 + rum(rnd()) * 3 * hit(t, 7), 1.4) * 0.8 + chain * 0.35;
      });
    }
    case LIFT_CALL_SOUND: {
      // A lever thrown and a bell struck twice, far down the shaft.
      const rnd = noise(142);
      const tick = highpass(1800);
      return render(1.4, (t) => {
        const lever = tick(rnd()) * 2.2 * hit(t, 80);
        const bell = struck(t - 0.12, 660, [[1, 0.6, 3], [2.01, 0.3, 4.5], [2.76, 0.2, 6]]) * (t > 0.12 ? 1 : 0) + struck(t - 0.5, 660, [[1, 0.5, 3], [2.01, 0.25, 4.5], [2.76, 0.15, 6]]) * (t > 0.5 ? 1 : 0);
        return lever * 0.4 + bell * 0.4;
      });
    }
    case LIFT_REFUSE_SOUND: {
      // Denied: a dull clack of a dead catch, twice, with no ring.
      const rnd = noise(143);
      const clack = bandpass(300, 1800);
      const ph = phasor();
      return render(0.4, (t) => {
        const hits = hit(t, 70) + 0.7 * hit(t - 0.13, 70) * (t > 0.13 ? 1 : 0);
        return clack(rnd()) * 4 * hits * 0.6 + Math.sin(ph(120)) * 0.35 * hits;
      });
    }
  }
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

/**
 * The one-shot lift cues. Each key is rendered and registered on its first play (a no-op without Web Audio object URLs) and
 * then played; never throws, the lift works without sound.
 */
export function makeLiftCuePlayer(audio: LiftAudio | undefined): (key: LiftCueKey) => void {
  const registered = new Set<LiftCueKey>();
  return (key) => {
    if (!audio) return;
    try {
      if (!registered.has(key)) {
        if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return;
        audio.register(key, { src: [samplesToWavUrl(liftCueSamples(key))], format: ['wav'], volume: LIFT_CUE_VOLUME[key] });
        registered.add(key);
      }
      audio.play(key);
    } catch (err) {
      console.warn('oldsmoke: lift cue failed', err);
    }
  };
}
