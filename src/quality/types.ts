import type { QualityStep } from '../vfx/tuning';

export interface QualityService {
  readonly step: QualityStep;
  /** A user choice: persisted and stops the probe and governor from changing anything. */
  setStep(step: QualityStep): void;
  subscribe(fn: (step: QualityStep) => void): () => void;
  /** G1: true while the step is the player's own choice (not the probe's or the governor's). */
  readonly userChosen?: boolean;
  /** G1 ("Auto"): hands the step back to the probe and governor. */
  setAuto?(): void;
}

declare module '../core/Services' {
  interface GameServices {
    quality: QualityService;
  }
}
