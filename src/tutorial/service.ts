/** The `tutorial` service: where the current tutorial beat wants the player to go, or null. */
export interface TutorialService {
  target(): { x: number; y: number; z: number } | null;
  /** G1: true while a beat runs, when Esc belongs to the hold-to-skip (the pause menu then opens on a short tap). */
  skipBeatActive?(): boolean;
}

declare module '../core/Services' {
  interface GameServices {
    tutorial: TutorialService;
  }
}
