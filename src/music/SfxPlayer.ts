import { PLACEHOLDER_SAMPLE_RATE, samplesToWavUrl } from '../audio/proceduralSounds';
import { BARE_SFX_IDS, SFX, SFX_IDS, SPELL_SFX_IDS, type BareSfxId, type SfxId, type SpellSfxId } from './sfxLayers';
import { sfxKey, sfxSeconds, SFX_VARIANTS, synthSfx } from './sfxSynth';

export interface SfxAudio {
  readonly isUnlocked: boolean;
  playAt(key: string, position: { x: number; y: number; z: number }): number | null;
  /** Non-positional one-shot (stings, UI-like sounds). */
  play(key: string): number | null;
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
  play(ids: readonly SfxId[], position: { x: number; y: number; z: number }, options: { variant?: number; minGapSeconds?: number } = {}): number {
    if (!this.audio.isUnlocked) return 0;
    const now = this.now();
    while (this.voiceEnds.length > 0 && this.voiceEnds[0] <= now) this.voiceEnds.shift();
    let started = 0;
    for (const id of ids) {
      const last = this.lastPlayed.get(id);
      if (last !== undefined && now - last < (options.minGapSeconds ?? this.minGap)) continue;
      if (this.voiceEnds.length >= this.maxVoices) continue;
      const variant =
        options.variant !== undefined
          ? ((Math.floor(options.variant) % SFX_VARIANTS) + SFX_VARIANTS) % SFX_VARIANTS
          : (this.variantCounter.get(id) ?? 0) % SFX_VARIANTS;
      if (options.variant === undefined) this.variantCounter.set(id, variant + 1);
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

  /**
   * Plays a bare-key one-shot (stings, the whistle, boss sounds). With a position it is spatial,
   * without it plays flat. Same rate limit, voice cap and never-throws rules as `play`.
   */
  playKey(key: BareSfxId | SpellSfxId, position?: { x: number; y: number; z: number }, minGapSeconds?: number): boolean {
    if (!this.audio.isUnlocked) return false;
    const now = this.now();
    while (this.voiceEnds.length > 0 && this.voiceEnds[0] <= now) this.voiceEnds.shift();
    const last = this.lastPlayed.get(key);
    if (last !== undefined && now - last < (minGapSeconds ?? this.minGap)) return false;
    if (this.voiceEnds.length >= this.maxVoices) return false;
    try {
      const id = position ? this.audio.playAt(key, position) : this.audio.play(key);
      if (id === null) return false;
    } catch (err) {
      console.warn(`Music: could not play ${key}:`, err);
      return false;
    }
    this.lastPlayed.set(key, now);
    this.voiceEnds.push(now + sfxSeconds(key));
    this.voiceEnds.sort((a, b) => a - b);
    return true;
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
  // Spell sounds, wardstone and boss sounds, stings and the whistle are played by bare key (by other
  // plugins as well as this one), so they are registered without a variant.
  for (const id of [...SPELL_SFX_IDS, ...BARE_SFX_IDS]) {
    audio.register(id, {
      src: [samplesToWavUrl(synthSfx(id, 1, PLACEHOLDER_SAMPLE_RATE))],
      format: ['wav'],
      volume,
      refDistance: 3,
    });
    keys.push(id);
  }
  // The slice 2 variant sounds also answer to their bare contract id for callers outside this plugin.
  for (const id of BARE_ALIASES) {
    audio.register(id, {
      src: [samplesToWavUrl(synthSfx(id, 1, PLACEHOLDER_SAMPLE_RATE))],
      format: ['wav'],
      volume,
      refDistance: 3,
    });
    keys.push(id);
  }
  return keys;
}

export const BARE_ALIASES: readonly SfxId[] = [SFX.releasePulse, SFX.yieldKneel, SFX.leap, SFX.companionBark];
