import type { YsmerythPose } from './scene';

/** A beat of Ysmeryth's trial or scenes (K14 keys sounds off these; K15's HUD may read `takeoff` / `landed`). */
export type YsmerythBeat = 'takeoff' | 'landed' | 'call' | 'pose';

/**
 * Ysmeryth for K13's quest scripts (plans/act3-K6a-pr2.md 1.4, 1.5). The trial itself is K0's `trials` service: the
 * Yield prompt (K15) reads `trials.canYield()` and calls `trials.yield('ysmeryth-trial')`; the outcome is `trial.ended`.
 */
export interface YsmerythService {
  /**
   * Spawns her on the roost's landing mark (if she is not there) and starts `ysmeryth-trial` (three breaks, Yield after
   * two, the 80 m rule round the roost's centre, restart on loss). True while the trial runs (idempotent); false without
   * the roost anchors, the trials or enemies service, or while another trial runs. K13 calls it again after a trial
   * ends by distance, a teleport or a load.
   */
  beginTrial(): boolean;
  /** Stops a running trial (if any) and sends her up and away; she despawns out of sight. */
  endTrial(): void;
  /** The trial opponent's actor id while she is spawned, else null. */
  readonly actorId: string | null;
  /** True while she is in the air over the roost (between rounds, or the player out of reach). */
  readonly airborne: boolean;
  /** The Hearth scenes (M32, M34): shows her at `pose` (flying there from where she is). False without the Hearth anchors. */
  pose(pose: YsmerythPose): boolean;
  /** Removes the scene Ysmeryth until the next `pose` or a load. */
  hide(): void;
  /** The scene pose now, or null when she is not at the Hearth. */
  readonly scenePose: YsmerythPose | null;
}

declare module '../../../core/events' {
  interface GameEventMap {
    'wyrm.ysmeryth': { beat: YsmerythBeat; pose?: YsmerythPose };
  }
}

declare module '../../../core/Services' {
  interface GameServices {
    ysmeryth: YsmerythService;
  }
}
