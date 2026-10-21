import { flagConditionHolds, type FlagCondition } from '../../core/flagCondition';
import type { Vec3 } from '../../physics/PhysicsWorld';
import { WYRMLING } from './tuning';

/** One chain post: slot i of the group is chained to `posts[i]` while `until` (when given) is false. */
export interface TetherPost {
  anchor: string;
  /** The chain is gone once this holds (A13's per-chain flags, `story.m20.chain.<n>`). */
  until?: FlagCondition;
}

export interface TetherOptions {
  /** Chain length, metres (default 2.5). */
  length?: number;
  /** Indoors: the exit door anchor a freed wyrmling walks to before it fades. */
  exitAnchor?: string;
}

export interface TetherPorts {
  anchor(id: string): Vec3 | undefined;
  flag(key: string): boolean;
  warn(message: string): void;
}

export interface Chain {
  post: Vec3;
  length: number;
}

export interface TethersPersisted {
  /** `spawnerId#slot` of chains freed by `unchain` (flag-freed chains follow their flags). */
  freed: string[];
}

/**
 * Wyrmling chains per spawner slot (plans/act2-A6a.md 1.4). A slot is chained while its post exists, its `until`
 * condition is false and no script has freed it; the freed set is saved (the `wyrms` persistable, v1), so a freed
 * wyrmling stays free after a load whichever way it was freed.
 */
export class WyrmTethers {
  private readonly defs = new Map<string, { posts: readonly TetherPost[]; length: number; exitAnchor?: string }>();
  private readonly freed = new Set<string>();
  private readonly chain: Chain = { post: { x: 0, y: 0, z: 0 }, length: WYRMLING.chainLength };

  constructor(private readonly ports: TetherPorts) {}

  /** Registers (or replaces) the chains of a spawner's slots; returns the remover. */
  tether(spawnerId: string, posts: readonly TetherPost[], opts: TetherOptions = {}): () => void {
    const length = opts.length ?? WYRMLING.chainLength;
    if (!(length > 0) || !Number.isFinite(length)) {
      this.ports.warn(`wyrms.tether: bad chain length ${length} for ${spawnerId}`);
      return () => {};
    }
    const def = { posts: [...posts], length, exitAnchor: opts.exitAnchor };
    this.defs.set(spawnerId, def);
    return () => {
      if (this.defs.get(spawnerId) === def) this.defs.delete(spawnerId);
    };
  }

  /** The chain on a slot now, or null (no chain, flag-freed, script-freed, or a missing anchor). Shared object: read it at once. */
  chainFor(spawnerId: string | null, slot: number | null): Readonly<Chain> | null {
    if (spawnerId === null || slot === null) return null;
    const def = this.defs.get(spawnerId);
    const post = def?.posts[slot];
    if (!def || !post || this.freed.has(key(spawnerId, slot))) return null;
    if (post.until && flagConditionHolds(post.until, { getFlag: (k) => this.ports.flag(k) })) return null;
    const at = this.ports.anchor(post.anchor);
    if (!at) return null;
    this.chain.post = at;
    this.chain.length = def.length;
    return this.chain;
  }

  exitFor(spawnerId: string | null): Vec3 | null {
    const id = spawnerId ? this.defs.get(spawnerId)?.exitAnchor : undefined;
    return id ? (this.ports.anchor(id) ?? null) : null;
  }

  /** Frees a slot's chain for good (saved). */
  free(spawnerId: string, slot: number): void {
    this.freed.add(key(spawnerId, slot));
  }

  isFreed(spawnerId: string, slot: number): boolean {
    return this.freed.has(key(spawnerId, slot));
  }

  serialize(): TethersPersisted {
    return { freed: [...this.freed].sort() };
  }

  load(data: unknown): void {
    this.freed.clear();
    const list = (data as Partial<TethersPersisted> | null)?.freed;
    if (!Array.isArray(list)) return;
    for (const k of list) if (typeof k === 'string' && /#\d+$/.test(k)) this.freed.add(k);
  }

  clear(): void {
    this.defs.clear();
    this.freed.clear();
  }
}

function key(spawnerId: string, slot: number): string {
  return `${spawnerId}#${slot}`;
}
