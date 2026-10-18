import type { Density } from './density';

export interface CrowdStats {
  walkers: number;
  idle: number;
  drawn: { lod0: number; lod1: number };
  drawCalls: number;
  asleep: boolean;
  enabled: boolean;
  /** Last frame's crowd cost (simulation plus instance packing), and its average over about 120 frames, in ms. */
  msFrame: number;
  msFrameAvg: number;
}

/** Published as the 'crowds' service (thread 17b). */
export interface CrowdsService {
  stats(): CrowdStats;
  density(): Density;
  /** Debug switch (frame-time probes): off hides and stops the crowd. */
  setEnabled(on: boolean): void;
}

declare module '../core/Services' {
  interface GameServices {
    /** Provided by the crowds plugin (thread 17b). */
    crowds: CrowdsService;
  }
}
