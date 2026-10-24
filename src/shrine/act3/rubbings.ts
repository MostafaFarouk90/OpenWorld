// The anvil rubbings (K9 PR 1; K2 registers its six Dragonspine rubbings through the same service). A rubbing can be
// taken any time after M30 starts, but its codex entry stays locked until M32 completes (`story.m32.complete`, K13).
import { codexEntry, type CodexEntryDef } from '../../codex/entries';
import { RUBBINGS_COLLECTION_ID, rubbingCodexId, rubbingFlag } from './tuning';

export interface RubbingDef {
  /** One flag-key segment: `world.rubbing.<id>.taken`. */
  id: string;
  /** Codex string slug (`codex.lore.<slug>.name|body`); default `rubbing-<id>`. The caller registers the strings. */
  slug?: string;
}

export interface AnvilRubbingsService {
  /** Adds rubbings (a duplicate id is refused with a warning); returns an idempotent undo. */
  register(defs: readonly RubbingDef[]): () => void;
  /** Takes a registered rubbing; false when unknown or already taken. */
  take(id: string): boolean;
  taken(id: string): boolean;
  /** `story.m32.complete`: the old tongue can be read. */
  readable(): boolean;
  /** How many registered rubbings are taken. */
  count(): number;
}

declare module '../../core/Services' {
  interface GameServices {
    anvilRubbings: AnvilRubbingsService;
  }
}

declare module '../../core/events' {
  interface GameEventMap {
    'rubbing.taken': { rubbingId: string };
  }
}

export const READABLE_FLAG = 'story.m32.complete';
const ID = /^[a-z][a-z0-9-]*$/;

export interface RubbingsPorts {
  getBool(key: string): boolean;
  setFlag(key: string, value: boolean): void;
  emitTaken(rubbingId: string): void;
  /** The codex service's `unlock` / `register`, or undefined while it is missing. */
  unlock(entryId: string): void;
  registerCodex(entries: readonly CodexEntryDef[]): () => void;
  warn(message: string): void;
}

export class AnvilRubbings implements AnvilRubbingsService {
  private readonly defs = new Map<string, RubbingDef>();

  constructor(private readonly ports: RubbingsPorts) {}

  register(defs: readonly RubbingDef[]): () => void {
    const added: string[] = [];
    const entries: CodexEntryDef[] = [];
    for (const d of defs) {
      if (!d || typeof d.id !== 'string' || !ID.test(d.id)) {
        this.ports.warn(`rubbings: ignoring invalid rubbing id ${String(d?.id)}`);
        continue;
      }
      if (this.defs.has(d.id)) {
        this.ports.warn(`rubbings: duplicate rubbing id "${d.id}" refused`);
        continue;
      }
      this.defs.set(d.id, d);
      added.push(d.id);
      entries.push(codexEntry('lore', rubbingCodexId(d.id), d.slug ?? `rubbing-${d.id}`));
    }
    const offCodex = entries.length ? this.ports.registerCodex(entries) : () => {};
    this.derive();
    let done = false;
    return () => {
      if (done) return;
      done = true;
      offCodex();
      for (const id of added) this.defs.delete(id);
    };
  }

  taken(id: string): boolean {
    return this.ports.getBool(rubbingFlag(id));
  }

  readable(): boolean {
    return this.ports.getBool(READABLE_FLAG);
  }

  count(): number {
    let n = 0;
    for (const id of this.defs.keys()) if (this.taken(id)) n++;
    return n;
  }

  take(id: string): boolean {
    if (!this.defs.has(id) || this.taken(id)) return false;
    this.ports.setFlag(rubbingFlag(id), true);
    this.ports.emitTaken(id);
    this.derive();
    return true;
  }

  /**
   * Re-derives the codex from the flags (on a load, on the M32 flag, on a register, after a take): the collection entry
   * once anything is taken, each taken rubbing's entry once M32 is done. An untaken rubbing never unlocks.
   */
  derive(): void {
    let any = false;
    const readable = this.readable();
    for (const id of this.defs.keys()) {
      if (!this.taken(id)) continue;
      any = true;
      if (readable) this.ports.unlock(rubbingCodexId(id));
    }
    if (any) this.ports.unlock(RUBBINGS_COLLECTION_ID);
  }
}
