import { PROBE, type QualityStep } from '../vfx/tuning';
import type { QualityManager } from './QualityManager';

/** Bounded give-up so a frozen clock never keeps the probe collecting forever. */
export const PROBE_GIVE_UP_FRAMES = 6000;

function validFrame(ms: number): boolean {
  return Number.isFinite(ms) && ms > 0 && ms <= PROBE.ignoreAboveMs;
}

export class FrameProbe {
  private frames = 0;
  private readonly samples: number[] = [];
  private _done = false;
  private readonly quality: QualityManager;

  constructor(opts: { quality: QualityManager; now?: () => number }) {
    this.quality = opts.quality;
    // A stored choice (user or an earlier probe) means there is nothing to decide.
    if (this.quality.userChosen || this.quality.hasStoredChoice) this._done = true;
  }

  get done(): boolean {
    return this._done;
  }

  sample(frameMs: number): void {
    if (this._done) return;
    if (this.quality.userChosen) {
      this._done = true;
      return;
    }
    this.frames++;
    if (this.frames > PROBE.warmupFrames && validFrame(frameMs)) {
      this.samples.push(frameMs);
      if (this.samples.length >= PROBE.sampleFrames) {
        this.finish();
        return;
      }
    }
    if (this.frames >= PROBE_GIVE_UP_FRAMES) this._done = true;
  }

  private finish(): void {
    this._done = true;
    const s = [...this.samples].sort((a, b) => a - b);
    const mid = s.length >> 1;
    const median = s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
    if (!Number.isFinite(median)) return;
    const step: QualityStep = median <= PROBE.highMaxMs ? 'high' : median <= PROBE.mediumMaxMs ? 'medium' : 'low';
    this.quality.set(step, 'probe');
  }
}

const ORDER: QualityStep[] = ['low', 'medium', 'high'];

export class Governor {
  private readonly win: { t: number; ms: number }[] = [];
  private sum = 0;
  private windowStart: number | null = null;
  private stableSince: number | null = null;
  private offered: QualityStep | null = null;
  private readonly quality: QualityManager;
  private readonly onOfferRaise?: (step: QualityStep) => void;

  constructor(opts: { quality: QualityManager; onOfferRaise?: (step: QualityStep) => void }) {
    this.quality = opts.quality;
    this.onOfferRaise = opts.onOfferRaise;
  }

  get pendingOffer(): QualityStep | null {
    return this.offered;
  }

  sample(frameMs: number, nowSeconds: number): void {
    if (!validFrame(frameMs) || !Number.isFinite(nowSeconds)) return;
    if (this.quality.userChosen) return;
    if (this.windowStart === null) this.windowStart = nowSeconds;
    this.win.push({ t: nowSeconds, ms: frameMs });
    this.sum += frameMs;
    while (this.win.length && this.win[0].t < nowSeconds - PROBE.governorWindowSeconds) {
      this.sum -= this.win.shift()!.ms;
    }
    // Wait for a full window of observations before judging.
    if (nowSeconds - this.windowStart < PROBE.governorWindowSeconds) return;
    const avg = this.sum / this.win.length;

    if (avg > PROBE.governorDropAboveMs) {
      const i = ORDER.indexOf(this.quality.step);
      if (i > 0) this.quality.set(ORDER[i - 1], 'governor');
      this.reset(nowSeconds);
      return;
    }
    if (avg < PROBE.governorRaiseBelowMs) {
      if (this.stableSince === null) this.stableSince = nowSeconds;
      const i = ORDER.indexOf(this.quality.step);
      if (
        this.offered === null &&
        i < ORDER.length - 1 &&
        nowSeconds - this.stableSince >= PROBE.governorOfferRaiseAfterSeconds
      ) {
        this.offered = ORDER[i + 1];
        this.onOfferRaise?.(this.offered);
      }
    } else {
      this.stableSince = null;
      this.offered = null;
    }
  }

  /** Applies the raise that was offered. Never called by the governor itself. */
  acceptRaise(): boolean {
    const step = this.offered;
    this.offered = null;
    if (!step || this.quality.userChosen) return false;
    const ok = this.quality.set(step, 'governor');
    this.reset(this.windowStart ?? 0);
    return ok;
  }

  private reset(nowSeconds: number): void {
    this.win.length = 0;
    this.sum = 0;
    this.windowStart = nowSeconds;
    this.stableSince = null;
    this.offered = null;
  }
}
