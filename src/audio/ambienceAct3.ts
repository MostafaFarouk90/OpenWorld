// Ambience bed bodies for the Act 3 regions (K14): Greyfen's reeds, frogs, drips and mist, and Dragonspine's high
// wind, snow creak and distant wing-beats. `makeBedSamples` in AmbienceBed.ts allocates the buffer (loop plus fold
// tail), calls this to fill it, then folds the tail onto the head and normalises.
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
export function fillAct3Bed(id: 'greyfen' | 'dragonspine', x: Float32Array, n: number, sr: number, seed: number): void {
  const total = x.length;
  const r = rng(seed);
  const u = (): number => (r() + 1) / 2;
  const add = (start: number, len: number, f: (t: number, i: number) => number): void => {
    for (let i = 0; i < len && start + i < total; i++) x[start + i] += f(i / sr, i);
  };

  if (id === 'greyfen') {
    // Reed rustle: band-passed noise (about 300 to 1800 Hz) with slow gusts, plus a faint mist hiss above it.
    let l1 = 0;
    let l2 = 0;
    let m1 = 0;
    let m2 = 0;
    const p1 = u() * TAU;
    const p2 = u() * TAU;
    const k1 = coef(300, sr);
    const k2 = coef(1800, sr);
    const km1 = coef(2500, sr);
    const km2 = coef(3600, sr);
    for (let i = 0; i < total; i++) {
      const t = i / sr;
      const gust = 0.5 + 0.5 * Math.sin((TAU * t) / 9.1 + p1);
      const flutter = 0.7 + 0.3 * Math.sin((TAU * t) / 2.9 + p2);
      const nz = r();
      l1 += k1 * (nz - l1);
      l2 += k2 * (nz - l2);
      m1 += km1 * (nz - m1);
      m2 += km2 * (nz - m2);
      x[i] += (l2 - l1) * (0.5 + 1.6 * gust) * flutter * 3 + (m2 - m1) * 0.35;
    }
    // Frog choruses: a few small groups of pulsed nasal buzzes, two species at different pitches.
    const choruses = 6 + Math.floor(u() * 3);
    for (let c = 0; c < choruses; c++) {
      const species = c % 2;
      const f0 = species === 0 ? 220 + u() * 40 : 480 + u() * 60;
      const calls = 2 + Math.floor(u() * 4);
      let at = Math.floor(u() * n);
      for (let k = 0; k < calls; k++) {
        const pulses = species === 0 ? 4 + Math.floor(u() * 3) : 2 + Math.floor(u() * 2);
        const rate = species === 0 ? 28 : 16;
        const len = Math.round((pulses / rate + 0.05) * sr);
        const amp = 0.2 + u() * 0.2;
        let ph = 0;
        let lp = 0;
        const kl = coef(species === 0 ? 900 : 1500, sr);
        add(at, len, (t) => {
          ph += (TAU * f0 * (1 + 0.08 * Math.exp(-t * 8))) / sr;
          const saw = ((ph / TAU) % 1) * 2 - 1;
          lp += kl * (saw - lp);
          const pulse = 0.5 + 0.5 * Math.sin(TAU * rate * t - Math.PI / 2);
          return lp * pulse * Math.min(1, t * 200) * Math.min(1, (len / sr - t) * 100) * amp * 2;
        });
        at += len + Math.round((0.15 + u() * 0.3) * sr);
      }
    }
    // Drips.
    const drips = 14 + Math.floor(u() * 6);
    for (let d = 0; d < drips; d++) {
      const start = Math.floor(u() * n);
      const f = Math.min(400 + u() * 900, sr * 0.45);
      const amp = 0.2 + u() * 0.3;
      add(start, Math.round(0.5 * sr), (t) => amp * Math.exp(-t * 11) * Math.min(1, t * 800) * Math.sin(TAU * f * (1 + 0.3 * Math.exp(-t * 35)) * t));
    }
    // Bubbling plops from the mud: short rising blips, sometimes two or three in a row.
    const plops = 5 + Math.floor(u() * 4);
    for (let p = 0; p < plops; p++) {
      let at = Math.floor(u() * n);
      const reps = 1 + Math.floor(u() * 3);
      for (let k = 0; k < reps; k++) {
        const f = 140 + u() * 160;
        const amp = 0.3 + u() * 0.3;
        add(at, Math.round(0.18 * sr), (t) => amp * Math.exp(-t * 22) * Math.min(1, t * 600) * Math.sin(TAU * f * (1 + 2.5 * t) * t));
        at += Math.round((0.12 + u() * 0.15) * sr);
      }
    }
    return;
  }

  // Dragonspine: high wind with gust whistles, snow creak and distant wing-beats.
  let a = 0;
  let b = 0;
  let w1 = 0;
  let w2 = 0;
  const p1 = u() * TAU;
  const p2 = u() * TAU;
  const kw1 = coef(900, sr);
  const kw2 = coef(2200, sr);
  for (let i = 0; i < total; i++) {
    const t = i / sr;
    const gust = 0.5 + 0.5 * Math.sin((TAU * t) / 7.7 + p1);
    const swell = 0.6 + 0.4 * Math.sin((TAU * t) / 3.3 + p2);
    const k = coef(300 + 1000 * gust, sr);
    const nz = r();
    a += k * (nz - a);
    b += k * (a - b);
    w1 += kw1 * (nz - w1);
    w2 += kw2 * (nz - w2);
    x[i] += b * swell * 4 + (w2 - w1) * 0.9 * gust * gust;
  }
  // Gust whistles: a thin band that glides in pitch with the gust.
  const whistles = 5 + Math.floor(u() * 3);
  for (let g = 0; g < whistles; g++) {
    const start = Math.floor(u() * n);
    const len = Math.round((1.2 + u() * 1.6) * sr);
    const f0 = 900 + u() * 900;
    const amp = 0.06 + u() * 0.06;
    let ph = 0;
    add(start, len, (_t, i) => {
      const q = i / len;
      ph += (TAU * f0 * (1 + 0.15 * Math.sin(Math.PI * q))) / sr;
      return Math.sin(ph) * amp * Math.sin(Math.PI * q) ** 2;
    });
  }
  // Snow creak: grainy crackle bursts of tiny, tightly spaced ticks.
  const creaks = 14;
  for (let c = 0; c < creaks; c++) {
    const at = Math.floor(u() * n);
    const grains = 8 + Math.floor(u() * 14);
    const centre = 1200 + u() * 1800;
    const kc = coef(centre, sr);
    for (let gI = 0; gI < grains; gI++) {
      const start = at + Math.round(u() * 0.25 * sr);
      const amp = 0.1 + u() * 0.2;
      let lp = 0;
      add(start, Math.round(0.012 * sr), (t) => {
        lp += kc * (r() - lp);
        return lp * amp * Math.exp(-t * 300) * 3;
      });
    }
  }
  // Distant wing-beats: three or four groups of low, slow thumps, heavily low-passed.
  const groups = 3 + Math.floor(u() * 2);
  for (let c = 0; c < groups; c++) {
    let at = Math.floor((c + 0.1 + u() * 0.7) * (n / groups));
    const beats = 3 + Math.floor(u() * 3);
    const gap = Math.round((0.7 + u() * 0.3) * sr);
    const f = 45 + u() * 20;
    const amp0 = 0.5 + u() * 0.3;
    for (let k = 0; k < beats; k++) {
      const amp = amp0 * (1 - 0.1 * k);
      let lp = 0;
      const kl = coef(120, sr);
      add(at, Math.round(0.6 * sr), (t) => {
        lp += kl * (r() * 0.3 - lp);
        return (amp * Math.sin(TAU * f * t) * 0.9 + lp * 3) * Math.exp(-t * 7) * Math.min(1, t * 40);
      });
      at += gap;
    }
  }
}
