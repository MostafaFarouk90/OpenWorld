import type { ActorId } from '../actors/Actor';

/** Design section 3 "Favour tracks and mercy": the three Houses, the dragons' trust and the Ashwalkers. */
export const FAVOUR_TRACKS = ['halvard', 'oswin', 'grisel', 'dragons', 'ashwalkers'] as const;
export type FavourTrack = (typeof FAVOUR_TRACKS)[number];

export const FAVOUR_START: Readonly<Record<FavourTrack, number>> = {
  halvard: 30,
  oswin: 20,
  grisel: 20,
  dragons: 10,
  ashwalkers: 15,
};

export const FAVOUR_MIN = 0;
export const FAVOUR_MAX = 100;
/** Favour from creature mercy (not boss mercy) is capped at this much per track for the whole game. */
export const CREATURE_MERCY_CAP = 10;
/** Largest favour change a single boss mercy may carry (the ledger's largest is +5). */
export const BOSS_MERCY_MAX = 20;

export type FavourBand = 'cold' | 'banked' | 'stoked' | 'hearthbound';
export type FavourSource = 'quest' | 'dialogue' | 'mercy' | 'script';

export const MERCY_VERBS = ['spare', 'calm', 'release', 'warmHand'] as const;
export const MERCY_TIERS = ['normal', 'elite', 'boss'] as const;

export interface MercyEvent {
  verb: (typeof MERCY_VERBS)[number];
  tier: (typeof MERCY_TIERS)[number];
  /** The track named in the creature's section 10 row; null means codex only. */
  track: FavourTrack | null;
  creature: string;
  /** The mercied actor; needed to revoke the credit if it is struck afterwards. */
  actorId?: ActorId;
  /** Boss mercies only: the ledger value (for example D01 Release: ashwalkers +4). */
  amount?: number;
  /** One Release pulse that frees several wraiths: Burn is charged once per pulseId (thread 7). */
  pulseId?: string;
  /** v0.5: the design's ledger row for boss and quest mercies (for example 'D01', 'D02'); absent for creatures. */
  ledgerId?: string;
}

/**
 * v0.5: the mercy unlock flags (game-events-and-flags.md section 5). Release unlocks in M03, Spare in M04, Calm
 * in D02 (thread 6's effects); threads 1 and 5 read them.
 */
export const MERCY_UNLOCK_FLAGS = {
  release: 'enemies.mercy.release',
  spare: 'enemies.mercy.spare',
  calm: 'enemies.mercy.calm',
} as const;
export type MercyUnlockVerb = keyof typeof MERCY_UNLOCK_FLAGS;

export function isFavourTrack(v: unknown): v is FavourTrack {
  return typeof v === 'string' && (FAVOUR_TRACKS as readonly string[]).includes(v);
}

/** Cold 0 to 24, Banked 25 to 49, Stoked 50 to 69, Hearthbound 70 to 100 (design section 3). */
export function bandFor(value: number): FavourBand {
  if (value >= 70) return 'hearthbound';
  if (value >= 50) return 'stoked';
  if (value >= 25) return 'banked';
  return 'cold';
}

// ---- v0.9 (Act 5, contracts/CHANGES-v0.9.md item 6): the favour snapshot ----

/** The snapshots Act 5 takes: M52's start (N10), the Foundry door before D09 and M56's start (N11). */
export const ACT5_SNAPSHOTS = ['m52', 'd09', 'm56'] as const;
export type Act5SnapshotId = (typeof ACT5_SNAPSHOTS)[number];

/** The flag that holds one track of one snapshot (`WorldState.snapshotFavour` writes it). */
export function snapshotFlag(snapshotId: string, track: FavourTrack | 'taken'): string {
  return `favour.snapshot.${snapshotId}.${track}`;
}

interface SnapshotReader {
  getFlag(key: string): unknown;
}

/** True once `snapshotId` has been taken. */
export function snapshotTaken(state: SnapshotReader, snapshotId: string): boolean {
  return state.getFlag(snapshotFlag(snapshotId, 'taken')) === true;
}

/** A track's value at the snapshot, or undefined before it is taken (or for an unknown track). */
export function snapshotValue(state: SnapshotReader, snapshotId: string, track: FavourTrack): number | undefined {
  if (!isFavourTrack(track) || !snapshotTaken(state, snapshotId)) return undefined;
  const v = state.getFlag(snapshotFlag(snapshotId, track));
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/** A track's band at the snapshot, or undefined before it is taken (callers decide what that means). */
export function bandAt(state: SnapshotReader, snapshotId: string, track: FavourTrack): FavourBand | undefined {
  const v = snapshotValue(state, snapshotId, track);
  return v === undefined ? undefined : bandFor(v);
}

/** The track highest at the snapshot, or 'tie' when two or more share the top; undefined before it is taken. */
export function highestTrack(state: SnapshotReader, snapshotId: string): FavourTrack | 'tie' | undefined {
  if (!snapshotTaken(state, snapshotId)) return undefined;
  let best: FavourTrack | undefined;
  let bestV = -Infinity;
  let tie = false;
  for (const t of FAVOUR_TRACKS) {
    const v = snapshotValue(state, snapshotId, t) ?? 0;
    if (v > bestV) {
      bestV = v;
      best = t;
      tie = false;
    } else if (v === bestV) tie = true;
  }
  return tie ? 'tie' : best;
}
