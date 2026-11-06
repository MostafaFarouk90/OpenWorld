// Contracts v0.8 item 11: the structure-break hook (the Bellows-Engine's bellows, L6). A boss that breaks only through
// its structure registers each part; a strike on a part arms one break, which the boss's `BossDef.acceptBreak` (the one
// forced-break hook, v0.7 item 13) consumes: wire `acceptBreak: () => breaks.acceptBreak(bossId)`. A part with a
// `strikeWindow` takes a strike only within `seconds` after its owner calls `telegraph(id, attackId)` with the named
// telegraph. The shipped Slagmaw keeps its own valve logic on the same acceptBreak path (see plans/act4-L0.md notes).

export interface StructureBreakDef {
  id: string;
  bossId: string;
  strikeWindow?: { afterTelegraph: string; seconds: number };
}

export type StrikeResult = 'armed' | 'unknown' | 'closed';

export interface StructureBreaksService {
  register(def: StructureBreakDef): () => void;
  /** The owner announces a telegraph (opens a window on the parts that wait for it). */
  telegraph(bossId: string, attackId: string): void;
  /** A hit on part `id`. */
  strike(id: string): StrikeResult;
  /** For BossDef.acceptBreak: true (and consumed) when a strike armed a break for this boss. */
  acceptBreak(bossId: string): boolean;
  tick(dt: number): void;
}

declare module '../core/Services' {
  interface GameServices {
    structureBreaks: StructureBreaksService;
  }
}

declare module '../core/events' {
  interface GameEventMap {
    'structure.struck': { id: string; bossId: string };
  }
}

export class StructureBreaks implements StructureBreaksService {
  private readonly defs = new Map<string, StructureBreakDef>();
  private readonly open = new Map<string, number>();
  private readonly armed = new Map<string, number>();

  constructor(private readonly emit: (e: 'structure.struck', p: { id: string; bossId: string }) => void = () => undefined) {}

  register(def: StructureBreakDef): () => void {
    if (this.defs.has(def.id)) throw new Error(`structureBreaks: duplicate part "${def.id}"`);
    if (def.strikeWindow && !(def.strikeWindow.seconds > 0)) throw new Error(`structureBreaks: part "${def.id}" needs a positive window`);
    this.defs.set(def.id, def);
    return () => {
      if (this.defs.get(def.id) !== def) return;
      this.defs.delete(def.id);
      this.open.delete(def.id);
    };
  }

  telegraph(bossId: string, attackId: string): void {
    for (const d of this.defs.values()) {
      if (d.bossId === bossId && d.strikeWindow?.afterTelegraph === attackId) this.open.set(d.id, d.strikeWindow.seconds);
    }
  }

  strike(id: string): StrikeResult {
    const d = this.defs.get(id);
    if (!d) return 'unknown';
    if (d.strikeWindow && !this.open.has(id)) return 'closed';
    this.open.delete(id);
    this.armed.set(d.bossId, (this.armed.get(d.bossId) ?? 0) + 1);
    this.emit('structure.struck', { id, bossId: d.bossId });
    return 'armed';
  }

  acceptBreak(bossId: string): boolean {
    const n = this.armed.get(bossId) ?? 0;
    if (n <= 0) return false;
    if (n === 1) this.armed.delete(bossId);
    else this.armed.set(bossId, n - 1);
    return true;
  }

  tick(dt: number): void {
    for (const [id, left] of this.open) {
      const next = left - dt;
      if (next <= 0) this.open.delete(id);
      else this.open.set(id, next);
    }
  }
}
