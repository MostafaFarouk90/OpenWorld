// v0.7 items 9 and 27: two multiplier ports the core provides with identity defaults, so Act 1 and Act 2 rewards never
// change. K9 sets the quest reward scale for the two approach blocks (L / L_rec); K6b sets the kill XP region factors
// (the Greyfen in PR 1, the Dragonspine in PR 2). A provider or factor that is not a finite number of 0 or more reads as 1 (0 pays nothing, as QuestManager reads it).

import { flagConditionHolds, type FlagCondition, type FlagReader } from './flagCondition';

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
  /**
   * Sets one region's factor; returns the undo (the factor goes back to 1). v0.8: `opts.when` makes the factor apply only
   * while the condition holds (L2 sets Harrowmark's x 2.4 with `when: story.gate.a4`, so Act 1 kills there pay as before).
   */
  set(regionId: string, factor: number, opts?: { when?: FlagCondition }): () => void;
}

interface FactorEntry {
  factor: number;
  when?: FlagCondition;
}

export class KillXpRegionFactor implements KillXpRegionFactorService {
  private readonly factors = new Map<string, FactorEntry>();

  /** v0.8: `flags` reads `when` conditions; without it a factor set with `when` never applies (it warns once at set). */
  constructor(
    private readonly warn: (m: string) => void = () => {},
    private readonly flags: FlagReader | null = null,
  ) {}

  factor(regionId: string | null): number {
    if (regionId === null) return 1;
    const e = this.factors.get(regionId);
    if (!e) return 1;
    if (e.when && !(this.flags && flagConditionHolds(e.when, this.flags))) return 1;
    return e.factor;
  }

  set(regionId: string, factor: number, opts: { when?: FlagCondition } = {}): () => void {
    if (!valid(factor)) {
      this.warn(`killXpRegionFactor: ignoring ${String(factor)} for "${regionId}"`);
      return () => {};
    }
    if (opts.when && !this.flags) this.warn(`killXpRegionFactor: "${regionId}" has a condition but no flags to read; it reads as 1`);
    const entry: FactorEntry = opts.when ? { factor, when: opts.when } : { factor };
    this.factors.set(regionId, entry);
    return () => {
      if (this.factors.get(regionId) === entry) this.factors.delete(regionId);
    };
  }
}
