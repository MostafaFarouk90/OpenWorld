// Contracts v0.8 item 9: the scene sequencer's types (plan Part 5.6). L0 builds the `scenes` service on these; L10, L11 and
// L13 write their scenes as data. Flags are buffered and written at a checkpoint or at the end (finished or skipped).
import type { CameraShot } from '../rendering/ThirdPersonCamera';

export type SceneStep =
  | { line: { speakerId: string; textKey: string; seconds?: number } }
  | { shot: CameraShot & { seconds: number } }
  | { move: { who: 'player' | string; to: string; yaw?: number } }
  | { anim: { who: 'player' | string; clip: string } }
  | { spawn: string }
  | { wait: number }
  | { flag: { key: string; value?: boolean | number | string } }
  | { checkpoint: string };

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
  /** Registers a scene def; returns the undo. Throws on a duplicate id. */
  register(def: SceneDef): () => void;
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
    'scene.ended': { id: string; reason: SceneEndReason };
  }
}

declare module '../core/Services' {
  interface GameServices {
    scenes: ScenesService;
  }
}

export {};
