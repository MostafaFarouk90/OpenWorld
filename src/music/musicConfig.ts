import { AUDIO } from '../config/constants';

/** Shared music tuning (design 6.1: one block so the music director serves every area). Seconds unless noted. */
export const musicConfig = {
  /** A hostile that has aggroed the player enters combat once it is this close (metres). */
  aggroRadius: 20,
  /** An aggroed hostile farther than this no longer holds combat open (metres); leash, not in the design. */
  leashRadius: 40,
  /** Combat ends this long after the hostile set empties or the last hostile hit on the player. */
  exitHysteresis: 6,
  endingSeconds: 6,
  mercyEndingSeconds: 4,
  /** Uninterrupted explore loops before a silence window. */
  silenceAfterLoops: 2,
  silenceMinSeconds: 45,
  silenceMaxSeconds: 90,
  /** A discover phrase is eight bars; the loop is two halves of this many bars. */
  halfLoopBars: 8,
  /** A discover request starts on the next half boundary when it is at most this many bars away. */
  halfBoundaryReachBars: 4,
  rampSeconds: AUDIO.stemCrossfadeSeconds,
} as const;
