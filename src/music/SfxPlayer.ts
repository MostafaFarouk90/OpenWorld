import { PLACEHOLDER_SAMPLE_RATE, samplesToWavUrl } from '../audio/proceduralSounds';
import { SFX_IDS, type SfxId } from './sfxLayers';
import { sfxKey, sfxSeconds, SFX_VARIANTS, synthSfx } from './sfxSynth';

export interface SfxAudio {
  readonly isUnlocked: boolean;
  playAt(key: string, position: { x: number; y: number; z: number }): number | null;
}

export interface SfxPlayerOptions {
  audio: SfxAudio;
  /** Seconds, monotonic; the audio clock or performance.now() / 1000. */
  now: () => number;
  /** Same id is dropped if requested again within this many seconds. */
  minGapSeconds?: number;
  maxVoices?: number;
}

/** Plays SFX layers positionally with a per-id rate limit and a voice cap. Never throws. */
export class SfxPlayer {
  private readonly audio: SfxAudio;
  private readonly now: () => number;
  private readonly minGap: number;
  private readonly maxVoices: number;
  private readonly lastPlayed = new Map<string, number>();
  private readonly voiceEnds: number[] = [];
  private readonly variantCounter = new Map<string, number>();

  constructor(options: SfxPlayerOptions) {
    this.audio = options.audio;
    this.now = options.now;
    this.minGap = options.minGapSeconds ?? 0.04;
    this.maxVoices = options.maxVoices ?? 12;
  }

  /** Returns the number of layers actually started. */
  play(ids: readonly SfxId[], position: { x: number; y: number; z: number }): number {
    if (!this.audio.isUnlocked) return 0;
    const now = this.now();
    while (this.voiceEnds.length > 0 && this.voiceEnds[0] <= now) this.voiceEnds.shift();
    let started = 0;
    for (const id of ids) {
      const last = this.lastPlayed.get(id);
      if (last !== undefined && now - last < this.minGap) continue;
      if (this.voiceEnds.length >= this.maxVoices) continue;
      const variant = (this.variantCounter.get(id) ?? 0) % SFX_VARIANTS;
      this.variantCounter.set(id, variant + 1);
      try {
        if (this.audio.playAt(sfxKey(id, variant), position) === null) continue;
      } catch (err) {
        console.warn(`Music: could not play ${id}:`, err);
        continue;
      }
      this.lastPlayed.set(id, now);
      this.voiceEnds.push(now + sfxSeconds(id));
      this.voiceEnds.sort((a, b) => a - b);
      started++;
    }
    return started;
  }
}

export interface SfxRegistrar {
  register(key: string, def: { src: string[]; format: string[]; volume: number; refDistance: number }): void;
}

/** Registers every placeholder SFX variant with the audio manager; returns the keys registered. */
export function registerPlaceholderSfx(audio: SfxRegistrar, volume = 0.8): string[] {
  const keys: string[] = [];
  for (const id of SFX_IDS) {
    for (let v = 0; v < SFX_VARIANTS; v++) {
      const key = sfxKey(id, v);
      audio.register(key, {
        src: [samplesToWavUrl(synthSfx(id, v, PLACEHOLDER_SAMPLE_RATE))],
        format: ['wav'],
        volume,
        refDistance: 3,
      });
      keys.push(key);
    }
  }
  return keys;
}
