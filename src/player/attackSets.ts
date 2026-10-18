import type { AttackClipDef } from '../characters/knightClips';
import { KNIGHT_ATTACKS } from '../characters/knightClips';

/** A class's four attacks (keys 1 to 4) with the heavy one that costs stamina. */
export interface AttackSet {
  attacks: readonly AttackClipDef[];
  /** Index (0..3) of the attack that spends `STAMINA.heavyAttackCost` and is locked when the stamina is short. */
  heavyIndex: number;
}

export type RegisterAttackSetResult =
  | { ok: true; dispose(): void }
  | { ok: false; reason: 'duplicate' | 'bad-class' | 'bad-set' };

export const DEFAULT_CLASS_ID = 'knight';
export const KNIGHT_ATTACK_SET: AttackSet = { attacks: KNIGHT_ATTACKS, heavyIndex: 2 };

const unit = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1;

/** Null when the set is playable, else why not. Four clips, windows inside 0..1 and opening before they close. */
export function attackSetProblem(set: AttackSet): string | null {
  if (!set || !Array.isArray(set.attacks) || set.attacks.length !== 4) return 'needs exactly 4 attacks';
  if (!Number.isInteger(set.heavyIndex) || set.heavyIndex < 0 || set.heavyIndex > 3) return 'heavyIndex must be 0..3';
  const clips = new Set<string>();
  for (const a of set.attacks) {
    if (!a || typeof a.clip !== 'string' || a.clip.length === 0) return 'attack without a clip name';
    if (clips.has(a.clip)) return `duplicate clip ${a.clip}`;
    clips.add(a.clip);
    if (!unit(a.activeStart) || !unit(a.activeEnd) || a.activeStart >= a.activeEnd) return `bad window for ${a.clip}`;
  }
  return null;
}

/** Attack sets by class id; the Knight's is built in. Unknown classes read as the Knight. */
export class AttackSets {
  private readonly sets = new Map<string, AttackSet>([[DEFAULT_CLASS_ID, KNIGHT_ATTACK_SET]]);

  register(classId: string, set: AttackSet): RegisterAttackSetResult {
    if (typeof classId !== 'string' || classId.length === 0) return { ok: false, reason: 'bad-class' };
    if (this.sets.has(classId)) return { ok: false, reason: 'duplicate' };
    if (attackSetProblem(set) !== null) return { ok: false, reason: 'bad-set' };
    const frozen: AttackSet = { attacks: set.attacks.map((a) => ({ ...a })), heavyIndex: set.heavyIndex };
    this.sets.set(classId, frozen);
    return { ok: true, dispose: () => void (this.sets.get(classId) === frozen && this.sets.delete(classId)) };
  }

  has(classId: string): boolean {
    return this.sets.has(classId);
  }

  /** The set for a class; null or an unregistered id gives the Knight's. */
  get(classId: string | null | undefined): AttackSet {
    return (classId ? this.sets.get(classId) : undefined) ?? KNIGHT_ATTACK_SET;
  }
}

/** Named attack-speed multipliers combined by product and clamped to 0.5..2 (Tobb's Battle-song and the like). */
export class SpeedMultipliers {
  static readonly MIN = 0.5;
  static readonly MAX = 2;
  private readonly entries = new Map<string, number | (() => number)>();
  private readonly reported = new Set<string>();

  /** A throwing or non-finite entry is ignored (and reported once through `onBad`). */
  constructor(private readonly onBad: (id: string, why: string) => void = () => undefined) {}

  add(id: string, mult: number | (() => number)): () => void {
    this.entries.set(id, mult);
    return () => {
      if (this.entries.get(id) === mult) this.entries.delete(id);
    };
  }

  value(): number {
    let product = 1;
    for (const [id, m] of this.entries) {
      let v = NaN;
      try {
        v = typeof m === 'function' ? m() : m;
      } catch {
        // reported below
      }
      if (!Number.isFinite(v) || v <= 0) {
        if (!this.reported.has(id)) {
          this.reported.add(id);
          this.onBad(id, 'invalid multiplier');
        }
        continue;
      }
      product *= v;
    }
    return Math.min(SpeedMultipliers.MAX, Math.max(SpeedMultipliers.MIN, product));
  }
}
