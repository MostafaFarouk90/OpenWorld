import type { HathrenBeat, HathrenState } from './sequence';

/** A playing of Hathren's calm. */
export interface HathrenPlayback {
  /** Resolves once the calm is over (`gone`, a skip, or teardown). */
  readonly done: Promise<void>;
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
  /** Plays the calm (rise, roar, quiet, dive, scale); null while already calming or once gone. */
  calm(): HathrenPlayback | null;
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
