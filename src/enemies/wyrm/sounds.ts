import { PLACEHOLDER_SAMPLE_RATE } from '../../audio/proceduralSounds';

/**
 * Synthesized placeholder wyrm sounds (plans/act2-A6a.md 1.7): registered by `wyrm.plugin` as `sfx.wyrm.<key>` until
 * real recordings replace them (a recording is registered under the same key). Deterministic, mono, CC0.
 */
export type WyrmSoundKey = 'screech' | 'inhale' | 'roar' | 'chirp' | 'coo' | 'wingbeat';
export const WYRM_SOUND_KEYS: readonly WyrmSoundKey[] = ['screech', 'inhale', 'roar', 'chirp', 'coo', 'wingbeat'];

/** Volume per key (the wingbeat sits under the music; the roar fills the gallery). */
export const WYRM_SOUND_VOLUME: Readonly<Record<WyrmSoundKey, number>> = {
  screech: 0.7,
  inhale: 0.6,
  roar: 0.9,
  chirp: 0.5,
  coo: 0.35,
  wingbeat: 0.4,
};

const SR = PLACEHOLDER_SAMPLE_RATE;
const TAU = Math.PI * 2;

function noise(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return (s / 0xffffffff) * 2 - 1;
  };
}

/** A sweeping tone plus filtered noise under an attack and release envelope. */
function voice(
  seconds: number,
  seed: number,
  o: { f0: number; f1: number; tone: number; grit: number; attack: number; vibrato?: number; harmonics?: number },
): Float32Array<ArrayBuffer> {
  const n = Math.round(seconds * SR);
  const out = new Float32Array(n);
  const rnd = noise(seed);
  let phase = 0;
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const u = t / seconds;
    const f = o.f0 + (o.f1 - o.f0) * u + (o.vibrato ?? 0) * Math.sin(TAU * 6 * t);
    phase += (TAU * f) / SR;
    let s = 0;
    const h = o.harmonics ?? 3;
    for (let k = 1; k <= h; k++) s += Math.sin(phase * k) / k;
    lp += 0.2 * (rnd() - lp);
    const env = Math.min(1, t / o.attack) * Math.pow(1 - u, 1.5);
    out[i] = Math.max(-1, Math.min(1, env * (o.tone * s * 0.6 + o.grit * lp)));
  }
  return out;
}

export function wyrmSoundSamples(key: WyrmSoundKey): Float32Array<ArrayBuffer> {
  switch (key) {
    case 'screech':
      return voice(0.9, 11, { f0: 1400, f1: 700, tone: 0.8, grit: 0.6, attack: 0.03, vibrato: 60, harmonics: 5 });
    case 'inhale':
      return voice(0.7, 12, { f0: 120, f1: 260, tone: 0.15, grit: 1.4, attack: 0.5 });
    case 'roar':
      return voice(1.8, 13, { f0: 90, f1: 55, tone: 0.9, grit: 1.1, attack: 0.15, vibrato: 8, harmonics: 6 });
    case 'chirp':
      return voice(0.18, 14, { f0: 1800, f1: 2600, tone: 0.9, grit: 0.1, attack: 0.01 });
    case 'coo':
      return voice(0.45, 15, { f0: 520, f1: 440, tone: 0.8, grit: 0.05, attack: 0.08, vibrato: 25 });
    case 'wingbeat': {
      // A soft whump: low-passed noise burst.
      const n = Math.round(0.3 * SR);
      const out = new Float32Array(n);
      const rnd = noise(16);
      let lp = 0;
      for (let i = 0; i < n; i++) {
        const t = i / SR;
        lp += 0.05 * (rnd() - lp);
        out[i] = Math.max(-1, Math.min(1, lp * 6 * Math.min(1, t / 0.04) * Math.exp(-t * 12)));
      }
      return out;
    }
  }
}
