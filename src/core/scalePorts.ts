// v0.7 items 9 and 27: two multiplier ports the core provides with identity defaults, so Act 1 and Act 2 rewards never
// change. K9 sets the quest reward scale for the two approach blocks (L / L_rec); K6b sets the kill XP region factors
// (the Greyfen in PR 1, the Dragonspine in PR 2). A provider or factor that is not a finite number of 0 or more reads as 1 (0 pays nothing, as QuestManager reads it).

const valid = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

/** `questRewardScale`: quest XP and gold are multiplied by `scale(questId)` once, then rounded. */
export interface QuestRewardScaleService {
  scale(questId: string): number;
  /** Sets the one provider (K9's `warmth.rewardScale`); returns the undo. A second provider replaces the first. */
  setProvider(fn: (questId: string) => number): () => void;
}

export class QuestRewardScale implements QuestRewardScaleService {
  private provider: ((questId: string) => number) | null = null;

  constructor(private readonly warn: (m: string) => void = () => {}) {}

  scale(questId: string): number {
    if (!this.provider) return 1;
    let v: unknown;
    try {
      v = this.provider(questId);
    } catch (e) {
      this.warn(`questRewardScale: provider threw for "${questId}" (${String(e)}); using 1`);
      return 1;
    }
    if (valid(v)) return v;
    this.warn(`questRewardScale: provider gave ${String(v)} for "${questId}"; using 1`);
    return 1;
  }

  setProvider(fn: (questId: string) => number): () => void {
    this.provider = fn;
    return () => {
      if (this.provider === fn) this.provider = null;
    };
  }
}

/** `killXpRegionFactor`: kill XP (and the mercy share of it) is multiplied by the factor of the region of the kill. */
export interface KillXpRegionFactorService {
  factor(regionId: string | null): number;
  /** Sets one region's factor; returns the undo (the factor goes back to 1). */
  set(regionId: string, factor: number): () => void;
}

export class KillXpRegionFactor implements KillXpRegionFactorService {
  private readonly factors = new Map<string, number>();

  constructor(private readonly warn: (m: string) => void = () => {}) {}

  factor(regionId: string | null): number {
    if (regionId === null) return 1;
    return this.factors.get(regionId) ?? 1;
  }

  set(regionId: string, factor: number): () => void {
    if (!valid(factor)) {
      this.warn(`killXpRegionFactor: ignoring ${String(factor)} for "${regionId}"`);
      return () => {};
    }
    this.factors.set(regionId, factor);
    return () => {
      if (this.factors.get(regionId) === factor) this.factors.delete(regionId);
    };
  }
}
