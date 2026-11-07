// Act 5 N9 events (plans/act5-N9.md section 9): typed by augmentation; core's events.ts stays core-only.
declare module '../../core/events' {
  interface GameEventMap {
    /** A phase card ("The Rim holds") was closed by the player. */
    'hud.phaseCard.closed': { id: string };
    'hud.epilogue.slide': { n: number };
    'hud.epilogue.closed': Record<string, never>;
    'hud.credits.closed': Record<string, never>;
  }
}

export {};
