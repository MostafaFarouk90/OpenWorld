// The Ashen Waste ambience bed body (L8, design 6.3): ash-hiss wind and creaking glass pillars, with a faint low wind
// rumble. `makeBedSamples` in AmbienceBed.ts allocates the buffer (loop plus fold tail), calls this to fill it, then folds
// the tail onto the head and normalises. The helpers are copies of AmbienceBed's private ones, so this file imports nothing.

const TAU = Math.PI * 2;

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return (s / 0xffffffff) * 2 - 1;
  };
}

function coef(hz: number, sr: number): number {
  return 1 - Math.exp((-2 * Math.PI * Math.min(hz, sr * 0.45)) / sr);
}

/** Loop length of the Waste bed in seconds (the other beds run 24 to 31 s). */
export const ASHEN_WASTE_BED_SECONDS = 30;

/** Adds the Ashen Waste bed to `x` (length `n` plus the fold tail). `seed` makes it deterministic. */
export function fillAshenWasteBed(x: Float32Array, n: number, sr: number, seed: number): void {
  const total = x.length;
  const r = rng(seed);
  const u = (): number => (r() + 1) / 2;

  // Ash-hiss wind: noise band-passed about 400 Hz to 5 kHz with slow gusts, grainy hiss above 4 kHz, a low rumble.
  let l1 = 0;
  let l2 = 0;
  let h1 = 0;
  let rum = 0;
  let grain = 1;
  const p1 = u() * TAU;
  const p2 = u() * TAU;
  const gustA = 7 + u() * 4;
  const gustB = 2.3 + u();
  const k1 = coef(400, sr);
  const k2 = coef(5000, sr);
  const kh = coef(4000, sr);
  const kr = coef(90, sr);
  const grainEvery = Math.max(1, Math.round(sr * 0.003));
  for (let i = 0; i < total; i++) {
    const t = i / sr;
    const gust = 0.5 + 0.5 * Math.sin((TAU * t) / gustA + p1);
    const flutter = 0.75 + 0.25 * Math.sin((TAU * t) / gustB + p2);
    const nz = r();
    l1 += k1 * (nz - l1);
    l2 += k2 * (nz - l2);
    h1 += kh * (nz - h1);
    rum += kr * (nz - rum);
    if (i % grainEvery === 0) grain = 0.4 + 0.6 * u();
    const band = (l2 - l1) * (0.45 + 1.4 * gust) * flutter * 2.4;
    const hiss = (nz - h1) * 0.22 * grain * (0.4 + 0.6 * gust);
    x[i] += band + hiss + rum * 5 * (0.6 + 0.4 * gust);
  }

  // Creaking glass: 4 to 7 slow-bending resonant partials per loop with a short rubbed onset, like pillars under strain.
  const creaks = 4 + Math.floor(u() * 4);
  for (let c = 0; c < creaks; c++) {
    const start = Math.floor(u() * n);
    const len = Math.round((1.2 + u() * 1.6) * sr);
    const f0 = 1200 + u() * 2300;
    const bend = (u() - 0.5) * 0.06;
    const partials = [1, 1.47 + u() * 0.1, 2.31 + u() * 0.15];
    const phases = partials.map(() => 0);
    let rub = 0;
    const kRub = coef(f0, sr);
    for (let i = 0; i < len && start + i < total; i++) {
      const q = i / len;
      const env = Math.min(1, q / 0.08) * (1 - q) ** 1.6;
      const f = f0 * (1 + bend * q);
      let s = 0;
      for (let p = 0; p < partials.length; p++) {
        phases[p] += (TAU * Math.min(f * partials[p], sr * 0.45)) / sr;
        s += Math.sin(phases[p]) / (p + 1);
      }
      rub += kRub * (r() - rub);
      x[start + i] += (s * 0.08 + rub * 0.15 * Math.exp(-q * 12)) * env;
    }
  }
}
