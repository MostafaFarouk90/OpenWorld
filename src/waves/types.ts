import type { EnemyKind } from '../enemies/types';

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
}

/** A brazier cart, rolling down a numbered lane toward the barricade `delay` seconds after the wave starts. */
export interface WaveCartDef {
  lane: LaneKey;
  delay: number;
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
  /** `actor.spawnTag` of every wave enemy (A12's kill objective matches it). */
  spawnTag: string;
  /** Seconds between a cleared wave and the next; default `DIRECTOR.intermissionSeconds`. */
  intermission?: number;
  /** Seconds between a failure and the restart; default `DIRECTOR.restartBeatSeconds`. */
  restartBeat?: number;
  /** The director runs only within this many metres of the barricade; default `DIRECTOR.activeRadius`. */
  radius?: number;
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
