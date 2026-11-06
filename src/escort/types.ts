// Contracts v0.8 item 6: Act 4's foot escorts (plan Part 5.3: M36's delegates, M42's crossing). L0 owns these types; L4
// provides the `escorts` service. The service is plural because `escort` is A5's mounted escort (M11). Every event
// carries `escortId`, as the shipped `escort.started { escortId }` does, which Act 4 escorts emit too.

export type EscortMemberKind = 'npc' | 'cart';

export interface EscortMemberDef {
  id: string;
  kind: EscortMemberKind;
  /** A cart's health (an NPC uses its own). */
  health?: number;
}

export interface EscortDef {
  id: string;
  members: readonly EscortMemberDef[];
  /** Anchor ids in order; the junctions are the safe points (movementMode `escort`). */
  route: readonly string[];
  /** Metres a second on foot. */
  pace: number;
  /** Route anchors the escort halts at until the player comes up. */
  stopAt?: readonly string[];
  /** A struck member kneels until no enemy stands within ESCORT_KNEEL_CLEAR_RADIUS. Act 4 escorts always kneel. */
  kneelOnHit: true;
}

export type EscortHaltReason = 'hit' | 'junction' | 'storm' | 'player-far';

/** A knelt member stands again once no enemy is within this many metres. */
export const ESCORT_KNEEL_CLEAR_RADIUS = 8;
/** The escort halts while the player is farther than this from its nearest member. */
export const ESCORT_PLAYER_FAR = 25;

export interface EscortsService {
  /** The escort running now, or null. */
  active(): string | null;
  /** The last junction (a route anchor id) escort `id` reached, or null before the first. */
  lastJunction(id: string): string | null;
}

declare module '../core/events' {
  interface GameEventMap {
    'escort.halted': { escortId: string; reason: EscortHaltReason };
    'escort.resumed': { escortId: string };
    'escort.arrived': { escortId: string };
    'escort.junction': { escortId: string; junction: string };
  }
}

declare module '../core/Services' {
  interface GameServices {
    /** Act 4's foot escorts (L4). */
    escorts: EscortsService;
  }
}

export {};
