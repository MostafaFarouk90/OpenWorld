/**
 * Diegetic ambience beds: procedural looping buffers (wind in barley, Harrowmark's streets, the
 * Underways) that live outside the music mixer. They connect to a destination node (the master
 * gain), never the music bus, so music duck does not touch them. Region beds crossfade over 2 s;
 * interiors ramp over 0.4 s. Buffers are generated lazily, once per id.
 */

import { REGION_IDS, REGION_INFO, type RegionBedId } from '../region/regions';
import { fillAct2Bed } from './ambienceAct2';
import { isMineInterior } from './InteriorFx';

export type BedId = RegionBedId | 'underways';

export interface AmbienceContext {
  readonly currentTime: number;
  readonly sampleRate: number;
  createGain(): GainNode;
  createBiquadFilter(): BiquadFilterNode;
  createBuffer(channels: number, length: number, sampleRate: number): AudioBuffer;
  createBufferSource(): AudioBufferSourceNode;
}

const REGION_RAMP_SECONDS = 2;
const INTERIOR_RAMP_SECONDS = 0.4;
const INTERIOR_GAIN = 0.4;
const INTERIOR_CUTOFF = 600;
const OPEN_CUTOFF = 20000;
const PEAK = 0.7;
/** Tail of the loop that is folded back onto its head so the seam is continuous. */
const FOLD_SECONDS = 1;

/** Region beds come from the region registry (v0.6); A14 adds the Act 2 beds there. */
const REGION_BEDS: readonly BedId[] = [...new Set(REGION_IDS.map((id) => REGION_INFO[id].bed))].filter(
  (b): b is RegionBedId => b !== null,
);

/** The bed a region plays, or null (silence) for none or an unknown id. */
function bedFor(regionId: string | null): BedId | null {
  if (regionId === null || !Object.prototype.hasOwnProperty.call(REGION_INFO, regionId)) return null;
  return REGION_INFO[regionId as keyof typeof REGION_INFO].bed;
}
const LOOP_SECONDS: Readonly<Record<BedId, number>> = { brightwater: 24, harrowmark: 28, underways: 26, cinderreach: 25, oldsmoke: 27 };
const SEEDS: Readonly<Record<BedId, number>> = { brightwater: 0x1b2c3d, harrowmark: 0x4e5f60, underways: 0x717283, cinderreach: 0x2d3e4f, oldsmoke: 0x5a6b7c };

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return (s / 0xffffffff) * 2 - 1;
  };
}

/** One-pole low-pass coefficient for a cutoff in Hz. */
function coef(hz: number, sr: number): number {
  return 1 - Math.exp((-2 * Math.PI * Math.min(hz, sr * 0.45)) / sr);
}

/**
 * Deterministic mono bed of 20 to 30 s that loops without a click. Content is built over
 * length + FOLD, then the extra tail is cross-faded onto the head: the last sample is followed by
 * what really followed it in the source, so there is no seam. Hum is added after, on whole cycles.
 */
export function makeBedSamples(id: BedId, sampleRate: number): Float32Array<ArrayBuffer> {
  const sr = sampleRate;
  const n = Math.round(LOOP_SECONDS[id] * sr);
  const fold = Math.round(FOLD_SECONDS * sr);
  const total = n + fold;
  const x = new Float32Array(total);
  const r = rng(SEEDS[id]);
  const u = (): number => (r() + 1) / 2;
  const TAU = Math.PI * 2;
  const add = (start: number, len: number, f: (t: number, i: number) => number): void => {
    for (let i = 0; i < len && start + i < total; i++) x[start + i] += f(i / sr, i);
  };

  if (id === 'brightwater') {
    let a = 0;
    let b = 0;
    const p1 = u() * TAU;
    const p2 = u() * TAU;
    for (let i = 0; i < total; i++) {
      const t = i / sr;
      const gust = 0.5 + 0.5 * Math.sin(TAU * t / 7 + p1);
      const swell = 0.65 + 0.35 * Math.sin(TAU * t / 3.1 + p2);
      const k = coef(180 + 520 * gust, sr);
      a += k * (r() - a);
      b += k * (a - b);
      x[i] += b * swell * 5;
    }
    const chirps = 9 + Math.floor(u() * 4);
    for (let c = 0; c < chirps; c++) {
      const start = Math.floor(u() * n);
      const notes = 2 + Math.floor(u() * 3);
      const base = 2200 + u() * 1400;
      let at = start;
      for (let k = 0; k < notes; k++) {
        const len = Math.round((0.045 + u() * 0.03) * sr);
        const f0 = base * (1 + 0.1 * k);
        const f1 = f0 * (1.15 + u() * 0.2);
        let ph = 0;
        add(at, len, (_t, i) => {
          const q = i / len;
          ph += (TAU * Math.min(f0 + (f1 - f0) * q, sr * 0.45)) / sr;
          return Math.sin(ph) * Math.sin(Math.PI * q) * 0.22;
        });
        at += len + Math.round((0.03 + u() * 0.04) * sr);
      }
    }
  } else if (id === 'harrowmark') {
    // Crowd murmur: band-limited noise (difference of two low-passes) with drift and swells.
    let lo = 0;
    let hi = 0;
    const kLo = coef(350, sr);
    const kHi = coef(1400, sr);
    const phase = u() * TAU;
    const swells: Array<{ at: number; w: number; amp: number }> = [];
    for (let s = 0; s < 26; s++) swells.push({ at: u() * n, w: 0.08 + u() * 0.14, amp: 0.4 + u() * 0.6 });
    const sw = new Float32Array(total);
    for (const s of swells) {
      const cs = s.at; // a sample index (u() * n)
      const half = Math.round(s.w * 3 * sr);
      for (let i = Math.max(0, Math.floor(cs - half)); i < Math.min(total, cs + half); i++) {
        const d = (i - cs) / sr / s.w;
        sw[i] += s.amp * Math.exp(-d * d);
      }
    }
    for (let i = 0; i < total; i++) {
      const t = i / sr;
      lo += kLo * (r() - lo);
      hi += kHi * (r() - hi);
      const drift = 0.55 + 0.25 * Math.sin(TAU * t / 9 + phase) + 0.1 * Math.sin(TAU * t / 3.7);
      x[i] += (hi - lo) * 5 * (drift + 0.7 * sw[i]);
    }
    // Forge Row: clusters of 3 or 4 irregular hammer taps.
    for (let c = 0; c < 6; c++) {
      let at = Math.floor((c + 0.2 + u() * 0.6) * (n / 6));
      const taps = 3 + Math.floor(u() * 2);
      const pitch = 0.85 + u() * 0.3;
      for (let k = 0; k < taps; k++) {
        const amp = 0.45 + u() * 0.35;
        const len = Math.round(0.3 * sr);
        add(at, len, (t) => {
          const env = Math.exp(-t * 24);
          const tone = Math.sin(TAU * Math.min(1120 * pitch, sr * 0.45) * t) + 0.6 * Math.sin(TAU * Math.min(1790 * pitch, sr * 0.45) * t);
          return amp * env * (0.5 * tone + 0.5 * r() * Math.exp(-t * 40));
        });
        at += Math.round((0.18 + u() * 0.3) * sr);
      }
    }
    // Banner flutter: fast, band-passed noise bursts.
    for (let f = 0; f < 9; f++) {
      const start = Math.floor(u() * n);
      const len = Math.round((0.5 + u() * 0.7) * sr);
      const rate = 11 + u() * 8;
      let l1 = 0;
      let l2 = 0;
      const k1 = coef(900, sr);
      const k2 = coef(3000, sr);
      add(start, len, (t, i) => {
        const nz = r();
        l1 += k1 * (nz - l1);
        l2 += k2 * (nz - l2);
        const env = Math.sin((Math.PI * i) / len) * (0.5 + 0.5 * Math.sin(TAU * rate * t)) ** 2;
        return (l2 - l1) * 2.2 * env;
      });
    }
  } else if (id === 'cinderreach' || id === 'oldsmoke') {
    fillAct2Bed(id, x, n, sr, SEEDS[id]);
  } else {
    // Dripping water: sparse decaying sine pings, some with a quieter echo.
    const drips = 15 + Math.floor(u() * 5);
    for (let d = 0; d < drips; d++) {
      const start = Math.floor(u() * n);
      const f = Math.min(550 + u() * 1300, sr * 0.45);
      const amp = 0.3 + u() * 0.4;
      const echo = u() < 0.5 ? Math.round((0.18 + u() * 0.2) * sr) : 0;
      const len = Math.round(0.6 * sr);
      const ping = (g: number) => (t: number): number => {
        const chirp = f * (1 + 0.25 * Math.exp(-t * 30));
        return g * amp * Math.exp(-t * 9) * Math.min(1, t * 800) * Math.sin(TAU * chirp * t);
      };
      add(start, len, ping(1));
      if (echo) add(start + echo, len, ping(0.35));
    }
  }

  // Fold the tail onto the head (linear: s + c = 1).
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (i < fold) {
      const s = i / fold;
      out[i] = x[i] * s + x[n + i] * (1 - s);
    } else {
      out[i] = x[i];
    }
  }

  let peak = 1e-9;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]));
  const scale = (id === 'underways' ? PEAK * 0.7 : PEAK) / peak;
  for (let i = 0; i < n; i++) out[i] *= scale;

  if (id === 'underways') {
    // Whole cycles over the loop, so the hum and its beating wrap exactly.
    const dur = n / sr;
    const cyc = (hz: number): number => Math.max(1, Math.round(hz * dur)) / dur;
    const f1 = cyc(50);
    const f2 = cyc(50.7);
    const f3 = cyc(100.3);
    const beat = cyc(0.25);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const hum = 0.1 * Math.sin(TAU * f1 * t) + 0.1 * Math.sin(TAU * f2 * t) + 0.04 * Math.sin(TAU * f3 * t) * (0.6 + 0.4 * Math.sin(TAU * beat * t));
      out[i] = Math.max(-1, Math.min(1, out[i] + hum));
    }
  }
  return out;
}

interface Bed {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

export class AmbienceBed {
  private readonly bus: GainNode;
  private readonly filter: BiquadFilterNode;
  private readonly buffers = new Map<BedId, AudioBuffer>();
  private readonly beds = new Map<BedId, Bed>();
  private readonly targets = new Map<BedId, number>();
  private readonly warned = new Set<string>();
  private busTarget = 1;
  private cutoffTarget = OPEN_CUTOFF;
  private failed = false;
  private disposed = false;
  private regionId: string | null = null;
  private interiorId: string | null = null;

  private constructor(
    private readonly ctx: AmbienceContext,
    private readonly destination: AudioNode,
  ) {
    this.bus = ctx.createGain();
    this.bus.gain.value = 1;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = OPEN_CUTOFF;
    this.bus.connect(this.filter);
    this.filter.connect(destination);
  }

  /** Null without Web Audio nodes (headless): ambience is then a no-op. */
  static create(ctx: AmbienceContext, destination: AudioNode | null): AmbienceBed | null {
    if (!destination) return null;
    try {
      return new AmbienceBed(ctx, destination);
    } catch (err) {
      console.warn('Ambience: beds unavailable:', err);
      return null;
    }
  }

  get region(): string | null {
    return this.regionId;
  }

  get interior(): string | null {
    return this.interiorId;
  }

  /** `null` (corridor, unknown) is silence. The same id again changes nothing. */
  setRegion(regionId: string | null): void {
    if (this.disposed || regionId === this.regionId) return;
    this.regionId = regionId;
    if (regionId !== null && bedFor(regionId) === null && !this.warned.has(regionId)) {
      this.warned.add(regionId);
      console.warn(`Ambience: no bed for region "${regionId}"`);
    }
    this.apply(REGION_RAMP_SECONDS);
  }

  /** `underways` swaps to its own bed; any other interior muffles the region bed; `null` restores. */
  setInterior(interiorId: string | null): void {
    if (this.disposed || interiorId === this.interiorId) return;
    this.interiorId = interiorId;
    this.apply(INTERIOR_RAMP_SECONDS);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const bed of this.beds.values()) {
      try {
        bed.source.stop();
      } catch {
        /* already stopped */
      }
      for (const node of [bed.source, bed.gain]) this.safeDisconnect(node);
    }
    this.beds.clear();
    for (const node of [this.bus, this.filter]) this.safeDisconnect(node);
  }

  private safeDisconnect(node: AudioNode): void {
    try {
      node.disconnect();
    } catch {
      /* not connected */
    }
  }

  private apply(seconds: number): void {
    try {
      const inUnderways = this.interiorId === 'underways';
      // A mine keeps the Oldsmoke bed (drips and steam are already what it sounds like down there): no muffle.
      const muffled = this.interiorId !== null && !inUnderways && !isMineInterior(this.interiorId);
      for (const id of REGION_BEDS) this.setBed(id, bedFor(this.regionId) === id && !inUnderways ? 1 : 0, seconds);
      this.setBed('underways', inUnderways ? 1 : 0, seconds);
      const bus = muffled ? INTERIOR_GAIN : 1;
      if (bus !== this.busTarget) {
        this.busTarget = bus;
        this.ramp(this.bus.gain, bus, seconds);
      }
      const cutoff = muffled ? INTERIOR_CUTOFF : OPEN_CUTOFF;
      if (cutoff !== this.cutoffTarget) {
        this.cutoffTarget = cutoff;
        this.ramp(this.filter.frequency, cutoff, seconds);
      }
    } catch (err) {
      if (!this.failed) {
        this.failed = true;
        console.warn('Ambience: could not update beds:', err);
      }
    }
  }

  private setBed(id: BedId, target: number, seconds: number): void {
    const last = this.targets.get(id) ?? 0;
    if (target === last) return;
    const bed = this.beds.get(id) ?? (target > 0 ? this.startBed(id) : null);
    this.targets.set(id, target);
    if (bed) this.ramp(bed.gain.gain, target, seconds);
  }

  private startBed(id: BedId): Bed {
    let buffer = this.buffers.get(id);
    if (!buffer) {
      const data = makeBedSamples(id, this.ctx.sampleRate);
      buffer = this.ctx.createBuffer(1, data.length, this.ctx.sampleRate);
      buffer.copyToChannel(data, 0);
      this.buffers.set(id, buffer);
    }
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(gain);
    // Region beds share the interior low-pass; the underways bed goes straight to the destination.
    gain.connect(id === 'underways' ? this.destination : this.bus);
    source.start();
    const bed = { source, gain };
    this.beds.set(id, bed);
    return bed;
  }

  private ramp(param: AudioParam, target: number, seconds: number): void {
    const now = this.ctx.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(target, now + seconds);
  }
}
