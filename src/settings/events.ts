// G1's events (module augmentation, as src/siege/events.ts does).
declare module '../core/events' {
  interface GameEventMap {
    /** "Quit to title" was confirmed: sent before the save and the reload, so a run in progress can close (G4). */
    'settings.quitting': Record<string, never>;
  }
}

export {};
