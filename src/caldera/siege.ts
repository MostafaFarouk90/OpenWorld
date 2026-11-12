// The siege (contracts v0.9 item 5, plan Part 3.5): the shared types N4 builds M52 (and R27's tunnel) from. The small
// shared rules live where their systems are: the kneel rule in waves/defenders.ts, the ram's stall in waves/structures.ts.
import type { Vec3 } from '../physics/PhysicsWorld';
import type { FlagCondition } from '../core/flagCondition';
import type { FavourTrack } from '../state/favour';

export type AllySquadRole = 'archers' | 'pikes' | 'melee' | 'sappers' | 'healers';
export const ALLY_SQUAD_ROLES: readonly AllySquadRole[] = ['archers', 'pikes', 'melee', 'sappers', 'healers'];

/** One allied squad on the walls or in the court; `strength` 0..1 scales its members (the favour snapshot sets it). */
export interface AllySquadDef {
  id: string;
  side: 'ally';
  /** Member count at full strength. */
  members: number;
  /** Anchor ids the members stand at. */
  posts: readonly string[];
  role: AllySquadRole;
  strength: number;
  /** The squad stands only when this holds (a favour band read at M52's snapshot, or a choice flag). */
  readWhen?: FlagCondition;
  /** The favour track whose band at the M52 snapshot sets `strength`, when it is read that way. */
  track?: FavourTrack;
}

/** Orders Cael gives during the siege (plan 3.5). N4 may add ids: N4 added `flasks` and `gong` (plans/act5-N4.md 6). */
export type SiegeOrderId = 'hold' | 'fall-back' | 'loose' | 'brace' | 'sally' | 'flasks' | 'gong';
export const SIEGE_ORDER_IDS: readonly SiegeOrderId[] = ['hold', 'fall-back', 'loose', 'brace', 'sally', 'flasks', 'gong'];

export interface DragonAllyDef {
  id: string;
  /** The wave the dragon arrives on (1-based). */
  arriveWave: number;
  /** Its flight path, engine points. */
  path: readonly Vec3[];
  /** Strike points (anchor ids) along the lanes. */
  strikes: readonly string[];
}

export interface SiegeDef {
  id: string;
  /** The gate structure's id (waves/structures.ts). */
  gate: string;
  /** Lane ids (wave-set lanes the foes come up). */
  lanes: readonly string[];
  /** Wave set ids, in order. */
  waves: readonly string[];
  orders: readonly SiegeOrderId[];
  /** Squads and dragons read from the M52 snapshot. */
  allyReaders: readonly (AllySquadDef | DragonAllyDef)[];
}

/**
 * The spike's ruling (plans/act5-N0-spike.md, logged under "Act 5 N0"): at most this many siege foes stand at once; the
 * rest wait at the lane heads and step in as members fall. The 40-foe total and every ally stay. A data constant N4 owns
 * (N4 may lower it after profiling `Enemy.think`; raising it needs a new frame measurement).
 */
export const SIEGE_MAX_ALIVE = 12;

/** Kill credit: only foes Cael damaged in the last this-many seconds pay Cael's XP (N4's rule). */
export const ASSIST_WINDOW_S = 8;
/** The plan's name for the same number. */
export const assistWindowS = ASSIST_WINDOW_S;
