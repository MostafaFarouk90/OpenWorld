/**
 * Interior ambience for the music bus: a generated reverb (convolver send) and a duck, set by
 * which interior the player is in. One slot, not a count: the same id again is a no-op, `null` is
 * outdoors. contracts/interiors-and-nav.md: one interior at a time, ids `chapel-vault` and later
 * `tilted-anvil`, `keep-hall`, `counting-house`, `archive`, `underways`.
 */

export interface InteriorPreset {
  /** Impulse response length in seconds. */
  seconds: number;
  /** Higher is darker (faster high-frequency decay). */
  damping: number;
  wet: number;
  /** Music bus gain while inside. */
  duck: number;
}

export const DEFAULT_INTERIOR_PRESET: InteriorPreset = { seconds: 1.4, damping: 0.5, wet: 0.35, duck: 0.75 };

export const INTERIOR_PRESETS: Readonly<Record<string, InteriorPreset>> = {
  'chapel-vault': { seconds: 1.4, damping: 0.5, wet: 0.35, duck: 0.75 },
  'tilted-anvil': { seconds: 0.7, damping: 0.7, wet: 0.2, duck: 0.8 },
  'keep-hall': { seconds: 1.0, damping: 0.45, wet: 0.3, duck: 0.8 },
  'counting-house': { seconds: 0.6, damping: 0.7, wet: 0.18, duck: 0.85 },
  archive: { seconds: 0.9, damping: 0.8, wet: 0.2, duck: 0.8 },
  underways: { seconds: 2.2, damping: 0.8, wet: 0.45, duck: 0.7 },
};

export function presetFor(interiorId: string): InteriorPreset {
  return Object.prototype.hasOwnProperty.call(INTERIOR_PRESETS, interiorId) ? INTERIOR_PRESETS[interiorId] : DEFAULT_INTERIOR_PRESET;
}

/** Deterministic decaying-noise impulse response (mono). */
export function makeImpulse(sampleRate: number, seconds: number, damping: number): Float32Array<ArrayBuffer> {
  const length = Math.max(1, Math.round(seconds * sampleRate));
  const out = new Float32Array(length);
  let s = 12345;
  let lp = 0;
  const alpha = Math.max(0.02, 1 - damping * 0.9);
  for (let i = 0; i < length; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const noise = (s / 0xffffffff) * 2 - 1;
    lp += alpha * (noise - lp);
    const t = i / length;
    out[i] = lp * (1 - t) ** 3 * Math.min(1, i / (0.004 * sampleRate));
  }
  return out;
}

export interface InteriorFxContext {
  readonly currentTime: number;
  readonly sampleRate: number;
  createGain(): GainNode;
  createConvolver(): ConvolverNode;
  createBuffer(channels: number, length: number, sampleRate: number): AudioBuffer;
}

const RAMP_SECONDS = 0.4;

export class InteriorFx {
  private readonly send: GainNode;
  private readonly convolver: ConvolverNode;
  private readonly wet: GainNode;
  private readonly irs = new Map<string, AudioBuffer>();
  private current: string | null = null;
  private disposed = false;

  /** `bus` is the music bus; `destination` receives the wet signal (the master gain). */
  private constructor(
    private readonly ctx: InteriorFxContext,
    private readonly bus: GainNode,
    destination: AudioNode,
  ) {
    this.send = ctx.createGain();
    this.send.gain.value = 1;
    this.convolver = ctx.createConvolver();
    this.wet = ctx.createGain();
    this.wet.gain.value = 0;
    bus.connect(this.send);
    this.send.connect(this.convolver);
    this.convolver.connect(this.wet);
    this.wet.connect(destination);
  }

  /** Null without Web Audio nodes (headless): the feature is then a no-op. */
  static create(ctx: InteriorFxContext, bus: GainNode | null, destination: AudioNode | null): InteriorFx | null {
    if (!bus || !destination) return null;
    try {
      return new InteriorFx(ctx, bus, destination);
    } catch (err) {
      console.warn('Music: interior reverb unavailable:', err);
      return null;
    }
  }

  get interiorId(): string | null {
    return this.current;
  }

  /** `null` is outdoors. The same id again changes nothing. */
  setInterior(id: string | null): void {
    if (this.disposed || id === this.current) return;
    this.current = id;
    const now = this.ctx.currentTime;
    const preset = id === null ? null : presetFor(id);
    if (id !== null && preset) {
      try {
        this.convolver.buffer = this.impulseFor(preset);
      } catch (err) {
        console.warn(`Music: could not build the reverb for "${id}":`, err);
      }
    }
    this.ramp(this.wet.gain, preset?.wet ?? 0, now);
    this.ramp(this.bus.gain, preset?.duck ?? 1, now);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.ramp(this.bus.gain, 1, this.ctx.currentTime, 0);
    for (const node of [this.send, this.convolver, this.wet]) node.disconnect();
  }

  private ramp(param: AudioParam, target: number, now: number, seconds = RAMP_SECONDS): void {
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(target, now + seconds);
  }

  private impulseFor(preset: InteriorPreset): AudioBuffer {
    // Presets that share seconds and damping share a buffer.
    const key = `${preset.seconds}:${preset.damping}`;
    let buffer = this.irs.get(key);
    if (!buffer) {
      const data = makeImpulse(this.ctx.sampleRate, preset.seconds, preset.damping);
      buffer = this.ctx.createBuffer(1, data.length, this.ctx.sampleRate);
      buffer.copyToChannel(data, 0);
      this.irs.set(key, buffer);
    }
    return buffer;
  }
}
