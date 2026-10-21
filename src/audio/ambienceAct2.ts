// Ambience bed bodies for the Act 2 regions (A14): Cinderreach's hill wind, ember crackle and sheep, and
// Oldsmoke's drips, steam vents and distant hammering. `makeBedSamples` in AmbienceBed.ts allocates the buffer
// (loop plus fold tail), calls this to fill it, then folds the tail onto the head and normalises.
// The two small helpers are copies of AmbienceBed's private ones, so this file imports nothing from it.

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

/** Adds the bed `id` to `x` (length `n` plus the fold tail). `seed` makes it deterministic. */
export function fillAct2Bed(id: 'cinderreach' | 'oldsmoke', x: Float32Array, n: number, sr: number, seed: number): void {
  const total = x.length;
  const r = rng(seed);
  const u = (): number => (r() + 1) / 2;
  const add = (start: number, len: number, f: (t: number, i: number) => number): void => {
    for (let i = 0; i < len && start + i < total; i++) x[start + i] += f(i / sr, i);
  };

  if (id === 'cinderreach') {
    // Hill wind: low-passed noise with slow gusts, a thinner whistle band riding the gusts.
    let a = 0;
    let b = 0;
    let w = 0;
    const p1 = u() * TAU;
    const p2 = u() * TAU;
    const kw = coef(1500, sr);
    for (let i = 0; i < total; i++) {
      const t = i / sr;
      const gust = 0.5 + 0.5 * Math.sin((TAU * t) / 8.3 + p1);
      const swell = 0.6 + 0.4 * Math.sin((TAU * t) / 3.7 + p2);
      const k = coef(160 + 700 * gust, sr);
      const nz = r();
      a += k * (nz - a);
      b += k * (a - b);
      w += kw * (nz - w);
      x[i] += b * swell * 5 + (nz - w) * 0.02 * gust * gust;
    }
    // Ember seams: tiny crackles in short clusters, a few louder pops.
    const clusters = 16;
    for (let c = 0; c < clusters; c++) {
      const at = Math.floor(u() * n);
      const pops = 3 + Math.floor(u() * 6);
      for (let p = 0; p < pops; p++) {
        const start = at + Math.round(u() * 0.4 * sr);
        const amp = 0.15 + u() * (u() < 0.15 ? 0.8 : 0.3);
        let lp = 0;
        const k = coef(2500 + u() * 3000, sr);
        add(start, Math.round(0.03 * sr), (t) => {
          lp += k * (r() - lp);
          return lp * amp * Math.exp(-t * 130) * 3;
        });
      }
    }
    // Sheep: a handful of distant bleats, a nasal buzz that glides down and wobbles.
    const bleats = 4 + Math.floor(u() * 3);
    for (let s = 0; s < bleats; s++) {
      const start = Math.floor(u() * n);
      const f0 = 330 + u() * 120;
      const len = Math.round((0.5 + u() * 0.3) * sr);
      let ph = 0;
      let lp = 0;
      const k = coef(1400, sr);
      add(start, len, (t, i) => {
        const q = i / len;
        ph += (TAU * f0 * (1.12 - 0.22 * q) * (1 + 0.05 * Math.sin(TAU * 26 * t))) / sr;
        const saw = ((ph / TAU) % 1) * 2 - 1;
        lp += k * (saw - lp);
        return lp * Math.sin(Math.PI * q) ** 1.5 * 0.35;
      });
    }
    return;
  }

  // Oldsmoke: drips, steam vents and distant hammering.
  const drips = 18 + Math.floor(u() * 6);
  for (let d = 0; d < drips; d++) {
    const start = Math.floor(u() * n);
    const f = Math.min(500 + u() * 1200, sr * 0.45);
    const amp = 0.25 + u() * 0.35;
    const echo = u() < 0.5 ? Math.round((0.2 + u() * 0.25) * sr) : 0;
    const len = Math.round(0.6 * sr);
    const ping = (g: number) => (t: number): number => g * amp * Math.exp(-t * 9) * Math.min(1, t * 800) * Math.sin(TAU * f * (1 + 0.25 * Math.exp(-t * 30)) * t);
    add(start, len, ping(1));
    if (echo) add(start + echo, len, ping(0.35));
  }
  // Steam vents: band-passed hiss that swells and dies over a couple of seconds.
  for (let v = 0; v < 5; v++) {
    const start = Math.floor(u() * n);
    const len = Math.round((1.4 + u() * 1.8) * sr);
    const centre = 2400 + u() * 2200;
    let l1 = 0;
    let l2 = 0;
    const k1 = coef(centre * 0.6, sr);
    const k2 = coef(centre * 1.5, sr);
    add(start, len, (_t, i) => {
      const nz = r();
      l1 += k1 * (nz - l1);
      l2 += k2 * (nz - l2);
      const q = i / len;
      return (l2 - l1) * 2.4 * Math.sin(Math.PI * q) ** 2;
    });
  }
  // Distant hammering: clusters of dull taps, heavily low-passed.
  for (let c = 0; c < 5; c++) {
    let at = Math.floor((c + 0.2 + u() * 0.6) * (n / 5));
    const taps = 3 + Math.floor(u() * 3);
    const pitch = 0.8 + u() * 0.3;
    for (let k = 0; k < taps; k++) {
      const amp = 0.3 + u() * 0.3;
      add(at, Math.round(0.35 * sr), (t) => amp * Math.exp(-t * 18) * (Math.sin(TAU * 420 * pitch * t) * 0.6 + Math.sin(TAU * 1160 * pitch * t) * 0.3));
      at += Math.round((0.22 + u() * 0.35) * sr);
    }
  }
}
