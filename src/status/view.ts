/**
 * What `actor.data['status']` holds for every actor with an active status (read by thread 5's enemy brain for
 * slow and stun, and by anything else that wants a cheap per-actor check). The object is replaced in place each
 * tick; do not keep a reference across ticks.
 */
export interface ActorStatusView {
  /** True while any stun entry is active. */
  stunned: boolean;
  /** Longest remaining stun in seconds, 0 when not stunned. */
  stunRemaining: number;
  /** Largest active slow fraction 0..0.9, 0 when not slowed. */
  slow: number;
}

export const STATUS_DATA_KEY = 'status';
