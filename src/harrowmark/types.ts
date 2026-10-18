import type { GateState } from './gate';

/** Published as the 'harrowmark' service. */
export interface HarrowmarkService {
  southGate: {
    state(): GateState;
    /** Forces a state (thread 21's story gate); `null` returns to the flags. */
    override(state: GateState | null): void;
  };
  /** Merged draw calls of the static city greybox. */
  drawCalls(): number;
  /** The mini-ending's built counts. */
  worldChange(): { active: boolean; banners: number; braziers: number };
}

declare module '../core/Services' {
  interface GameServices {
    /** Provided by the harrowmark plugin (thread 17). */
    harrowmark: HarrowmarkService;
  }
}
