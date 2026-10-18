import type { QualityStep } from '../vfx/tuning';

export interface QualityService {
  readonly step: QualityStep;
  /** A user choice: persisted and stops the probe and governor from changing anything. */
  setStep(step: QualityStep): void;
  subscribe(fn: (step: QualityStep) => void): () => void;
}

declare module '../vfx/ports' {
  interface ServiceMap {
    quality?: QualityService;
  }
}
