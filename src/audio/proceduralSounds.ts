// Generated placeholder sounds, so the audio system is demonstrable without shipping binary
// files. Everything here is synthesized at runtime and is ours to release as CC0. Real
// recordings replace these by registering URL sources instead.

const SAMPLE_RATE = 44100;

type SampleFn = (t: number, i: number) => number;

function render(seconds: number, fn: SampleFn): Float32Array<ArrayBuffer> {
  const out = new Float32Array(Math.round(seconds * SAMPLE_RATE));
  for (let i = 0; i < out.length; i++) out[i] = fn(i / SAMPLE_RATE, i);
  return out;
}

/** Deterministic noise so generated sounds are identical between runs. */
function noise(seed = 1): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return (s / 0xffffffff) * 2 - 1;
  };
}

/** Encodes mono samples as a 16-bit PCM WAV file. */
function encodeWav(samples: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}

function toWavUrl(samples: Float32Array): string {
  return URL.createObjectURL(new Blob([encodeWav(samples)], { type: 'audio/wav' }));
}

function toAudioBuffer(ctx: BaseAudioContext, samples: Float32Array<ArrayBuffer>): AudioBuffer {
  const buffer = ctx.createBuffer(1, samples.length, SAMPLE_RATE);
  buffer.copyToChannel(samples, 0);
  return buffer;
}

const TAU = Math.PI * 2;

/** Short metallic strike, used as a positional one-shot. */
export function clangUrl(): string {
  const rand = noise(7);
  return toWavUrl(
    render(0.6, (t) => {
      const env = Math.exp(-t * 9);
      const partials =
        Math.sin(TAU * 523 * t) + 0.6 * Math.sin(TAU * 1307 * t) + 0.4 * Math.sin(TAU * 2213 * t);
      return env * (0.35 * partials + 0.25 * rand() * Math.exp(-t * 60));
    }),
  );
}

/** Seamless crackling loop (campfire), used as a positional looping emitter. */
export function crackleLoopUrl(): string {
  const rand = noise(3);
  let pop = 0;
  let low = 0;
  return toWavUrl(
    render(2, () => {
      if (rand() > 0.9992) pop = 1;
      pop *= 0.995;
      low = low * 0.97 + rand() * 0.03;
      return 0.6 * low + 0.5 * pop * rand();
    }),
  );
}

/** Music stems share one tempo and length so they loop in lockstep: 90 BPM, 4 bars. */
const STEM_SECONDS = (60 / 90) * 16;

/** Rounds a frequency to a whole number of cycles per stem, so the loop seam does not click. */
function loopable(hz: number): number {
  return Math.round(hz * STEM_SECONDS) / STEM_SECONDS;
}

/** Ambient stem: a slow D-minor pad, every partial snapped to whole cycles per loop. */
export function ambientStem(ctx: BaseAudioContext): AudioBuffer {
  const chord = [146.83, 174.61, 220.0, 293.66].map(loopable);
  return toAudioBuffer(
    ctx,
    render(STEM_SECONDS, (t) => {
      const swell = 0.6 + 0.4 * Math.sin((TAU * t) / STEM_SECONDS);
      let s = 0;
      for (const f of chord) s += Math.sin(TAU * f * t) + 0.3 * Math.sin(TAU * f * 2 * t);
      return 0.07 * swell * s;
    }),
  );
}

/** Combat stem: a driving drum pulse over a low drone, layered on top of the ambient stem. */
export function combatStem(ctx: BaseAudioContext): AudioBuffer {
  const beat = 60 / 90 / 2; // eighth notes
  const rand = noise(11);
  const droneHz = loopable(73.42);
  return toAudioBuffer(
    ctx,
    render(STEM_SECONDS, (t) => {
      const step = Math.floor(t / beat);
      const local = t - step * beat;
      const kick = step % 4 === 0 ? Math.sin(TAU * (55 + 90 * Math.exp(-local * 30)) * local) * Math.exp(-local * 8) : 0;
      const hat = rand() * Math.exp(-local * 40) * 0.25;
      const drone = 0.15 * Math.sin(TAU * droneHz * t);
      return 0.5 * kick + hat + drone;
    }),
  );
}

/** A soft step on grass or earth: low-passed noise burst plus a faint low thump. Pure samples. */
function stepSamples(seconds: number, seed: number, pitch: number, thumpGain: number, decay: number, level: number): Float32Array<ArrayBuffer> {
  const rand = noise(seed);
  const alpha = 0.18 * pitch; // one-pole low-pass coefficient
  let low = 0;
  return render(seconds, (t) => {
    low += alpha * (rand() - low);
    const attack = Math.min(1, t / 0.003);
    const env = attack * Math.exp(-t * decay);
    const thump = Math.sin(TAU * 80 * pitch * t) * Math.exp(-t * decay * 0.9) * thumpGain;
    const s = level * (env * low * 2.2 + thump);
    return Math.max(-1, Math.min(1, s));
  });
}

/** ~0.12 s footstep samples. Variants differ in noise seed and slightly in pitch. */
export function footstepSamples(variant = 0): Float32Array<ArrayBuffer> {
  return stepSamples(0.12, 101 + variant * 37, 1 + 0.07 * (variant % 5), 0.25, 38, 0.8);
}

/** ~0.25 s landing thud: same recipe, longer and heavier. */
export function landSamples(): Float32Array<ArrayBuffer> {
  return stepSamples(0.25, 211, 0.85, 0.8, 18, 0.9);
}

export function footstepUrl(variant = 0): string {
  return toWavUrl(footstepSamples(variant));
}

export function landUrl(): string {
  return toWavUrl(landSamples());
}
