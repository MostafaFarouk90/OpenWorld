// The Warmth service's Act 3 half (contracts v0.7 items 8 and 8b; K9 PR 1). The block formula is `blockBaseLevel`
// (src/enemies/level.ts) and the lock lives in the spawners' save; this class only decides when to lock, mirrors the lock
// into the numeric flag `warmth.block.<id>.level`, and answers the reward scale. Plain class over ports, so it is tested
// without plugins.
import { ACT3_BLOCKS, type Act3BlockId } from '../enemies/level';
import type { WarmthBlocksService } from './warmthService';

/** The enemies surface the lock needs (`lockBlockLevel`, `blockLevel`, `blockPreview`). */
export interface WarmthBlocksEnemies {
  lockBlockLevel(blockId: string, level: number): number | undefined;
  blockLevel(block: Act3BlockId): number | undefined;
  blockPreview(block: Act3BlockId): number | undefined;
}

export interface WarmthBlocksPorts {
  /** The enemies service, or undefined while it (or its block methods) is missing. */
  enemies(): WarmthBlocksEnemies | undefined;
  /** A quest's state (`quests.state`); undefined while the quests service is missing. */
  questState(questId: string): string | undefined;
  /** The numeric flag, or undefined when unset or not a number. */
  flag(key: string): number | undefined;
  setFlag(key: string, value: number): void;
  /** Block table; defaults to `ACT3_BLOCKS`. */
  blocks?: Readonly<Record<string, { recommended: number; lockQuest: string; quests: readonly string[] }>>;
}

export const blockLevelFlag = (block: string): string => `warmth.block.${block}.level`;

const validLevel = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 1;

export class WarmthBlocks implements WarmthBlocksService {
  constructor(private readonly ports: WarmthBlocksPorts) {}

  private table(): Readonly<Record<string, { recommended: number; lockQuest: string; quests: readonly string[] }>> {
    return this.ports.blocks ?? ACT3_BLOCKS;
  }

  private blockIds(): Act3BlockId[] {
    return Object.keys(this.table()) as Act3BlockId[];
  }

  private mirror(block: string, level: number): void {
    if (this.ports.flag(blockLevelFlag(block)) !== level) this.ports.setFlag(blockLevelFlag(block), level);
  }

  blockLevel(block: Act3BlockId): number | undefined {
    const L = this.ports.enemies()?.blockLevel(block);
    return validLevel(L) ? L : undefined;
  }

  /** Locks at the live preview (first lock kept, Q5); undefined without a player level, and nothing is locked then. */
  lockBlock(block: Act3BlockId): number | undefined {
    const kept = this.blockLevel(block);
    if (kept !== undefined) {
      this.mirror(block, kept);
      return kept;
    }
    const e = this.ports.enemies();
    const p = e?.blockPreview(block);
    if (!e || !validLevel(p)) return undefined;
    const L = e.lockBlockLevel(block, p);
    if (!validLevel(L)) return undefined;
    this.mirror(block, L);
    return L;
  }

  preview(block: Act3BlockId): number | undefined {
    const locked = this.blockLevel(block);
    if (locked !== undefined) return locked;
    const p = this.ports.enemies()?.blockPreview(block);
    return validLevel(p) ? p : undefined;
  }

  /**
   * `L / L_rec` for a quest of a locked block. 1 before the lock (a quest paid before M23 or M28 never pays at a preview
   * that moves with W and P), for every other quest, and for a bad L or a recommended level of 0.
   */
  rewardScale(questId: string): number {
    const table = this.table();
    for (const block of this.blockIds()) {
      const def = table[block];
      if (!def.quests.includes(questId)) continue;
      const L = this.blockLevel(block);
      if (L === undefined || !(def.recommended > 0) || !Number.isFinite(def.recommended)) return 1;
      return L / def.recommended;
    }
    return 1;
  }

  /** `quest.started`: a block's lock quest locks the block. A second start keeps the first lock. */
  onQuestStarted(questId: string): void {
    for (const block of this.blockIds()) if (this.table()[block].lockQuest === questId) this.lockBlock(block);
  }

  /**
   * Re-derives every block (on `save.loaded` after the spawners loaded, and every tick, so an unknown level is retried):
   * a lock writes the flag; no lock but a flag restores the lock from it; neither, with the lock quest active or
   * completed, locks at the preview (only an older or damaged save gets here, so that level is the load-time preview). A lock already in force is never changed here.
   */
  derive(): void {
    const e = this.ports.enemies();
    if (!e) return;
    for (const block of this.blockIds()) {
      const kept = this.blockLevel(block);
      if (kept !== undefined) {
        this.mirror(block, kept);
        continue;
      }
      const saved = this.ports.flag(blockLevelFlag(block));
      if (validLevel(saved)) {
        e.lockBlockLevel(block, saved);
        continue;
      }
      const state = this.ports.questState(this.table()[block].lockQuest);
      if (state === 'active' || state === 'completed') this.lockBlock(block);
    }
  }
}
