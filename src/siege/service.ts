// The `siege` service (plans/act5-N4.md section 12): N10's M52 and N11's R27 start it; N9's HUD, N8's sound and N10's
// war table read it. Types only; siege.plugin.ts provides it.
import type { SiegeDef } from '../caldera/siege';
import type { OfferedOrder } from './orders.dialogue';
import type { SiegeId, SiegeRoster } from './roster';

export interface SiegeCurrent {
  siegeId: SiegeId;
  /** 1-based wave running, or the one just cleared during a break. */
  wave: number;
  /** Waves in this run (R27: 3, or 4 under F6 Leaders). */
  waves: number;
  phase: 'running' | 'orders' | 'beat';
  /** Gate health left, 0..100. */
  gatePct: number;
  breached: boolean;
  storm: boolean;
}

export interface SiegeService {
  /** Starts a siege (after M52's snapshot). False when one runs, it is done, or its anchors are missing (warned). */
  start(siegeId: SiegeId): boolean;
  /** Ends the running siege without completing it (a quest reset). */
  stop(): void;
  readonly current: SiegeCurrent | null;
  /** The roster the siege stands (pure read of the snapshot and choice flags). */
  roster(siegeId: SiegeId): SiegeRoster;
  /** Squads standing and kneeling (empty with none running). */
  allies(): { id: string; role: string; standing: number; kneeling: number }[];
  /** Live rams and their stall seconds. */
  rams(): { id: string; stalled: number }[];
  /** Gives an order during a break (the war post's choices call it through `siege.order.<id>`). */
  order(id: OfferedOrder): boolean;
  /** The orders on offer now (empty outside a break). */
  orders(): OfferedOrder[];
  /** Takes this break's crate (Oswin's flasks); returns the number given. */
  takeCrate(): number;
  /** The gate and every cart id of the siege's set(s), for N9's `StructureBar.suppress`. */
  structures(siegeId: SiegeId): string[];
  /** The siege defs (`waves.length` is the wave count; R27 lists the sealed run, `current.waves` the live one). */
  readonly defs: Readonly<Record<SiegeId, SiegeDef>>;
  completed(siegeId: SiegeId): boolean;
}
