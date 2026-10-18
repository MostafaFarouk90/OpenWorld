import { AUDIO } from '../config/constants';

export type StemSource = string | AudioBuffer;

interface Stem {
  buffer: AudioBuffer;
  gain: GainNode;
  source: AudioBufferSourceNode | null;
}

/**
 * Vertical (multi-stem) music mixer. All stems start on the same AudioContext tick, so they stay
 * sample-locked while looping, and mix changes are scheduled on the audio clock with
 * linearRampToValueAtTime so crossfades are frame-accurate and click-free.
 */
export class StemMixer {
  private readonly stems = new Map<string, Stem>();
  /** Ids reserved by add() calls still fetching, so concurrent duplicates are rejected too. */
  private readonly pending = new Set<string>();
  private playing = false;
  private startTime: number | null = null;

  constructor(
    private readonly ctx: AudioContext,
    private readonly destination: AudioNode,
  ) {}

  /**
   * Adds a stem from a decoded buffer or a URL (fetched and decoded). Stems should share one
   * length. Rejects, without adding the stem, if the fetch fails or the data cannot be decoded.
   * A stem added while the mixer is playing joins at the next start().
   */
  async add(id: string, source: StemSource): Promise<void> {
    if (this.stems.has(id) || this.pending.has(id)) throw new Error(`Stem "${id}" is already added`);
    this.pending.add(id);
    let buffer: AudioBuffer;
    try {
      buffer = typeof source === 'string' ? await this.fetchAndDecode(id, source) : source;
    } finally {
      this.pending.delete(id);
    }
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.destination);
    this.stems.set(id, { buffer, gain, source: null });
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  /** Audio-clock time all stems started (or are scheduled to start) at; null while stopped. */
  get startedAt(): number | null {
    return this.startTime;
  }

  has(id: string): boolean {
    return this.stems.has(id);
  }

  /** Length in frames of a stem's buffer, or undefined for an unknown stem. */
  frames(id: string): number | undefined {
    return this.stems.get(id)?.buffer.length;
  }

  /**
   * Starts every stem at the same scheduled time with the given initial gains (stems not named are
   * silent). Calling it while the context is still suspended is safe: the start is scheduled on the
   * paused audio clock and becomes audible when the context resumes. A second call is a no-op.
   */
  start(mix: Record<string, number> = {}, delaySeconds = 0.05): void {
    if (this.playing) return;
    const when = this.ctx.currentTime + delaySeconds;
    for (const [id, stem] of this.stems) {
      stem.gain.gain.cancelScheduledValues(0);
      stem.gain.gain.setValueAtTime(mix[id] ?? 0, when);
      const source = this.ctx.createBufferSource();
      source.buffer = stem.buffer;
      source.loop = true;
      source.connect(stem.gain);
      source.start(when);
      stem.source = source;
    }
    this.playing = true;
    this.startTime = when;
  }

  stop(): void {
    for (const stem of this.stems.values()) {
      stem.source?.stop();
      stem.source?.disconnect();
      stem.source = null;
    }
    this.playing = false;
    this.startTime = null;
  }

  /** Stops playback and disconnects and forgets every stem. */
  dispose(): void {
    this.stop();
    for (const stem of this.stems.values()) stem.gain.disconnect();
    this.stems.clear();
  }

  /**
   * Ramps each named stem to its target gain over `rampSeconds` (spec: 0.4 s). Stems not named keep
   * their current level. A ramp interrupted mid-way starts from the current value, not a jump.
   *
   * With `endAt` (an audio time) the ramp ends exactly then: the gain holds its current value until
   * `endAt - rampSeconds` and ramps from there, so a fade planned for a bar line does not spread
   * over the whole wait. An `endAt` already too close starts the ramp now and ends at `now + ramp`.
   */
  setMix(mix: Record<string, number>, rampSeconds: number = AUDIO.stemCrossfadeSeconds, endAt?: number): void {
    const now = this.ctx.currentTime;
    const scheduled = endAt !== undefined && Number.isFinite(endAt) && endAt > now + rampSeconds;
    const end = scheduled ? (endAt as number) : now + rampSeconds;
    const rampStart = scheduled ? end - rampSeconds : now;
    for (const [id, target] of Object.entries(mix)) {
      const param = this.stems.get(id)?.gain.gain;
      if (!param) continue;
      param.cancelScheduledValues(now);
      param.setValueAtTime(param.value, now);
      if (rampStart > now) param.setValueAtTime(param.value, rampStart);
      param.linearRampToValueAtTime(target, end);
    }
  }

  /**
   * For a mixer started to begin at `at`: sets every stem silent now and exactly `mix` (0 if unnamed)
   * from `at`. Unlike `setMix` it keeps the hard entry on the bar line.
   */
  setMixAt(mix: Record<string, number>, at: number): void {
    const now = this.ctx.currentTime;
    for (const [id, stem] of this.stems) {
      const param = stem.gain.gain;
      param.cancelScheduledValues(now);
      param.setValueAtTime(0, now);
      param.setValueAtTime(mix[id] ?? 0, Math.max(now, at));
    }
  }

  /** Stops playback and forgets every stem, leaving the mixer ready to load another track. */
  clear(): void {
    this.stop();
    for (const stem of this.stems.values()) stem.gain.disconnect();
    this.stems.clear();
  }

  get stemCount(): number {
    return this.stems.size;
  }

  private async fetchAndDecode(id: string, url: string): Promise<AudioBuffer> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Stem "${id}": fetching ${url} failed with HTTP ${response.status}`);
    try {
      return await this.ctx.decodeAudioData(await response.arrayBuffer());
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new Error(`Stem "${id}": could not decode ${url}: ${reason}`, { cause: err });
    }
  }
}
