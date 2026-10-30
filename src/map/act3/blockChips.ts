// Act 3 block level chips for the full map (K15 PR 1, design 5.9). Pure: the plugin passes what it reads (the open regions,
// the Warmth block surface, the player level, quest state); the view draws what this returns. A block's chip shows the live
// preview until the lock, then the locked level and its span, and stays until every quest of the block is completed.
import { ACT3_BLOCKS, type Act3BlockId } from '../../enemies/level';
import { engineBox, type RegionId } from '../../region/regions';

export type BlockTone = 'gold' | 'orange' | 'red';

/** The region whose label the block's chip sits under (the lower slopes sit on the Dragonspine label; the summit has no chip). */
export const BLOCK_REGIONS: Readonly<Record<Act3BlockId, RegionId>> = {
  greyfen: 'greyfen',
  'dragonspine-lower': 'dragonspine',
};

export interface BlockChip {
  block: Act3BlockId;
  /** The region box centre, engine metres; the view draws the chip under the region label. */
  x: number;
  z: number;
  /** The block's base level L: the preview before the lock, the locked level after. */
  level: number;
  /** L + the block's span. */
  top: number;
  locked: boolean;
  tone: BlockTone;
  /** `map.block.preview` ("Tuned for level L. You are level P.") or `map.block.locked` ("Level L to top"). */
  textKey: string;
  params: Record<string, number>;
  /** The player stands in the block's region while the block is not locked: the legend repeats the warning. */
  here: boolean;
}

export const BLOCK_PREVIEW_KEY = 'map.block.preview';
export const BLOCK_LOCKED_KEY = 'map.block.locked';

/** The `warmth` service's block half, as the chips read it (both optional until K9 provides them). */
export interface BlockChipWarmth {
  preview?(block: Act3BlockId): number | undefined;
  blockLevel?(block: Act3BlockId): number | undefined;
}

export interface BlockChipPorts {
  open: readonly RegionId[];
  warmth: BlockChipWarmth | undefined;
  /** `progression.level`; undefined when unknown. */
  playerLevel: number | undefined;
  /** `quests.state(id)`; undefined while the quests service is missing. */
  questState(id: string): string | undefined;
  /** The player's engine position, for the legend warning. */
  player?: { x: number; z: number };
  /** Block table; defaults to `ACT3_BLOCKS`. */
  blocks?: Readonly<Record<string, { span: number; quests: readonly string[] }>>;
}

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** Design 5.9 against the live player level: gold when L <= P, orange for P + 1 to P + 3, red for P + 4 or more. */
export function blockTone(level: number, player: number): BlockTone {
  const d = level - player;
  return d <= 0 ? 'gold' : d <= 3 ? 'orange' : 'red';
}

function call<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

/**
 * One chip per block that is open, has a known level and still has a quest to finish. Hidden: the region is closed, there
 * is no player level or no block level (service missing, NaN), or every quest of the block is completed.
 */
export function blockChips(ports: BlockChipPorts): BlockChip[] {
  const P = ports.playerLevel;
  if (!finite(P) || !ports.warmth) return [];
  const table = ports.blocks ?? ACT3_BLOCKS;
  const out: BlockChip[] = [];
  for (const block of Object.keys(table) as Act3BlockId[]) {
    const region = BLOCK_REGIONS[block];
    const def = table[block];
    if (!region || !def || !ports.open.includes(region)) continue;
    // `blockLevel` is set only once the lock is in force; `preview` answers the locked value too, so ask for the lock first.
    const lockedLevel = call(() => ports.warmth!.blockLevel?.(block));
    const locked = finite(lockedLevel) && lockedLevel >= 1;
    const level = locked ? lockedLevel : call(() => ports.warmth!.preview?.(block));
    if (!finite(level) || level < 1) continue;
    const done = def.quests.length > 0 && def.quests.every((q) => call(() => ports.questState(q)) === 'completed');
    if (done) continue;
    const b = engineBox(region);
    const top = level + (finite(def.span) ? def.span : 0);
    const p = ports.player;
    const here = !locked && !!p && finite(p.x) && finite(p.z) && p.x >= b.x0 && p.x < b.x1 && p.z >= b.z0 && p.z < b.z1;
    out.push({
      block,
      x: (b.x0 + b.x1) / 2,
      z: (b.z0 + b.z1) / 2,
      level,
      top,
      locked,
      tone: blockTone(level, P),
      textKey: locked ? BLOCK_LOCKED_KEY : BLOCK_PREVIEW_KEY,
      params: locked ? { level, top } : { level, player: P },
      here,
    });
  }
  return out;
}

/** Stable signature, so the map plugin hands the view the same array until a chip changes. */
export function blockChipsKey(chips: readonly BlockChip[]): string {
  return chips.map((c) => `${c.block}:${c.locked ? 'L' : 'P'}${c.level}-${c.top}${c.tone}${c.textKey === BLOCK_PREVIEW_KEY ? c.params.player : ''}${c.here ? 'h' : ''}`).join('|');
}
