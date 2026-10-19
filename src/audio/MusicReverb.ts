/**
 * One shared reverb send on the music bus: four parallel feedback combs with a low-pass in each loop
 * (so the tail darkens as it fades), fed through two all-pass stages that blur the echoes. It is a
 * handful of delay lines and filters, so it costs a small fraction of a convolution of a long impulse
 * response; sound effects never pass through it. Indoors the interior's own convolver reverb takes
 * over and this send fades out (no double reverb).
 */

interface ReverbContext {
  readonly currentTime: number;
  createGain(): GainNode;
  createDelay(maxDelayTime?: number): DelayNode;
  createBiquadFilter(): BiquadFilterNode;
}

export interface MusicReverbConfig {
  /** Comb delay times in seconds; keep them mutually prime-ish so the tail does not ring. */
  delays: readonly number[];
  /** Seconds for the tail to fall 60 dB. */
  decaySeconds: number;
  /** Cutoff of the in-loop low-pass in Hz. */
  dampHz: number;
  /** Outdoor wet level (the bus signal is sent at this gain). */
  wet: number;
}

export const DEFAULT_MUSIC_REVERB: MusicReverbConfig = {
  delays: [0.0297, 0.0371, 0.0411, 0.0437],
  decaySeconds: 1.5,
  dampHz: 3800,
  wet: 0.16,
};

const RAMP_SECONDS = 0.4;

/** Loop gain that makes a comb of `delay` seconds decay 60 dB over `decaySeconds`. */
export function combFeedback(delay: number, decaySeconds: number): number {
  return 10 ** ((-3 * delay) / decaySeconds);
}

export class MusicReverb {
  private readonly nodes: AudioNode[] = [];
  private readonly send: GainNode;
  private readonly out: GainNode;
  private indoors = false;
  private disposed = false;

  private constructor(
    private readonly ctx: ReverbContext,
    private readonly bus: GainNode,
    destination: AudioNode,
    private readonly config: MusicReverbConfig,
  ) {
    const track = <T extends AudioNode>(n: T): T => {
      this.nodes.push(n);
      return n;
    };
    this.send = track(ctx.createGain());
    this.send.gain.value = 1;
    this.out = track(ctx.createGain());
    this.out.gain.value = config.wet;

    // Two all-pass stages blur the transients before the combs.
    const diffuseA = track(ctx.createBiquadFilter());
    diffuseA.type = 'allpass';
    diffuseA.frequency.value = 1100;
    diffuseA.Q.value = 0.8;
    const diffuseB = track(ctx.createBiquadFilter());
    diffuseB.type = 'allpass';
    diffuseB.frequency.value = 3300;
    diffuseB.Q.value = 0.8;
    // Keep the bass and kick out of the send: short combs would cut notches into them.
    const highpass = track(ctx.createBiquadFilter());
    highpass.type = 'highpass';
    highpass.frequency.value = 250;
    highpass.Q.value = -3.01;
    this.send.connect(highpass);
    highpass.connect(diffuseA);
    diffuseA.connect(diffuseB);

    const sum = track(ctx.createGain());
    sum.gain.value = 1 / Math.sqrt(config.delays.length);
    for (const delay of config.delays) {
      const line = track(ctx.createDelay(0.1));
      line.delayTime.value = delay;
      const damp = track(ctx.createBiquadFilter());
      damp.type = 'lowpass';
      damp.frequency.value = config.dampHz;
      damp.Q.value = -3.01; // dB for a low-pass: Butterworth, no resonant peak, so the loop gain never exceeds the feedback
      const feedback = track(ctx.createGain());
      feedback.gain.value = combFeedback(delay, config.decaySeconds);
      diffuseB.connect(line);
      line.connect(damp);
      damp.connect(feedback);
      feedback.connect(line);
      damp.connect(sum);
    }
    // A last gentle low-pass keeps the tail from hissing.
    const tone = track(ctx.createBiquadFilter());
    tone.type = 'lowpass';
    tone.frequency.value = 6500;
    tone.Q.value = -3.01;
    sum.connect(tone);
    tone.connect(this.out);
    this.out.connect(destination);
    // Last, so a failure while building leaves the live bus untouched.
    bus.connect(this.send);
  }

  /** Null when the context cannot build the nodes (headless): the feature is then a no-op. */
  static create(
    ctx: ReverbContext,
    bus: GainNode | null,
    destination: AudioNode | null,
    config: MusicReverbConfig = DEFAULT_MUSIC_REVERB,
  ): MusicReverb | null {
    if (!bus || !destination) return null;
    try {
      return new MusicReverb(ctx, bus, destination, config);
    } catch (err) {
      console.warn('Music: shared reverb unavailable:', err);
      return null;
    }
  }

  /** The interior's own reverb takes over indoors: this send fades out, and back in outdoors. */
  setIndoors(indoors: boolean): void {
    if (this.disposed || indoors === this.indoors) return;
    this.indoors = indoors;
    const now = this.ctx.currentTime;
    const param = this.out.gain;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(indoors ? 0 : this.config.wet, now + RAMP_SECONDS);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    try {
      this.bus.disconnect(this.send);
    } catch {
      /* already disconnected */
    }
    for (const node of this.nodes) node.disconnect();
  }
}
