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
   */
  setMix(mix: Record<string, number>, rampSeconds: number = AUDIO.stemCrossfadeSeconds): void {
    const now = this.ctx.currentTime;
    for (const [id, target] of Object.entries(mix)) {
      const param = this.stems.get(id)?.gain.gain;
      if (!param) continue;
      param.cancelScheduledValues(now);
      param.setValueAtTime(param.value, now);
      param.linearRampToValueAtTime(target, now + rampSeconds);
    }
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
