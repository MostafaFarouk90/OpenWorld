import type { ActorId } from '../actors/Actor';
import type { BanterLines } from './BanterDirector';
import type { WaitRule } from './WaitDirector';

export interface CompanionDef {
  id: string;
  nameKey: string;
  /** The single source of truth for "joined" (written by quest effects, or by `companions.join`). */
  joinFlag: string;
  rankFlag: string;
  /** Party role (companions.md section 9). */
  role: 'support' | 'tank' | 'healer';
  /** Absent for a companion who never fights (Tobb). Fights only under actors-and-damage section 11. */
  combat?: { damage: number; range: number; cooldown: number; aggroRadius: number };
  /** At 0 HP the companion kneels for `kneelSeconds` and stands with some health; companions never die before M52. */
  downed: { kneelSeconds: number };
  /** Where the pre-join NPC stands; the spawn fallback at the handover. */
  npcPost: string;
  /** The `npcs` service id of the pre-join NPC. */
  npcId: string;
  dialogueId: string;
  /** Battle-song on block (Tobb only). Absent for a companion whose aura is not a block-triggered attack-speed buff. */
  aura?: { id: string; buffId: string; nameKey: string; seconds: number; attackSpeed: number };
  /** The figure's model and dress; absent means Tobb's look (the shipped default). */
  look?: CompanionLook;
  /** A5's own health pool (Stonehide and the downed rule); absent: the 1 HP immortal actor Tobb has. */
  vitals?: { maxHealth: number };
  /** Hrolf's Stonehide (design 8.1): takes `share` of enemy hits on Cael within `radius` m. */
  stonehide?: { auraId: string; buffId: string; nameKey: string; share: number; radius: number };
  banter: BanterLines;
  /** Area-bark places: trigger id, interior id and region id to place id. */
  places: {
    triggers: Readonly<Record<string, string>>;
    interiors: Readonly<Record<string, string>>;
    regions: Readonly<Record<string, string>>;
  };
  /** Interior id to the anchor he arrives at when no spot on the grid is found. */
  interiorEntry: Readonly<Record<string, string>>;
  /** Where he waits instead of following, highest priority first (companions.md section 8). */
  waits: readonly WaitRule[];
}

/** The `companions` service (companions.md section 3). */
export interface CompanionsService {
  /** Sets the companion's join flag (no-op when already joined or unknown). */
  join(id: string): void;
  /** Clears it (not used in slice 2). */
  leave(id: string): void;
  /** Joined companions that are in the party (`isActive`), in def order. */
  active(): string[];
  /** Party size limit: 1 while the flag `story.gate.a3` is falsy, 2 after (read live). */
  maxActive(): number;
  /**
   * Sets the party. Refuses (returns false, changes nothing) on an unknown, unjoined or duplicated id, or more ids than
   * `maxActive()`. A runtime join puts the joiner in the first seat (the others wait at the Tilted Anvil; A5,
   * changing A0's "only a free seat" rule). Emits `party.changed` when the set changes.
   */
  setActive(ids: readonly string[]): boolean;
  /** Raises the bond rank (1 to 5, never lower, joined only); `companion.bond` on a change. The only rank writer. */
  setRank(id: string, rank: number): boolean;
  isActive(id: string): boolean;
  actorId(id: string): ActorId | null;
  /** 0 when not joined. */
  rank(id: string): number;
  /** Which optional services resolved (the all-plugins test asserts these). */
  integration(): { npcs: boolean; attackSpeedHook: boolean; nav: boolean };
}

/** How a companion looks: the NPC def its model comes from, and what is done to the model once loaded. */
export interface CompanionLook {
  npcDef: import('../npcs/types').NpcDef;
  /** Called on the loaded model (tints, shown and hidden meshes). */
  dress?(model: import('three').Object3D): void;
  /** Props that live on the root (Tobb's lute); built once, disposed with the figure. */
  props?(): import('three').Object3D | null;
  disposeProps?(props: import('three').Object3D): void;
  /** Optional clips by role; a missing one falls back (attack: none, kneel: a dip of the model). */
  clips?: { attack?: readonly string[]; kneel?: readonly string[] };
}

/** Thread 2's attack-speed hook on `combatVerbs` (actors-and-damage.md section 8). */
export interface AttackSpeedHook {
  addAttackSpeedMultiplier(id: string, mult: number): () => void;
}

/** Thread 3a's services as the companion uses them (interiors-and-nav.md). */
export interface NavLike {
  hasGrid(at: { x: number; y: number; z: number }): boolean;
  floorAt?(at: { x: number; y: number; z: number }): number | null;
  /** Waypoints including `to`; null when no grid covers it. */
  path?(from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }): { x: number; y: number; z: number }[] | null;
}
export interface InteriorsLike {
  readonly current: string | null;
  /** True while a door fade runs (the screen is black at the switch). */
  readonly transitioning?: boolean;
  interiorAt?(at: { x: number; y: number; z: number }): string | null;
}

declare module '../core/Services' {
  interface GameServices {
    /** Provided by the companions plugin (slice 2 thread 4b). */
    companions: CompanionsService;
  }
}
