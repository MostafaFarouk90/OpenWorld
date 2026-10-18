/** The eight main-path forge-shrines, in design order (5.9). The hidden Kindling Dell never counts. */
export const SHRINE_IDS = [
  'quenchstone',
  'hushed-anvil',
  'weeping-bellows',
  'hathrens-mere',
  'last-anvil',
  'wyrms-hearth',
  'singing-slag',
  'anvil-of-ages',
] as const;

export type ShrineId = (typeof SHRINE_IDS)[number];

export const shrineFlag = (id: string): string => `shrine.${id}.lit`;

/** W: how many of the eight shrines are lit, in any order (0..8). Derived, never stored. */
export function warmthTier(isLit: (flagKey: string) => boolean): number {
  let w = 0;
  for (const id of SHRINE_IDS) if (isLit(shrineFlag(id))) w++;
  return w;
}

export interface WarmthPorts {
  isLit(flagKey: string): boolean;
  emitChanged(tier: number, previous: number): void;
  /** Feeds `enemies.setWarmthTier`; the enemies service is read on demand by the caller. */
  setEnemyTier(tier: number): void;
}

/**
 * Keeps W and tells the world. `warmth.changed` fires when the derived value differs from the last
 * one this tracker saw (including across a load); the enemy tier is pushed on every change and on
 * every load, because the spawners load their own stale saved value first.
 */
export class WarmthTracker {
  private current: number;

  constructor(private readonly ports: WarmthPorts) {
    this.current = warmthTier(ports.isLit);
    ports.setEnemyTier(this.current);
  }

  tier(): number {
    return this.current;
  }

  recompute(cause: 'flag' | 'load'): void {
    const next = warmthTier(this.ports.isLit);
    const previous = this.current;
    this.current = next;
    if (next !== previous) this.ports.emitChanged(next, previous);
    if (next !== previous || cause === 'load') this.ports.setEnemyTier(next);
  }
}
