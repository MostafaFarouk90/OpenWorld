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
}

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
