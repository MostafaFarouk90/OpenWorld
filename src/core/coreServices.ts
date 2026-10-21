import type { AudioManager } from '../audio/AudioManager';
import type { DummiesService } from '../world/TrainingDummies';
import type { Action } from '../input/actions';
import type { GraphicsService } from './graphics';

/**
 * Tutorial prompt manager (contracts/input-and-hud.md section 6). Core defines it; thread 5 provides
 * `services.provide('prompts', …)`. Callers use `services.get('prompts')?.…`.
 */
export interface PromptService {
  show(mechanic: string, action: Action, textKey: string, opts?: { force?: boolean }): void;
  /** Threads 1, 3, 6, 7 and 9 report each successful use. */
  success(mechanic: string): void;
  /** Omit the mechanic to hide every prompt. */
  hide(mechanic?: string): void;
  /** Successes so far. */
  count(mechanic: string): number;
  /** Accessibility toggle; prompts never fade when true. */
  showHintsAlways: boolean;
}

/** v0.6 (Act 2): the wave director's surface. Core types it; A7 provides `services.provide('waves', …)`. */
export interface WavesService {
  /** Starts a wave set by def id; false when unknown or one is already running. */
  start(defId: string): boolean;
  /** Stops the running set without a result. */
  stop(): void;
  /** The running set and wave index, or null. */
  readonly current: { defId: string; index: number } | null;
}

/** Services the core itself provides in the world scene (contracts/game-events-and-flags.md section 6). */
declare module './Services' {
  interface GameServices {
    /** Provided right after construction, still locked until a user gesture; absent without Web Audio. */
    audio: AudioManager;
    graphics: GraphicsService;
    dummies: DummiesService;
    /** Provided by thread 5. */
    prompts: PromptService;
    /** v0.6: provided by A7. */
    waves: WavesService;
  }
}

export {};
