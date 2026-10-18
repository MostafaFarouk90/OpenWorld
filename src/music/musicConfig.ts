import { AUDIO } from '../config/constants';

/** Shared music tuning (design 6.1: one block so the music director serves every area). Seconds unless noted. */
export const musicConfig = {
  /** A hostile that has aggroed the player enters combat once it is this close (metres). */
  aggroRadius: 20,
  /** A calmed hostile this close still holds combat open (metres). */
  hostileClearRadius: 12,
  /** Combat ends this long after the hostile set empties or the last hostile hit on the player. */
  exitHysteresis: 6,
  endingSeconds: 6,
  /** A lost chase holds its mix this long, covering thread 18's 2 s "Again" card. */
  chaseRestartHoldSeconds: 2.5,
  mercyEndingSeconds: 4,
  /** Uninterrupted explore loops before a silence window. */
  silenceAfterLoops: 2,
  silenceMinSeconds: 45,
  silenceMaxSeconds: 90,
  /** A discover phrase is this many bars (a half loop). */
  halfLoopBars: 8,
  /** A discover request starts on the next half boundary when it is at most this many bars away. */
  halfBoundaryReachBars: 4,
  rampSeconds: AUDIO.stemCrossfadeSeconds,
  /** Added to `toAudioTime` results; a hook for calibrating input latency against the beat. */
  beatInputOffsetSeconds: 0,
} as const;
