import type { WyrmPalette, WyrmPaletteId } from './palettes';

/** What one wyrm build looks like. Lengths are metres at `scale` 1 (the Ember Wyrm). */
export interface WyrmParams {
  /** Uniform size: 1 the Ember Wyrm (about 7 m nose to tail), 0.35 a wyrmling, 3 Orsk, 6 Ysmeryth. */
  scale: number;
  palette: WyrmPaletteId | WyrmPalette;
  /** Spine segments (design: 28; wyrmlings use fewer). */
  segments: number;
  /** Stub legs: full, small, or none. */
  legs: 'full' | 'small' | 'none';
  /** Dorsal spikes on every other segment. */
  spikes: boolean;
  /** A row of lit plates along the neck (Ysmeryth's crest; off in Act 2). */
  crest: boolean;
  /** Wing span multiplier (1 = the Ember Wyrm's 3.2 m per wing at scale 1). */
  wingspan: number;
  /** Seeds the small per-build variation (horn sweep, spike lengths). */
  seed: number;
  /**
   * Body height multiplier (1 = `headHeight`, the Ember Wyrm's stance): the standing head, and the body that
   * follows it, ride this much lower or higher. Orsk sits heavy at 0.62.
   */
  stance: number;
  /** Leg length multiplier on `legLength` (after the `legs: 'small'` cut). */
  legScale: number;
  /** Leg thickness multiplier on the bone radius. */
  legGirth: number;
  /**
   * Body form (Act 3, K6a): `land` the Act 2 build; `water` Hathren's: the dorsal spikes draw as a thin fin frill (pair it
   * with `legs: 'none'` and a short `wingspan` for fin-wings).
   */
  form: WyrmForm;
  /** Breath kind (Act 3, K6a): `flame` (fire and smoke) or `water` (spray and mist, design 10 row 29). */
  breath: WyrmBreath;
  /** An iron collar on the neck (Act 3, K6a: Skarl's drake). */
  collar: boolean;
}

export type WyrmForm = 'land' | 'water';
export type WyrmBreath = 'flame' | 'water';

/** Shape constants at scale 1. */
export const WYRM_SHAPE = {
  /** Spine length from the neck base to the tail tip. */
  bodyLength: 6.0,
  /** Deepest segment radius (the chest). */
  chestRadius: 0.42,
  headLength: 0.95,
  /** Head height above the feet when standing. */
  headHeight: 1.25,
  /** Head ahead of the root (the root is the chest's ground point). */
  headForward: 1.6,
  /** Wing length per side. */
  wingLength: 3.2,
  wingChord: 1.5,
  /** Chest segment (fraction of the spine) where the shoulders sit. */
  shoulderAt: 0.16,
  hipAt: 0.42,
  legLength: 0.75,
} as const;

export const DEFAULT_WYRM_PARAMS: Readonly<WyrmParams> = {
  scale: 1,
  palette: 'ember',
  segments: 28,
  legs: 'full',
  spikes: true,
  crest: false,
  wingspan: 1,
  seed: 1,
  stance: 1,
  legScale: 1,
  legGirth: 1,
  form: 'land',
  breath: 'flame',
  collar: false,
};

export function wyrmParams(over: Partial<WyrmParams> = {}): WyrmParams {
  const p = { ...DEFAULT_WYRM_PARAMS, ...over };
  if (!(p.scale > 0) || !Number.isFinite(p.scale)) throw new Error(`wyrm: bad scale ${p.scale}`);
  if (!Number.isInteger(p.segments) || p.segments < 4 || p.segments > 64) throw new Error(`wyrm: bad segment count ${p.segments}`);
  if (!(p.wingspan > 0)) throw new Error(`wyrm: bad wingspan ${p.wingspan}`);
  if (p.form !== 'land' && p.form !== 'water') throw new Error(`wyrm: bad form ${String(p.form)}`);
  if (p.breath !== 'flame' && p.breath !== 'water') throw new Error(`wyrm: bad breath ${String(p.breath)}`);
  for (const k of ['stance', 'legScale', 'legGirth'] as const) {
    if (!(p[k] > 0) || !Number.isFinite(p[k])) throw new Error(`wyrm: bad ${k} ${p[k]}`);
  }
  return p;
}

/** A tiny deterministic generator (mulberry32) for per-build variation. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Segment radius along the spine (0 = neck base, 1 = tail tip), relative to `chestRadius`: thin neck, deep chest, long taper. */
export function segmentProfile(u: number): number {
  const t = Math.min(1, Math.max(0, u));
  if (t < 0.12) return 0.55 + (t / 0.12) * 0.45;
  if (t < 0.38) return 1.0 - ((t - 0.12) / 0.26) * 0.12;
  const k = (t - 0.38) / 0.62;
  return 0.88 * (1 - k) + 0.12 * k;
}
