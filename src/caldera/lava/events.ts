// N3 events on top of v0.9's lava events (src/caldera/events.ts), by augmentation.
declare module '../../core/events' {
  interface GameEventMap {
    /** A cooled crust is about to melt: its cracks glow now and it is lava again in `inS` seconds (N9's cue, N8's hiss). */
    'vent.closing': { ventId: string; inS: number };
  }
}

export {};
