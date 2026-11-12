import type { EnemyKind, WarhostRole } from '../enemies/types';
import type { AreaId } from '../region/areas';

/** Lane keys of a set: the numbered spawn lanes, plus named ones (the wyrm's approach). */
export type LaneKey = string;

/** One group of enemies in a wave: `count` of `kind` from `lane`, the first at `delay` seconds, then one every `stagger`. */
export interface WaveSpawnDef {
  lane: LaneKey;
  kind: EnemyKind;
  count: number;
  /** Seconds after the wave starts. */
  delay: number;
  /** Seconds between members. */
  stagger: number;
  /** N4 (Act 5): the members' Warhost role (`SpawnerDef.role`); the spawner id gains `.r<role>`. */
  role?: WarhostRole;
  /** N4 (Act 5): the shield-line id the members join (`SpawnerDef.line`, N5 reads `line ?? tag`); part of the spawner id. */
  line?: string;
}

/** A brazier cart, rolling down a numbered lane toward the barricade `delay` seconds after the wave starts. */
export interface WaveCartDef {
  lane: LaneKey;
  delay: number;
  /** v0.9 item 5: 'ram' for the siege's ram (N4); default 'brazier', so Act 2's data reads the same. */
  role?: 'brazier' | 'ram';
}

export interface WaveDef {
  spawns: readonly WaveSpawnDef[];
  carts: readonly WaveCartDef[];
}

/** A militia post: an anchor, plus an offset in metres so two can share one. */
export interface DefenderPostDef {
  anchor: string;
  dx?: number;
  dz?: number;
}

/** A wave set as data (README.md). */
export interface WaveSetDef {
  /** The id `waves.start(id)` takes. */
  id: string;
  /** Structure id of the barricade in `structure.damaged` / `structure.destroyed`. */
  barricadeId: string;
  barricadeHealth: number;
  /** The barricade line (A3's `barricade` structures). The set's origin is their centroid; carts ram the nearest one. */
  barricadeAnchors: readonly string[];
  /** Lane key to anchor id. */
  lanes: Readonly<Record<LaneKey, string>>;
  waves: readonly WaveDef[];
  defenders: readonly DefenderPostDef[];
  /** Level band region id for the wave enemies. */
  band: string;
  /** v0.8: the sub-area band (the Act 4 interiors' `harrowmark-a4`), so a wave set is capped like any Act 4 spawner. */
  area?: AreaId;
  /** `actor.spawnTag` of every wave enemy (A12's kill objective matches it). */
  spawnTag: string;
  /** Seconds between a cleared wave and the next; default `DIRECTOR.intermissionSeconds`. */
  intermission?: number;
  /** Seconds between a failure and the restart; default `DIRECTOR.restartBeatSeconds`. */
  restartBeat?: number;
  /** The director runs only within this many metres of the barricade; default `DIRECTOR.activeRadius`. */
  radius?: number;
  /** L10 PR 2: the interior the set is fought in (M39's Keep stairs); it runs while the player is in that interior and
   * pauses in any other. Without it, any interior pauses the set (the shipped rule). */
  interior?: string;
  /**
   * N4 (Act 5 siege): at most this many wave members (not gone) plus live carts stand at once; a due spawn or cart waits
   * for a slot (the schedule's clock keeps running). Absent: every item goes out on its schedule (the shipped rule).
   */
  maxAlive?: number;
  /**
   * N4 (Act 5 siege): a fallen barricade is a breach, not a failure. `waves.breached` fires, the wave goes on (rams go
   * inert), and when it clears the barricade is patched to `patchToPct` (0..1) of its health. Absent: the shipped
   * fail-and-restart.
   */
  breach?: { patchToPct: number };
  /** N4: health a cart takes off the barricade per strike, by role; absent: `CART.impactDamage`. */
  cartImpact?: { brazier?: number; ram?: number };
  /**
   * N4 (Act 5 siege): foot spawns join their lane `metres` short of the `toward` lane's anchor (the line from their lane
   * anchor to it), so a wave whose lane heads lie past the enemies' dormancy range still comes up in reach of the gate.
   * Lanes nearer than `metres` spawn at their anchor. Absent: every spawn stands at its lane anchor (the shipped rule).
   */
  join?: { metres: number; toward: LaneKey };
}

export type RunPhase = 'running' | 'intermission' | 'done';

/** The stored shape of the `waves` persistable (version 1). */
export interface WavesSaved {
  defId: string | null;
  /** Running: the wave being fought. Intermission: the wave just cleared. Done: the last wave. */
  index: number;
  phase: RunPhase | 'idle';
  /** Barricade health at the wave's start (or, in an intermission, now); absent at full health. */
  barricade?: number;
  /** Other sets already completed; absent when none. */
  done?: string[];
}

export type StructureKind = 'cart' | 'barricade';
