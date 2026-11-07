// N3 lava types on top of v0.9 (src/caldera/lava.ts). `LavaFieldDef` is v0.9's `LavaVolumeDef` plus an optional surface
// profile, so a channel can run down the inner wall instead of lying flat. N0's file is not edited.
import type { Vec3 } from '../../physics/PhysicsWorld';
import type { LavaShape, LavaVolumeDef, VentDef } from '../lava';

export interface LavaFieldDef extends LavaVolumeDef {
  /**
   * Ribbons only: the surface height at each polyline point (same length as `points`), interpolated along the line. The
   * surface at a point off the line is the height at its nearest point on the line. Absent: `surfaceY` everywhere.
   */
  profile?: readonly number[];
}

/** A vent with the crust it cools: part of one lava volume that reads as solid ground while the vent is open. */
export interface CrustVentDef extends VentDef {
  volumeId: string;
  crust: LavaShape;
}

/** What the `lava` service reports about one vent (N9's cue, N8's sound). */
export interface VentInfo {
  id: string;
  at: Vec3;
  state: 'open' | 'closed';
  /** Seconds until an open vent closes. */
  closesInS?: number;
  wheel?: string;
}

/** What the `lava` service reports about one volume. */
export interface VolumeInfo {
  id: string;
  shape: LavaShape;
  surfaceY: number;
}
