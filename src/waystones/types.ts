export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type TravelFailure =
  | 'unknown'
  | 'not-lit'
  | 'same'
  | 'in-combat'
  | 'cutscene'
  | 'dialogue'
  | 'dead'
  | 'busy'
  | 'terrain-not-ready'
  /** v0.7: gliding, seated on the ferry or diving (MOVEMENT_MODE_RULES). */
  | 'movement'
  /** v0.8: the stone is dark (WAYSTONE_DARK: the occupied city's stones from M38). */
  | 'dark';

export type TravelResult = { ok: true } | { ok: false; reason: TravelFailure };

/** v0.8 item 8: a placement target a rule may replace (respawn, a load, a safe teleport). */
export interface PlacementTarget {
  feet: Vec3;
  yaw: number;
}
export type PlacementKind = 'respawn' | 'load' | 'teleport';
/** Returns a replacement target, or null to leave it. Rules run in the order added. */
export type PlacementRule = (target: PlacementTarget, kind: PlacementKind) => PlacementTarget | null;

/** v0.8: the persisted interior checkpoints (`respawn` v1): the latest set wins. */
export interface CheckpointSave {
  checkpoints: { id: string; anchorId: string }[];
}

export interface RespawnPoint {
  waystoneId: string | null;
  feet: Vec3;
  yaw: number;
}
