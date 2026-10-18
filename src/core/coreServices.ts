import type { AudioManager } from '../audio/AudioManager';
import type { DummiesService } from '../world/TrainingDummies';
import type { GraphicsService } from './graphics';

/** Services the core itself provides in the world scene (contracts/game-events-and-flags.md section 6). */
declare module './Services' {
  interface GameServices {
    /** Provided right after construction, still locked until a user gesture; absent without Web Audio. */
    audio: AudioManager;
    graphics: GraphicsService;
    dummies: DummiesService;
  }
}

export {};
