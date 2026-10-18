import type { ActorId, EnemyHost, Team } from '../ports';

/** Brainless mortal actors that are not `EnemyKind`s: they have no Brain, mercy or Knight model. */
export type FoeKind = 'ash-scarecrow' | 'blightbloom' | 'toll-post';

/** The impact-sound materials a foe may use (`actor.data.audio.material`). */
export type FoeMaterial = 'straw' | 'wood';

export interface FoeDef {
  kind: FoeKind;
  nameKey: string;
  maxHealth: number;
  maxPoise: number;
  material: FoeMaterial;
  team: Team;
}

/** How a foe left its spawner slot (same words as the spawner registry's `MemberEnd`). */
export type FoeEnd = 'died' | 'released' | 'spared' | 'despawned';

/** A wraith the bloom asks the enemies manager to raise from a pile. */
export interface RaiseWraithRequest {
  feet: { x: number; y: number; z: number };
  yaw: number;
  /** The raising spawner's id and tag, so group-scoped logic (pack alert, save.loaded) treats it as that spawner's. */
  spawnerId: string;
  spawnTag: string;
  level: number;
  /** Called once when the wraith is gone for any reason (died, released, despawned). */
  onGone(how: FoeEnd): void;
}

/** What a foe needs from the foe manager (and, through it, the enemies manager). */
export interface FoeEnv {
  host: EnemyHost;
  rng: () => number;
  /** Once the foe is gone from the world (after despawn). */
  gone(self: unknown, how: FoeEnd): void;
  raiseWraith(req: RaiseWraithRequest): ActorId | null;
  isPileSpent(pileId: string): boolean;
  markPileSpent(pileId: string): void;
}

export interface FoeSpawnInfo {
  def: FoeDef;
  slug: string;
  spawnerId: string | null;
  spawnTag: string;
  feet: { x: number; y: number; z: number };
  yaw: number;
  level: number;
  maxHealth: number;
  damageScale: number;
  /** Pile anchor ids (the bloom). */
  piles: readonly string[];
  /** The spawner slot's anchor id (the scarecrow's `scarecrowId`). */
  anchorId: string | null;
  aggro: boolean;
}
