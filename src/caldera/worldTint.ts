// After the ending (contracts v0.9 item 10, Q1 (a)): the world's tint after the final choice. N0 provides the service
// with no look (caldera/act5Core.plugin.ts); N13 attaches the real look (sky, light, fog) with `attach`, so there is one
// provider and nothing else needs to know. N13 builds the rest of the world after the ending.
export type WorldTintKey = 'rekindle' | 'let-it-die';

export interface WorldTintService {
  /** Sets the tint (null: none, the shipped look); attached looks hear it. */
  set(key: WorldTintKey | null): void;
  readonly current: WorldTintKey | null;
  /** N13: a look that hears every change (called once at attach with `current`). Returns the undo. */
  attach(look: (key: WorldTintKey | null) => void): () => void;
}

declare module '../core/Services' {
  interface GameServices {
    /** v0.9: a no-op default from the Act 5 core plugin; N13 provides the real one. */
    worldTint: WorldTintService;
  }
}

/** Remembers the key; changes nothing on screen until a look is attached. */
export class WorldTint implements WorldTintService {
  current: WorldTintKey | null = null;
  private readonly looks = new Set<(key: WorldTintKey | null) => void>();

  set(key: WorldTintKey | null): void {
    if (key === this.current) return;
    this.current = key;
    for (const l of this.looks) l(key);
  }

  attach(look: (key: WorldTintKey | null) => void): () => void {
    this.looks.add(look);
    look(this.current);
    return () => {
      this.looks.delete(look);
    };
  }
}
