import { SFX, SFX_IDS, SPELL_SFX, type SfxId, type SpellSfxId } from './sfxLayers';

const TAU = Math.PI * 2;

export const SFX_VARIANTS = 3;

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return (s / 0xffffffff) * 2 - 1;
  };
}

interface Recipe {
  seconds: number;
  /** Builds the sample function for a variant (0..SFX_VARIANTS-1), a pitch factor and noise source. */
  voice(pitch: number, noise: () => number): (t: number) => number;
}

const lowpass = (alpha: number) => {
  let y = 0;
  return (x: number): number => (y += alpha * (x - y));
};
const bandHigh = () => {
  let prev = 0;
  return (x: number): number => {
    const out = x - prev;
    prev = x;
    return out;
  };
};

const RECIPES: Record<SfxId | SpellSfxId, Recipe> = {
  [SPELL_SFX.surgeCharge]: {
    seconds: 0.9,
    voice: (p, n) => {
      const lp = lowpass(0.2);
      return (t) => {
        const rise = 220 + 500 * (t / 0.9) ** 2; // a climbing ember hum
        const swell = Math.sin((Math.PI * t) / 0.9) ** 1.2;
        return swell * (Math.sin(TAU * rise * p * t) * 0.5 + Math.sin(TAU * rise * 1.5 * p * t) * 0.2 + lp(n()) * 0.5);
      };
    },
  },
  [SPELL_SFX.surgeRelease]: {
    seconds: 0.8,
    voice: (p, n) => {
      const lp = lowpass(0.35);
      return (t) =>
        (lp(n()) * 1.4 + Math.sin(TAU * (50 + 90 * Math.exp(-t * 14)) * p * t) * 1.0) * Math.exp(-t * 5) * Math.min(1, t / 0.004);
    },
  },
  [SPELL_SFX.rally]: {
    seconds: 1.1,
    voice: (p) => (t) => {
      const env = Math.min(1, t / 0.05) * Math.exp(-t * 2.2);
      const f = 196 * p; // a brass-like fifth with a slow swell
      return env * (Math.sin(TAU * f * t) * 0.45 + Math.sin(TAU * f * 1.5 * t) * 0.3 + Math.sin(TAU * f * 2 * t) * 0.2 + Math.sin(TAU * f * 3 * t) * 0.1);
    },
  },
  [SFX.swingLight]: {
    seconds: 0.22,
    voice: (p, n) => {
      const lp = lowpass(0.25 * p);
      return (t) => lp(n()) * Math.sin((Math.PI * t) / 0.22) ** 2 * 1.4;
    },
  },
  [SFX.swingHeavy]: {
    seconds: 0.34,
    voice: (p, n) => {
      const lp = lowpass(0.15 * p);
      return (t) => lp(n()) * Math.sin((Math.PI * t) / 0.34) ** 1.5 * 2;
    },
  },
  [SFX.impactFlesh]: {
    seconds: 0.2,
    voice: (p, n) => {
      const lp = lowpass(0.2);
      return (t) => (lp(n()) * 1.6 + Math.sin(TAU * 95 * p * t) * 0.6) * Math.exp(-t * 22) * Math.min(1, t / 0.002);
    },
  },
  [SFX.impactAsh]: {
    seconds: 0.35,
    voice: (p, n) => {
      const lp = lowpass(0.3);
      return (t) => (lp(n()) * 1.2 + Math.sin(TAU * 140 * p * t) * 0.25) * Math.exp(-t * 11) * Math.min(1, t / 0.004) * 0.9;
    },
  },
  [SFX.impactMetal]: {
    seconds: 0.4,
    voice: (p) => (t) =>
      (Math.sin(TAU * 1180 * p * t) * 0.45 + Math.sin(TAU * 1760 * p * t) * 0.3 + Math.sin(TAU * 2790 * p * t) * 0.2) *
      Math.exp(-t * 12) * Math.min(1, t / 0.001),
  },
  [SFX.impactWood]: {
    seconds: 0.18,
    voice: (p, n) => {
      const lp = lowpass(0.3);
      return (t) => (Math.sin(TAU * 220 * p * t) * 0.7 + lp(n()) * 0.8) * Math.exp(-t * 30) * Math.min(1, t / 0.001);
    },
  },
  [SFX.impactStraw]: {
    seconds: 0.25,
    voice: (p, n) => {
      const hp = bandHigh();
      const lp = lowpass(0.5 * p);
      return (t) => lp(hp(n())) * 2 * Math.exp(-t * 16) * Math.min(1, t / 0.004);
    },
  },
  [SFX.thump]: {
    seconds: 0.3,
    voice: (p) => (t) => Math.sin(TAU * (42 + 60 * Math.exp(-t * 25)) * p * t) * Math.exp(-t * 10) * 1.1,
  },
  [SFX.armourRing]: {
    seconds: 0.6,
    voice: (p) => (t) =>
      (Math.sin(TAU * 880 * p * t) * 0.4 + Math.sin(TAU * 1330 * p * t) * 0.3 + Math.sin(TAU * 2120 * p * t) * 0.15) *
      Math.exp(-t * 6) * Math.min(1, t / 0.002),
  },
  [SFX.block]: {
    seconds: 0.25,
    voice: (p, n) => {
      const lp = lowpass(0.35);
      return (t) => (Math.sin(TAU * 480 * p * t) * 0.5 + lp(n()) * 0.9) * Math.exp(-t * 20) * Math.min(1, t / 0.001);
    },
  },
  [SFX.parry]: {
    seconds: 0.45,
    voice: (p) => (t) =>
      (Math.sin(TAU * 1500 * p * t) * 0.5 + Math.sin(TAU * 2250 * p * t) * 0.3) * Math.exp(-t * 9) * Math.min(1, t / 0.001),
  },
};

export function sfxSeconds(id: SfxId | SpellSfxId): number {
  return RECIPES[id].seconds;
}

/** Placeholder one-shot samples; variants differ in pitch (±6%) and noise seed. */
export function synthSfx(id: SfxId | SpellSfxId, variant: number, sampleRate: number): Float32Array {
  const recipe = RECIPES[id];
  if (!recipe) throw new Error(`No placeholder synth for sound "${id}"`);
  if (!Number.isInteger(variant) || variant < 0 || variant >= SFX_VARIANTS) throw new Error(`Bad SFX variant ${variant}`);
  const pitch = 1 + (variant - 1) * 0.06;
  const seed = 1000 + [...SFX_IDS, ...Object.values(SPELL_SFX)].indexOf(id) * 31 + variant * 7;
  const fn = recipe.voice(pitch, rng(seed));
  const out = new Float32Array(Math.round(recipe.seconds * sampleRate));
  for (let i = 0; i < out.length; i++) {
    const fade = Math.min(1, (out.length - i) / (0.005 * sampleRate)); // no click at the end
    out[i] = Math.max(-1, Math.min(1, fn(i / sampleRate) * 0.7 * fade));
  }
  return out;
}

export function sfxKey(id: SfxId, variant: number): string {
  return `${id}#${variant}`;
}
