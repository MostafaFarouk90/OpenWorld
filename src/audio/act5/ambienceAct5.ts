// The Sunforge Caldera ambience bed body (N8, design 6.3): a low sub-rumble, bubbling lava ("blup"s with a falling pitch),
// ember crackle and a faint far hammer ring. `makeBedSamples` in AmbienceBed.ts allocates the buffer (loop plus fold tail),
// calls this to fill it, then folds the tail onto the head and normalises. The helpers are copies of AmbienceBed's
// private ones, so this file imports nothing.

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

/** Loop length of the Caldera bed in seconds (the other beds run 24 to 31 s). */
export const CALDERA_BED_SECONDS = 28;

/** Adds the Caldera bed to `x` (length `n` plus the fold tail). `seed` makes it deterministic. */
export function fillCalderaBed(x: Float32Array, n: number, sr: number, seed: number): void {
  const total = x.length;
  const r = rng(seed);
  const u = (): number => (r() + 1) / 2;

  // Low rumble: noise low-passed near 70 Hz, swelling slowly, with a second slower swell and a little heat shimmer above.
  let rum = 0;
  let rum2 = 0;
  let shim = 0;
  const kr = coef(70, sr);
  const kr2 = coef(160, sr);
  const ks = coef(900, sr);
  const p1 = u() * TAU;
  const p2 = u() * TAU;
  for (let i = 0; i < total; i++) {
    const t = i / sr;
    const nz = r();
    rum += kr * (nz - rum);
    rum2 += kr2 * (nz - rum2);
    shim += ks * (nz - shim);
    const swell = 0.65 + 0.35 * Math.sin((TAU * t) / 9.3 + p1);
    const slow = 0.7 + 0.3 * Math.sin((TAU * t) / 4.1 + p2);
    x[i] += rum * 9 * swell + (rum2 - rum) * 2.2 * slow + (shim - rum2) * 0.35 * swell;
  }

  // Bubbling lava: 10 to 17 soft "blup"s, a short sine whose pitch falls, some followed by a small echo-blup.
  const blups = 10 + Math.floor(u() * 8);
  for (let b = 0; b < blups; b++) {
    const start = Math.floor(u() * n);
    const f0 = 140 + u() * 160;
    const len = Math.round((0.18 + u() * 0.16) * sr);
    const amp = 0.25 + u() * 0.35;
    const twin = u() < 0.4 ? Math.round((0.09 + u() * 0.08) * sr) : 0;
    for (const [off, gain] of twin ? ([[0, 1], [twin, 0.45]] as const) : ([[0, 1]] as const)) {
      let phase = 0;
      for (let i = 0; i < len && start + off + i < total; i++) {
        const q = i / len;
        phase += (TAU * f0 * (1 - 0.55 * q)) / sr;
        x[start + off + i] += Math.sin(phase) * Math.min(1, q * 25) * (1 - q) ** 2 * amp * gain;
      }
    }
  }

  // Ember crackle: sparse, quiet, bright ticks of high-passed noise.
  const ticks = 30 + Math.floor(u() * 20);
  let hp = 0;
  const kh = coef(2800, sr);
  for (let c = 0; c < ticks; c++) {
    const start = Math.floor(u() * n);
    const len = Math.round((0.004 + u() * 0.012) * sr);
    const amp = 0.1 + u() * 0.2;
    for (let i = 0; i < len && start + i < total; i++) {
      const nz = r();
      hp += kh * (nz - hp);
      x[start + i] += (nz - hp) * Math.exp((-6 * i) / len) * amp;
    }
  }

  // A far hammer, once a loop: a soft iron ring a long way off.
  const at = Math.floor((0.15 + 0.7 * u()) * n);
  const hz = 196 + u() * 40;
  const len = Math.round(2.4 * sr);
  for (let i = 0; i < len && at + i < total; i++) {
    const t = i / sr;
    const ring = Math.sin(TAU * hz * t) * 0.5 + Math.sin(TAU * hz * 2.76 * t) * 0.25 + Math.sin(TAU * hz * 5.4 * t) * 0.1;
    x[at + i] += ring * Math.exp(-t * 2.6) * Math.min(1, t * 400) * 0.1;
  }
}
