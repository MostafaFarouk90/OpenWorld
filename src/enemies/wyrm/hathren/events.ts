import type { HathrenBeat, HathrenState } from './sequence';

/** How a calm ended: played to `gone` (or skipped there), or cut off (dismissed, the quest left, the plugin torn down). */
export type HathrenCalmOutcome = 'finished' | 'cancelled';

/** A playing of Hathren's calm. */
export interface HathrenPlayback {
  /** Settles once the calm is over. A load mid-calm with `story.m26.riteDone` set restarts it and keeps this promise. */
  readonly done: Promise<HathrenCalmOutcome>;
  /** Jumps to the end: every remaining beat once, in order. */
  skip(): void;
}

/**
 * Hathren's M26 set piece for K12's quest script (plans/act3-K6a.md 2). Presence is derived (quest `m26` active and
 * `story.m26.complete` unset; nets from `story.m26.net.<n>`), so K12 only makes the live calls.
 */
export interface HathrenService {
  readonly state: HathrenState;
  /** A net was cut (1..4): drops its line and eases the thrash. K12 also writes `story.m26.net.<n>` for reloads. */
  netCut(index: number): boolean;
  /**
   * Plays the calm (rise, roar, quiet, dive, scale). While already calming it returns the running playback; null once
   * gone. After a load she restarts the calm by herself when `story.m26.riteDone` is set, so K12 need not call it again
   * (a call before or after her own `save.loaded` re-derive is safe either way).
   */
  calm(): HathrenPlayback | null;
  /**
   * K12's wake scene (additive). While held, her wake is not started by the player coming near; `wake()` starts it in frame.
   * Off by default, and released by herself when M26 is no longer active (abandoned, failed, left), so she can never stay silent.
   */
  holdWake(on: boolean): void;
  readonly wakeHeld: boolean;
  /** Starts the wake now: `done` settles when it ends (12 s) or is skipped; null unless she is in the nets, unwoken. */
  wake(): HathrenPlayback | null;
  /** Where her head is now (the camera's target), or null while she is not built. */
  headPoint(): { x: number; y: number; z: number } | null;
  /** Gone without the sequence (the quest was abandoned by script). */
  dismiss(): void;
}

declare module '../../../core/events' {
  interface GameEventMap {
    /** Hathren's M26 set piece reached a beat (K14 keys her sounds off these; K15's codex unlock reads `quiet`). */
    'wyrm.hathren': { beat: HathrenBeat };
  }
}

declare module '../../../core/Services' {
  interface GameServices {
    hathren: HathrenService;
  }
}
