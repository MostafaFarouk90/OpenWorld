// G4 Cinderlands (design 12.4, 12.6, plan 3.6 and 3.7): what persists between runs, in one save entry `cinderlands`
// (G3's Second Hearth carries the whole entry). Embers, the highest unlocked Heat, Mastery XP per class, Hearth
// purchases and the local best table. Never terrain, never a run in progress.
import { CLASS_IDS, type ClassId } from '../actors/classes';

export const CINDER_SAVE_KEY = 'cinderlands';
export const CINDER_SAVE_VERSION = 1;

/** Hearth stall stock (phase 1, D3 a: effects apply only inside the Cinderlands). */
export type HearthItem = 'vigour' | 'greed';
export const HEARTH: Readonly<Record<HearthItem, { maxRank: number; prices: readonly number[]; nameKey: string; descKey: string }>> = {
  /** +5% max health per rank during a run. */
  vigour: { maxRank: 3, prices: [120, 260, 450], nameKey: 'cinder.hearth.vigour', descKey: 'cinder.hearth.vigour.desc' },
  /** +10% Embers per rank. */
  greed: { maxRank: 3, prices: [150, 320, 540], nameKey: 'cinder.hearth.greed', descKey: 'cinder.hearth.greed.desc' },
};
export const HEARTH_ITEMS: readonly HearthItem[] = ['vigour', 'greed'];
export const VIGOUR_PER_RANK = 0.05;
export const GREED_PER_RANK = 0.1;

export const MASTERY_MAX_RANK = 20;
/** Mastery XP needed to reach rank r (r >= 1): 120 x r^1.5, rounded. Rank 20 needs about 10,700. */
export function masteryXpFor(rank: number): number {
  return Math.round(120 * Math.pow(Math.max(0, rank), 1.5));
}
export function masteryRank(xp: number): number {
  const v = Number.isFinite(xp) ? Math.max(0, xp) : 0;
  let r = 0;
  while (r < MASTERY_MAX_RANK && v >= masteryXpFor(r + 1)) r++;
  return r;
}
/** Phase 1's generic rank rewards (R2): +1% damage per rank, +2% Embers every five ranks, both Cinderlands-only. */
export const masteryDamageBonus = (rank: number): number => 0.01 * Math.max(0, Math.min(MASTERY_MAX_RANK, rank));
export const masteryEmberBonus = (rank: number): number => 0.02 * Math.floor(Math.max(0, Math.min(MASTERY_MAX_RANK, rank)) / 5);

export interface BestRow {
  code: string;
  classId: ClassId;
  heat: number;
  score: number;
  seconds: number;
  /** Unix ms at the end of the run. */
  at: number;
  outcome: RunOutcome;
}
export const BEST_TABLE_SIZE = 10;

export type RunOutcome = 'quelled' | 'left' | 'died';

export interface ScoreInput {
  objective: boolean;
  embers: number;
  secondsTaken: number;
  parSeconds: number;
  mercies: number;
  deaths: number;
  damageTaken: number;
}
/** Design 12.6 without the weekly parts. Never below 0, a whole number. */
export function runScore(s: ScoreInput): number {
  const left = Math.max(0, s.parSeconds - Math.max(0, s.secondsTaken));
  const raw = (s.objective ? 1000 : 0) + Math.max(0, s.embers) + 2 * left + 100 * Math.min(10, Math.max(0, s.mercies)) - 150 * Math.max(0, s.deaths) - Math.max(0, s.damageTaken) / 10;
  return Math.max(0, Math.round(raw));
}
/** Par time: 30 minutes at the design's 2.4 km, scaled with the radius. */
export const parSecondsFor = (radius: number): number => Math.round(1800 * (radius / 2400));

export interface CinderMetaData {
  embers: number;
  maxHeat: number;
  mastery: Partial<Record<ClassId, number>>;
  hearth: Partial<Record<HearthItem, number>>;
  bests: BestRow[];
  runs: number;
}

const int = (v: unknown, min: number, max: number, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.floor(v))) : fallback;

export class CinderMeta {
  data: CinderMetaData = CinderMeta.empty();

  static empty(): CinderMetaData {
    return { embers: 0, maxHeat: 1, mastery: {}, hearth: {}, bests: [], runs: 0 };
  }

  reset(): void {
    this.data = CinderMeta.empty();
  }

  serialize(): CinderMetaData {
    return JSON.parse(JSON.stringify(this.data)) as CinderMetaData;
  }

  /** Tolerant load: every bad field falls back to its default. */
  load(raw: unknown): void {
    const d = CinderMeta.empty();
    const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
    d.embers = int(r.embers, 0, 1e9, 0);
    d.maxHeat = int(r.maxHeat, 1, 999, 1);
    d.runs = int(r.runs, 0, 1e9, 0);
    const m = (typeof r.mastery === 'object' && r.mastery !== null ? r.mastery : {}) as Record<string, unknown>;
    for (const c of CLASS_IDS) if (m[c] !== undefined) d.mastery[c] = int(m[c], 0, 1e9, 0);
    const h = (typeof r.hearth === 'object' && r.hearth !== null ? r.hearth : {}) as Record<string, unknown>;
    for (const k of HEARTH_ITEMS) if (h[k] !== undefined) d.hearth[k] = int(h[k], 0, HEARTH[k].maxRank, 0);
    if (Array.isArray(r.bests)) {
      for (const b of r.bests) {
        const o = (b ?? {}) as Record<string, unknown>;
        if (typeof o.code !== 'string' || !CLASS_IDS.includes(o.classId as ClassId)) continue;
        const outcome = o.outcome === 'quelled' || o.outcome === 'left' || o.outcome === 'died' ? o.outcome : 'left';
        d.bests.push({ code: o.code, classId: o.classId as ClassId, heat: int(o.heat, 1, 999, 1), score: int(o.score, 0, 1e9, 0), seconds: int(o.seconds, 0, 1e7, 0), at: int(o.at, 0, 1e15, 0), outcome });
      }
      d.bests.sort((a, b) => b.score - a.score || a.at - b.at);
      d.bests.length = Math.min(d.bests.length, BEST_TABLE_SIZE);
    }
    this.data = d;
  }

  rank(item: HearthItem): number {
    return this.data.hearth[item] ?? 0;
  }

  /** The next rank's price, or null at max rank. */
  price(item: HearthItem): number | null {
    const r = this.rank(item);
    return r >= HEARTH[item].maxRank ? null : HEARTH[item].prices[r];
  }

  buy(item: HearthItem): 'ok' | 'max' | 'poor' {
    const p = this.price(item);
    if (p === null) return 'max';
    if (this.data.embers < p) return 'poor';
    this.data.embers -= p;
    this.data.hearth[item] = this.rank(item) + 1;
    return 'ok';
  }

  masteryRank(classId: ClassId): number {
    return masteryRank(this.data.mastery[classId] ?? 0);
  }

  /** Banks a run's Embers (already multiplied) and, in the full mode, the same amount as Mastery XP. Returns rank-ups. */
  bank(embers: number, classId: ClassId, fullMode: boolean): number {
    const e = Math.max(0, Math.floor(embers));
    this.data.embers += e;
    this.data.runs++;
    if (!fullMode) return 0;
    const before = this.masteryRank(classId);
    this.data.mastery[classId] = (this.data.mastery[classId] ?? 0) + e;
    return this.masteryRank(classId) - before;
  }

  /** A clean run (objective done, no death) at the top unlocked Heat raises it by one. */
  clearedHeat(heat: number): boolean {
    if (heat >= this.data.maxHeat) {
      this.data.maxHeat = heat + 1;
      return true;
    }
    return false;
  }

  /** Records a run; returns its place in the table (1-based) or 0 when it did not make it. */
  record(row: BestRow): number {
    const list = [...this.data.bests, row].sort((a, b) => b.score - a.score || a.at - b.at);
    const place = list.indexOf(row) + 1;
    this.data.bests = list.slice(0, BEST_TABLE_SIZE);
    return place <= BEST_TABLE_SIZE ? place : 0;
  }

  bestFor(code: string): BestRow | undefined {
    return this.data.bests.find((b) => b.code.toUpperCase() === code.toUpperCase());
  }
}
