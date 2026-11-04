// K7's services and events, added by module augmentation (core files stay K0's). `water` is K0's port type
// (src/water/types.ts); `ferry` is for K15's stop menu; `carry` is for K13's sleds, eggs and candle bundles.
import type { BoardRefusal } from './ferry/FerryRides';
import type { CarryResetReason, TrackedCarry } from './carry/CarryResets';
import type { SledDef } from './carry/Sleds';
import type { GlideRefusal, GlideState } from './glide/GlidePlayer';

/** K15's glide indicator and K4's walk catch read it. */
export interface GlideService {
  /** Starts a glide from a ledge (`summit-aerie` or `glide.summit-aerie`); returns the refusal (toasted) or null. */
  launch(site: string): GlideRefusal | null;
  refusal(site: string): GlideRefusal | null;
  /** Lets go mid-air (the interact prompt does the same). */
  letGo(): void;
  readonly state: GlideState;
  /** `glide.<site>` while a glide runs, else null. */
  readonly ledgeId: string | null;
  /** The glide's yaw (0 faces -Z), and the lane it is clamped to. */
  readonly yaw: number;
  readonly heading: number | null;
  readonly laneHalfAngle: number | null;
  /** Lift this tick (m/s): thermals plus slope wind. */
  readonly lift: number;
  readonly heightAboveGround: number;
  /** A glide runs, the fall after one can still be caught, or a return plays: K4's walk catch stands down. */
  readonly catchArmed: boolean;
}

export interface FerryService {
  /** Every stop id. */
  stops(): string[];
  /** The stops one leg from `stop` (K15's menu lists them). */
  destinations(stop: string): string[];
  /** Why boarding at `from` for `to` is refused now, or null. */
  refusal(from: string, to: string): BoardRefusal | null;
  /** Boards and rides; returns the refusal (toasted) or null. */
  ride(from: string, to: string): BoardRefusal | null;
  /** Skips to the destination with a fade. */
  skip(): void;
  readonly riding: boolean;
  /**
   * K15's stop menu: `open(stop)` is asked at a stop's interact and returns true when it opened (the player then chooses
   * a leg through `ride`). Unset, or false, the interact boards the default destination as before. Null removes it.
   */
  setMenu(open: ((stop: string) => boolean) | null): void;
}

export interface CarryService {
  /** Places a sled on its route (K13 for R15, on K4's routes); returns the undo. */
  addSled(def: SledDef): () => void;
  /** Tracks a held carry for the reset (K13's eggs and bundles); returns the undo. */
  track(t: TrackedCarry): () => void;
  /** "Reset haul" (Thorgar's dialogue): back to the last reset point. False for an unknown id or a reset running. */
  reset(id: string): boolean;
  /** Where the object returns to now. */
  checkpoint(id: string): { x: number; y: number; z: number } | null;
  /** The sled the player holds, or null. */
  readonly heldSled: string | null;
}

declare module '../core/Services' {
  interface GameServices {
    /** K7 PR 1. */
    ferry: FerryService;
    /** K7 PR 1. */
    carry: CarryService;
    /** K7 PR 2. */
    glide: GlideService;
  }
}

declare module '../core/events' {
  interface GameEventMap {
    /** K7: the player boarded the ferry at `from` for `to`, or arrived (by the ride or a skip). */
    'ferry.boarded': { routeId: string; from: string; to: string };
    'ferry.arrived': { routeId: string; stop: string; skipped: boolean };
    /** K7: a carried object went back to its last reset point. */
    'carry.reset': { id: string; reason: CarryResetReason };
    /** K7: the player took the traces of a sled, or let go of it. */
    'sled.taken': { id: string };
    'sled.dropped': { id: string };
    /** Thorgar's "reset haul" (a dialogue `event` effect, `npc.` namespace): K7 resets the named carry. */
    'npc.carry.resetHaul': { id: string };
  }
}
