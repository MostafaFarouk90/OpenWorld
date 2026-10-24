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
  | 'movement';

export type TravelResult = { ok: true } | { ok: false; reason: TravelFailure };

export interface RespawnPoint {
  waystoneId: string | null;
  feet: Vec3;
  yaw: number;
}
