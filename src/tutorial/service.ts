/** The `tutorial` service: where the current tutorial beat wants the player to go, or null. */
export interface TutorialService {
  target(): { x: number; y: number; z: number } | null;
}

declare module '../core/Services' {
  interface GameServices {
    tutorial: TutorialService;
  }
}
