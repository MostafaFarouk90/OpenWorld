// Contracts v0.8 item 9: the scene sequencer's types (plan Part 5.6). L0 builds the `scenes` service on these; L10, L11 and
// L13 write their scenes as data. Flags are buffered and written at a checkpoint or at the end (finished or skipped).
import type { CameraShot } from '../rendering/ThirdPersonCamera';
import type { FlagCondition } from '../core/flagCondition';
import type { FavourBand, FavourTrack } from '../state/favour';

/**
 * v0.9 item 8: what a `variant` case asks (every part given must hold). `band` reads the favour band of `track` at a
 * snapshot (`favour.snapshot.<id>`), or the live band without `snapshot`; a snapshot not taken yet reads false. `highest`
 * reads the snapshot's top track ('tie' when two or more share it). `test` names a predicate registered with
 * `scenes.registerTest` (N11's Scar count), so a scene can ask new things without a sequencer change.
 */
export interface SceneTest {
  flags?: FlagCondition;
  band?: { snapshot?: string; track: FavourTrack; in: readonly FavourBand[] };
  highest?: { snapshot: string; is: FavourTrack | 'tie' };
  test?: string;
}

/**
 * v0.9 item 8: one step chosen when the variant is reached: the first case whose test holds, else `otherwise`, else
 * nothing. A case's step is never a variant or a checkpoint (refused at `register`), so checkpoint indexes never move.
 */
export interface SceneVariant {
  cases: readonly { when: SceneTest; step: SceneStep }[];
  otherwise?: SceneStep;
}

export type SceneStep =
  | { line: { speakerId: string; textKey: string; seconds?: number } }
  | { shot: CameraShot & { seconds: number } }
  | { move: { who: 'player' | string; to: string; yaw?: number } }
  | { anim: { who: 'player' | string; clip: string } }
  | { spawn: string }
  | { wait: number }
  | { flag: { key: string; value?: boolean | number | string } }
  | { checkpoint: string }
  | { variant: SceneVariant };

export interface SceneDef {
  id: string;
  steps: readonly SceneStep[];
  /** Default true. */
  skippable?: boolean;
}

export type SceneEndReason = 'finished' | 'skipped' | 'cancelled';

export interface ScenesService {
  /** Plays (or queues behind the running scene) scene `id`; resolves with how it ended. */
  play(id: string): Promise<SceneEndReason>;
  /** The running scene's id, or null. */
  readonly active: string | null;
  /** Skips the running scene (writes every flag it would have written). False when nothing runs or it is not skippable. */
  skip(): boolean;
  /** Registers a scene def; returns the undo. Throws on a duplicate id, a repeated checkpoint or a nested variant. */
  register(def: SceneDef): () => void;
  /** v0.9: registers a named `SceneTest.test` predicate; returns the undo. Throws on a duplicate id. */
  registerTest(id: string, fn: () => boolean): () => void;
}

/** The persisted entry while a scene runs: replay from `checkpoint`, or from the start when null. */
export interface SavedScene {
  id: string;
  checkpoint: string | null;
}

declare module '../core/events' {
  interface GameEventMap {
    'scene.started': { id: string };
    'scene.checkpoint': { id: string; checkpoint: string };
    'scene.line': { id: string; speakerId: string; textKey: string };
    /** An `anim` step (staged only): the owner of `who` plays `clip`. */
    'scene.anim': { who: string; clip: string };
    'scene.ended': { id: string; reason: SceneEndReason };
  }
}

declare module '../core/Services' {
  interface GameServices {
    scenes: ScenesService;
  }
}

export {};
