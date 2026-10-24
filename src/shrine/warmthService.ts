// The Warmth service's Act 3 surface (contracts v0.7 item 8; K9 PR 1 implements it on the shipped `warmth` service). The block
// formula is `blockBaseLevel` in src/enemies/level.ts and the lock lives in the spawners' save (`lockedBlockLevels`),
// which K0 wired into the spawn levels (item 8b). K9 calls `enemies.lockBlockLevel(block, enemies.blockPreview(block))`
// on `quest.accepted` for each block's `lockQuest`, and sets `questRewardScale`'s provider to `rewardScale`.
import type { Act3BlockId } from '../enemies/level';

/** The Act 3 half of the `warmth` service (src/shrine/service.ts), optional until K9 provides it. */
export interface WarmthBlocksService {
  /** Locks the block at its live preview (first lock kept, Q5); returns L, or undefined without a player level. */
  lockBlock(block: Act3BlockId): number | undefined;
  /** The saved L, or undefined before the lock. */
  blockLevel(block: Act3BlockId): number | undefined;
  /** L if the block were started now (the map's chip and warning; pre-lock spawns use the same value). */
  preview(block: Act3BlockId): number | undefined;
  /** `L / L_rec` for a quest in an approach block (its lock, else its preview); 1 for every other quest. */
  rewardScale(questId: string): number;
}
